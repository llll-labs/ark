import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { and, count, eq, inArray, isNull, sql } from 'drizzle-orm'
import {
  arkUsers,
  arkChannels,
  arkMessagePins,
  arkMessages,
} from '../db/schema'
import { ensureDefaultArk, getPublicSpace } from '../server/utils/authorization'
import { resetDatabaseForTests, resolveDatabaseConfig, useDatabase } from '../server/utils/db'
import '../server/utils/env'

const FIXTURE = 'war-and-peace'
const SOURCE = 'gutenberg-2600'
const CHANNEL_SLUG = 'war-and-peace'
const CHANNEL_NAME = 'war-and-peace'
const GUTENBERG_URL = 'https://www.gutenberg.org/cache/epub/2600/pg2600.txt'
const BATCH_SIZE = 500
const SECOND_EPILOGUE_START = Date.UTC(1820, 11, 31, 0, 0, 0)
const TIMELINE_PRECISION = 'section'

interface ParsedParagraph {
  body: string
  chapterIndex: number
  chapterTitle: string
  isChapterFirstParagraph: boolean
  paragraphIndex: number
  timelineEndYear: number
  timelineGroupIndex: number
  timelineGroupParagraphIndex: number
  timelinePrecision: typeof TIMELINE_PRECISION
  timelineSectionTitle: string
  timelineStartYear: number
}

interface TimelineSection {
  endYear: number
  isSecondEpilogue: boolean
  startYear: number
  title: string
}

interface TimelineGroup {
  endYear: number
  isSecondEpilogue: boolean
  paragraphCount: number
  startYear: number
}

interface SeededMessage {
  chapterIndex: number
  createdAt: Date
  id: string
  paragraphIndex: number
}

type StressDb = any

function usage() {
  console.log(`Usage:
  ALLOW_STRESS_SEED=1 pnpm --filter @kurark/ark stress:seed:war-and-peace
  ALLOW_STRESS_SEED=1 pnpm --filter @kurark/ark stress:seed:war-and-peace:reset

Options:
  --reset      Soft-delete existing War and Peace fixture messages/pins first.
`)
}

function assertStressSeedAllowed() {
  if (process.argv.includes('--help') || process.argv.includes('-h')) {
    usage()
    process.exit(0)
  }

  if (process.env.ALLOW_STRESS_SEED !== '1') {
    throw new Error('Refusing to seed. Set ALLOW_STRESS_SEED=1 to confirm this heavy local fixture.')
  }

  const config = resolveDatabaseConfig()
  if (config.client === 'pglite')
    return

  const url = new URL(config.url!)
  if (!['localhost', '127.0.0.1', '::1'].includes(url.hostname)) {
    throw new Error(`Refusing to seed non-local DATABASE_URL host: ${url.hostname}`)
  }
}

function scriptDir() {
  return dirname(fileURLToPath(import.meta.url))
}

async function loadWarAndPeaceText() {
  const cachePath = resolve(scriptDir(), '../.data/stress/war-and-peace.txt')
  try {
    return await readFile(cachePath, 'utf8')
  }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT')
      throw error
  }

  console.log(`Downloading ${GUTENBERG_URL}`)
  const response = await fetch(GUTENBERG_URL, {
    headers: {
      'user-agent': '@kurark/ark stress seed (local development)',
    },
  })
  if (!response.ok)
    throw new Error(`Failed to download War and Peace: HTTP ${response.status}`)

  const text = await response.text()
  await mkdir(dirname(cachePath), { recursive: true })
  await writeFile(cachePath, text)
  return text
}

function stripGutenbergEnvelope(text: string) {
  const normalized = text.replace(/\r\n/g, '\n')
  const startMatch = normalized.match(/\*\*\* START OF (?:THE|THIS) PROJECT GUTENBERG EBOOK[^\n]*\*\*\*/i)
  const endMatch = normalized.match(/\*\*\* END OF (?:THE|THIS) PROJECT GUTENBERG EBOOK[^\n]*\*\*\*/i)
  return normalized.slice(
    startMatch ? startMatch.index! + startMatch[0].length : 0,
    endMatch ? endMatch.index : normalized.length,
  )
}

function normalizeParagraph(value: string) {
  return value
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n+/g, ' ')
    .replace(/[ \t]{2,}/g, ' ')
    .trim()
}

function expandTimelineEndYear(startYear: number, rawEndYear?: string) {
  if (!rawEndYear)
    return startYear

  if (rawEndYear.length === 4)
    return Number(rawEndYear)

  const century = Math.floor(startYear / 100) * 100
  const expanded = century + Number(rawEndYear)
  return expanded < startYear ? expanded + 100 : expanded
}

function parseTimelineSectionHeading(value: string): TimelineSection | null {
  const datedMatch = value.match(/^(BOOK\s[^:]+|FIRST EPILOGUE):\s*(\d{4})(?:\s*-\s*(\d{2,4}))?$/i)
  if (datedMatch) {
    const startYear = Number(datedMatch[2])
    return {
      endYear: expandTimelineEndYear(startYear, datedMatch[3]),
      isSecondEpilogue: false,
      startYear,
      title: value,
    }
  }

  if (/^SECOND EPILOGUE$/i.test(value)) {
    return {
      endYear: 1820,
      isSecondEpilogue: true,
      startYear: 1820,
      title: value,
    }
  }

  return null
}

function isChapterHeading(value: string) {
  return /^CHAPTER\s+[IVXLCDM]+\b/i.test(value)
}

function startsNewTimelineGroup(previous: TimelineSection | null, next: TimelineSection) {
  if (!previous)
    return true
  if (previous.isSecondEpilogue || next.isSecondEpilogue)
    return true
  return previous.startYear !== next.startYear
}

function parseWarAndPeace(text: string): ParsedParagraph[] {
  const body = stripGutenbergEnvelope(text)
  const paragraphs: ParsedParagraph[] = []
  let currentSection: TimelineSection | null = null
  let currentChapter = ''
  let chapterIndex = 0
  let paragraphIndex = 0
  let pendingLines: string[] = []
  let chapterHasParagraph = false
  let timelineGroupIndex = 0
  let timelineGroupParagraphIndex = 0

  function flushParagraph() {
    const paragraph = normalizeParagraph(pendingLines.join('\n'))
    pendingLines = []
    if (!paragraph || !currentChapter || !currentSection)
      return

    paragraphIndex += 1
    timelineGroupParagraphIndex += 1
    paragraphs.push({
      body: paragraph,
      chapterIndex,
      chapterTitle: currentChapter,
      isChapterFirstParagraph: !chapterHasParagraph,
      paragraphIndex,
      timelineEndYear: currentSection.endYear,
      timelineGroupIndex,
      timelineGroupParagraphIndex,
      timelinePrecision: TIMELINE_PRECISION,
      timelineSectionTitle: currentSection.title,
      timelineStartYear: currentSection.startYear,
    })
    chapterHasParagraph = true
  }

  for (const rawLine of body.split('\n')) {
    const line = rawLine.trim()
    const isRealHeading = line.length > 0 && rawLine === line

    if (!line) {
      flushParagraph()
      continue
    }

    const section = isRealHeading ? parseTimelineSectionHeading(line) : null
    if (section) {
      flushParagraph()
      if (startsNewTimelineGroup(currentSection, section)) {
        timelineGroupIndex += 1
        timelineGroupParagraphIndex = 0
      }
      currentSection = section
      currentChapter = ''
      chapterHasParagraph = false
      continue
    }

    if (isRealHeading && isChapterHeading(line)) {
      flushParagraph()
      chapterIndex += 1
      currentChapter = currentSection ? `${currentSection.title} - ${line}` : line
      chapterHasParagraph = false
      continue
    }

    pendingLines.push(line)
  }

  flushParagraph()

  if (paragraphs.length < 1000 || chapterIndex < 50) {
    throw new Error(`Parsed too little text for a stress fixture: ${paragraphs.length} paragraphs, ${chapterIndex} chapters.`)
  }

  return paragraphs
}

function timelineGroups(paragraphs: ParsedParagraph[]) {
  const groups = new Map<number, TimelineGroup>()
  for (const paragraph of paragraphs) {
    const existing = groups.get(paragraph.timelineGroupIndex)
    if (existing) {
      existing.endYear = Math.max(existing.endYear, paragraph.timelineEndYear)
      existing.paragraphCount += 1
      continue
    }

    groups.set(paragraph.timelineGroupIndex, {
      endYear: paragraph.timelineEndYear,
      isSecondEpilogue: paragraph.timelineSectionTitle === 'SECOND EPILOGUE',
      paragraphCount: 1,
      startYear: paragraph.timelineStartYear,
    })
  }
  return groups
}

function yearStart(year: number) {
  return Date.UTC(year, 0, 1, 0, 0, 0)
}

function historicalCreatedAt(paragraph: ParsedParagraph, groups: Map<number, TimelineGroup>) {
  const group = groups.get(paragraph.timelineGroupIndex)
  if (!group)
    throw new Error(`Missing timeline group ${paragraph.timelineGroupIndex}.`)

  if (group.isSecondEpilogue)
    return new Date(SECOND_EPILOGUE_START + (paragraph.timelineGroupParagraphIndex - 1) * 1000)

  const nextGroup = groups.get(paragraph.timelineGroupIndex + 1)
  const declaredEndExclusiveYear = group.endYear + 1
  const endExclusiveYear = nextGroup && !nextGroup.isSecondEpilogue
    ? Math.min(declaredEndExclusiveYear, nextGroup.startYear)
    : declaredEndExclusiveYear
  const start = yearStart(group.startYear)
  const end = nextGroup?.isSecondEpilogue
    ? SECOND_EPILOGUE_START
    : yearStart(Math.max(endExclusiveYear, group.startYear + 1))
  const duration = Math.max(end - start - 1, group.paragraphCount)
  const index = paragraph.timelineGroupParagraphIndex - 1
  const offset = Math.floor((duration * index) / group.paragraphCount) + (paragraph.paragraphIndex % 1000)
  return new Date(start + offset)
}

function chunk<T>(items: T[], size: number) {
  const chunks: T[][] = []
  for (let index = 0; index < items.length; index += size)
    chunks.push(items.slice(index, index + size))
  return chunks
}

async function fixtureMessageIds(db: StressDb, channelId: string): Promise<string[]> {
  const rows: Array<{ id: string }> = await db
    .select({ id: arkMessages.id })
    .from(arkMessages)
    .where(and(
      eq(arkMessages.channelId, channelId),
      sql`${arkMessages.bodyJson}->>'fixture' = ${FIXTURE}`,
      isNull(arkMessages.deletedAt),
    ))
  return rows.map(row => row.id)
}

async function activeMessageCount(db: StressDb, channelId: string) {
  const [row] = await db
    .select({ value: count() })
    .from(arkMessages)
    .where(and(
      eq(arkMessages.channelId, channelId),
      isNull(arkMessages.deletedAt),
    ))
  return Number(row?.value ?? 0)
}

async function resetFixture(db: StressDb, channelId: string) {
  const ids = await fixtureMessageIds(db, channelId)
  if (!ids.length)
    return 0

  const now = new Date()
  for (const idsChunk of chunk(ids, BATCH_SIZE)) {
    await db.update(arkMessagePins).set({
      deletedAt: now,
      updatedAt: now,
    }).where(and(
      eq(arkMessagePins.channelId, channelId),
      inArray(arkMessagePins.messageId, idsChunk),
      isNull(arkMessagePins.deletedAt),
    ))
    await db.update(arkMessages).set({
      deletedAt: now,
      updatedAt: now,
    }).where(and(
      inArray(arkMessages.id, idsChunk),
      isNull(arkMessages.deletedAt),
    ))
  }
  return ids.length
}

async function ensureStressChannel(db: StressDb) {
  await ensureDefaultArk()
  const root = await getPublicSpace()
  if (!root)
    throw new Error('Default public space was not created.')

  const [existing] = await db.select().from(arkChannels).where(and(
    eq(arkChannels.spaceId, root.id),
    eq(arkChannels.slug, CHANNEL_SLUG),
    isNull(arkChannels.deletedAt),
  )).limit(1)
  if (existing)
    return existing

  const [channel] = await db.insert(arkChannels).values({
    configJson: {
      fixture: FIXTURE,
      source: SOURCE,
      stress: true,
    },
    kind: 'chat',
    name: CHANNEL_NAME,
    slug: CHANNEL_SLUG,
    spaceId: root.id,
    topic: 'War and Peace stress-test channel',
    visibility: 'registered',
  }).returning()
  if (!channel)
    throw new Error('War and Peace channel could not be created.')
  return channel
}

async function stressAuthorId(db: StressDb) {
  const [existing] = await db.select().from(arkUsers).where(and(
    eq(arkUsers.kind, 'system'),
    eq(arkUsers.handle, 'war-and-peace-fixture'),
  )).limit(1)
  if (existing)
    return existing.id

  const [created] = await db.insert(arkUsers).values({
    displayName: 'War and Peace Fixture',
    handle: 'war-and-peace-fixture',
    kind: 'system',
    profileJson: {
      fixture: FIXTURE,
      source: SOURCE,
    },
  }).onConflictDoNothing().returning()
  if (created)
    return created.id

  const [raceWinner] = await db.select().from(arkUsers).where(and(
    eq(arkUsers.kind, 'system'),
    eq(arkUsers.handle, 'war-and-peace-fixture'),
  )).limit(1)
  return raceWinner?.id ?? null
}

async function seedMessages(db: StressDb, channel: typeof arkChannels.$inferSelect, paragraphs: ParsedParagraph[]) {
  const authorArkUserId = await stressAuthorId(db)
  const groups = timelineGroups(paragraphs)
  const inserted: SeededMessage[] = []

  for (const paragraphsChunk of chunk(paragraphs, BATCH_SIZE)) {
    const values = paragraphsChunk.map((paragraph) => {
      const createdAt = historicalCreatedAt(paragraph, groups)
      return {
        authorArkUserId,
        body: paragraph.body,
        bodyJson: {
          chapterIndex: paragraph.chapterIndex,
          chapterTitle: paragraph.chapterTitle,
          fixture: FIXTURE,
          paragraphIndex: paragraph.paragraphIndex,
          source: SOURCE,
          timelineEndYear: paragraph.timelineEndYear,
          timelinePrecision: paragraph.timelinePrecision,
          timelineSectionTitle: paragraph.timelineSectionTitle,
          timelineStartYear: paragraph.timelineStartYear,
        },
        channelId: channel.id,
        createdAt,
        spaceId: channel.spaceId,
        updatedAt: createdAt,
      }
    })

    const rows = await db.insert(arkMessages).values(values).returning({
      bodyJson: arkMessages.bodyJson,
      createdAt: arkMessages.createdAt,
      id: arkMessages.id,
    })
    for (const row of rows) {
      const metadata = row.bodyJson as { chapterIndex?: number, paragraphIndex?: number }
      inserted.push({
        chapterIndex: Number(metadata.chapterIndex),
        createdAt: row.createdAt,
        id: row.id,
        paragraphIndex: Number(metadata.paragraphIndex),
      })
    }
    console.log(`Inserted ${inserted.length}/${paragraphs.length} messages`)
  }

  return inserted
}

async function seedPins(db: StressDb, channelId: string, seededMessages: SeededMessage[]) {
  const firstMessageByChapter = new Map<number, SeededMessage>()
  for (const message of seededMessages) {
    const existing = firstMessageByChapter.get(message.chapterIndex)
    if (!existing || message.paragraphIndex < existing.paragraphIndex)
      firstMessageByChapter.set(message.chapterIndex, message)
  }

  const pinValues = Array.from(firstMessageByChapter.values()).map(message => ({
    channelId,
    createdAt: message.createdAt,
    messageId: message.id,
    updatedAt: message.createdAt,
  }))

  let inserted = 0
  for (const pinsChunk of chunk(pinValues, BATCH_SIZE)) {
    const rows = await db.insert(arkMessagePins).values(pinsChunk).onConflictDoNothing().returning({ id: arkMessagePins.id })
    inserted += rows.length
  }
  return inserted
}

async function main() {
  assertStressSeedAllowed()

  const reset = process.argv.includes('--reset')
  const db = useDatabase()
  const channel = await ensureStressChannel(db)

  if (reset) {
    const resetCount = await resetFixture(db, channel.id)
    console.log(`Soft-deleted ${resetCount} existing fixture messages.`)
  }

  const existingFixtureIds = await fixtureMessageIds(db, channel.id)
  if (existingFixtureIds.length) {
    console.log(`Fixture already exists in #${CHANNEL_SLUG}: ${existingFixtureIds.length} active messages. Use --reset to reseed.`)
    return
  }

  const text = await loadWarAndPeaceText()
  const paragraphs = parseWarAndPeace(text)
  console.log(`Parsed ${paragraphs.length} paragraphs across ${new Set(paragraphs.map(paragraph => paragraph.chapterIndex)).size} chapters.`)

  const seededMessages = await seedMessages(db, channel, paragraphs)
  const pinnedCount = await seedPins(db, channel.id, seededMessages)
  const messagesCount = await activeMessageCount(db, channel.id)
  const latestMessage = seededMessages[seededMessages.length - 1]
  await db.update(arkChannels).set({
    lastMessageAt: latestMessage?.createdAt ?? new Date(),
    lastMessagePreview: paragraphs[paragraphs.length - 1]?.body.slice(0, 180) ?? 'War and Peace',
    messagesCount,
    updatedAt: new Date(),
  }).where(eq(arkChannels.id, channel.id))

  console.log(JSON.stringify({
    channelId: channel.id,
    channelSlug: CHANNEL_SLUG,
    messages: seededMessages.length,
    pins: pinnedCount,
  }, null, 2))
}

main()
  .then(async () => {
    await resetDatabaseForTests()
    process.exit(0)
  })
  .catch(async (error) => {
    console.error(error instanceof Error ? error.stack || error.message : error)
    await resetDatabaseForTests().catch(() => null)
    process.exit(1)
  })
