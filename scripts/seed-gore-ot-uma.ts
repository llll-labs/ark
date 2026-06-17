import { Buffer } from 'node:buffer'
import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { and, count, eq, inArray, isNull, sql } from 'drizzle-orm'
import {
  arkUsers,
  arkChannels,
  arkFiles,
  arkMessagePins,
  arkMessages,
} from '../db/schema'
import { ensureDefaultArk, getPublicSpace } from '../server/utils/authorization'
import { resetDatabaseForTests, resolveDatabaseConfig, useDatabase } from '../server/utils/db'
import { defaultPrivateStorage, putStoredObject } from '../server/utils/storage'
import { uuidv7 } from '../server/utils/uuid'
import '../server/utils/env'

const FIXTURE = 'gore-ot-uma'
const SOURCE = 'wikisource-gore-ot-uma-pss-1911'
const CHANNEL_SLUG = 'gore-ot-uma'
const CHANNEL_NAME = 'Горе от ума'
const BATCH_SIZE = 500
const TIMELINE_PRECISION = 'act'
const COMMONS_AVATAR_WIDTH = 180
const COMMONS_MESSAGE_IMAGE_WIDTH = 900

const SPEAKER_AVATAR_FILES: Record<string, string> = {
  '1-я княжна': 'Кардовский, Горе от ума 15.jpg',
  '2-я княжна': 'Кардовский, Горе от ума 15.jpg',
  '3-я княжна': 'Кардовский, Горе от ума 15.jpg',
  '4-я княжна': 'Кардовский, Горе от ума 15.jpg',
  '5-я княжна': 'Кардовский, Горе от ума 15.jpg',
  '6-я княжна': 'Кардовский, Горе от ума 15.jpg',
  'Все': 'Woe from Wit 01 (Kardovsky).jpg',
  'Все вместе': 'Woe from Wit 01 (Kardovsky).jpg',
  'Графиня-бабушка': 'Кардовский, Горе от ума 10.jpg',
  'Графиня-внучка': 'Кардовский, Горе от ума 11.jpg',
  'Загорецкий': 'Кардовский, Горе от ума 14.jpg',
  'Княгиня': 'Кардовский, Горе от ума 15.jpg',
  'Князь': 'Кардовский, Горе от ума 15.jpg',
  'Лакей': 'Woe from Wit 02 (Kardovsky).jpg',
  'Лиза': 'Кардовский Горе от ума. Лиза.jpg',
  'Лиза и София': 'Кардовский, Горе от ума.jpg',
  'Молчалин': 'Кардовский Горе от ума. Молчалин.jpg',
  'Наталья Дмитриевна': 'Кардовский Горе от ума. Наталья Дмитриевна.jpg',
  'Платон Михайлович': 'Кардовский, Горе от ума 6.jpg',
  'Репетилов': 'Кардовский, Горе от ума 16.jpg',
  'Скалозуб': 'Кардовский, Горе от ума 7.jpg',
  'Слуга': 'Woe from Wit 02 (Kardovsky).jpg',
  'София': 'Кардовский, Горе от ума.jpg',
  'Фамусов': 'Кардовский Горе от ума. Фамусов.jpg',
  'Хлёстова': 'Кардовский, Горе от ума 12.jpg',
  'Чацкий': 'Кардовский Горе от ума. Чацкий.jpg',
  'г. D': 'Кардовский, Горе от ума 8.jpg',
  'г. N': 'Кардовский, Горе от ума 9.jpg',
}

const COMMONS_THUMB_URLS: Record<string, string> = {
  'Кардовский Горе от ума. Лиза.jpg': 'https://upload.wikimedia.org/wikipedia/commons/thumb/c/c7/%D0%9A%D0%B0%D1%80%D0%B4%D0%BE%D0%B2%D1%81%D0%BA%D0%B8%D0%B9_%D0%93%D0%BE%D1%80%D0%B5_%D0%BE%D1%82_%D1%83%D0%BC%D0%B0._%D0%9B%D0%B8%D0%B7%D0%B0.jpg/250px-%D0%9A%D0%B0%D1%80%D0%B4%D0%BE%D0%B2%D1%81%D0%BA%D0%B8%D0%B9_%D0%93%D0%BE%D1%80%D0%B5_%D0%BE%D1%82_%D1%83%D0%BC%D0%B0._%D0%9B%D0%B8%D0%B7%D0%B0.jpg',
  'Кардовский Горе от ума. Молчалин.jpg': 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/a9/%D0%9A%D0%B0%D1%80%D0%B4%D0%BE%D0%B2%D1%81%D0%BA%D0%B8%D0%B9_%D0%93%D0%BE%D1%80%D0%B5_%D0%BE%D1%82_%D1%83%D0%BC%D0%B0._%D0%9C%D0%BE%D0%BB%D1%87%D0%B0%D0%BB%D0%B8%D0%BD.jpg/250px-%D0%9A%D0%B0%D1%80%D0%B4%D0%BE%D0%B2%D1%81%D0%BA%D0%B8%D0%B9_%D0%93%D0%BE%D1%80%D0%B5_%D0%BE%D1%82_%D1%83%D0%BC%D0%B0._%D0%9C%D0%BE%D0%BB%D1%87%D0%B0%D0%BB%D0%B8%D0%BD.jpg',
  'Кардовский Горе от ума. Наталья Дмитриевна.jpg': 'https://upload.wikimedia.org/wikipedia/commons/thumb/5/56/%D0%9A%D0%B0%D1%80%D0%B4%D0%BE%D0%B2%D1%81%D0%BA%D0%B8%D0%B9_%D0%93%D0%BE%D1%80%D0%B5_%D0%BE%D1%82_%D1%83%D0%BC%D0%B0._%D0%9D%D0%B0%D1%82%D0%B0%D0%BB%D1%8C%D1%8F_%D0%94%D0%BC%D0%B8%D1%82%D1%80%D0%B8%D0%B5%D0%B2%D0%BD%D0%B0.jpg/250px-%D0%9A%D0%B0%D1%80%D0%B4%D0%BE%D0%B2%D1%81%D0%BA%D0%B8%D0%B9_%D0%93%D0%BE%D1%80%D0%B5_%D0%BE%D1%82_%D1%83%D0%BC%D0%B0._%D0%9D%D0%B0%D1%82%D0%B0%D0%BB%D1%8C%D1%8F_%D0%94%D0%BC%D0%B8%D1%82%D1%80%D0%B8%D0%B5%D0%B2%D0%BD%D0%B0.jpg',
  'Кардовский Горе от ума. Фамусов.jpg': 'https://upload.wikimedia.org/wikipedia/commons/thumb/0/09/%D0%9A%D0%B0%D1%80%D0%B4%D0%BE%D0%B2%D1%81%D0%BA%D0%B8%D0%B9_%D0%93%D0%BE%D1%80%D0%B5_%D0%BE%D1%82_%D1%83%D0%BC%D0%B0._%D0%A4%D0%B0%D0%BC%D1%83%D1%81%D0%BE%D0%B2.jpg/250px-%D0%9A%D0%B0%D1%80%D0%B4%D0%BE%D0%B2%D1%81%D0%BA%D0%B8%D0%B9_%D0%93%D0%BE%D1%80%D0%B5_%D0%BE%D1%82_%D1%83%D0%BC%D0%B0._%D0%A4%D0%B0%D0%BC%D1%83%D1%81%D0%BE%D0%B2.jpg',
  'Кардовский Горе от ума. Чацкий.jpg': 'https://upload.wikimedia.org/wikipedia/commons/thumb/d/d4/%D0%9A%D0%B0%D1%80%D0%B4%D0%BE%D0%B2%D1%81%D0%BA%D0%B8%D0%B9_%D0%93%D0%BE%D1%80%D0%B5_%D0%BE%D1%82_%D1%83%D0%BC%D0%B0._%D0%A7%D0%B0%D1%86%D0%BA%D0%B8%D0%B9.jpg/250px-%D0%9A%D0%B0%D1%80%D0%B4%D0%BE%D0%B2%D1%81%D0%BA%D0%B8%D0%B9_%D0%93%D0%BE%D1%80%D0%B5_%D0%BE%D1%82_%D1%83%D0%BC%D0%B0._%D0%A7%D0%B0%D1%86%D0%BA%D0%B8%D0%B9.jpg',
  'Кардовский, Горе от ума 10.jpg': 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/ad/%D0%9A%D0%B0%D1%80%D0%B4%D0%BE%D0%B2%D1%81%D0%BA%D0%B8%D0%B9%2C_%D0%93%D0%BE%D1%80%D0%B5_%D0%BE%D1%82_%D1%83%D0%BC%D0%B0_10.jpg/250px-%D0%9A%D0%B0%D1%80%D0%B4%D0%BE%D0%B2%D1%81%D0%BA%D0%B8%D0%B9%2C_%D0%93%D0%BE%D1%80%D0%B5_%D0%BE%D1%82_%D1%83%D0%BC%D0%B0_10.jpg',
  'Кардовский, Горе от ума 11.jpg': 'https://upload.wikimedia.org/wikipedia/commons/thumb/d/d2/%D0%9A%D0%B0%D1%80%D0%B4%D0%BE%D0%B2%D1%81%D0%BA%D0%B8%D0%B9%2C_%D0%93%D0%BE%D1%80%D0%B5_%D0%BE%D1%82_%D1%83%D0%BC%D0%B0_11.jpg/250px-%D0%9A%D0%B0%D1%80%D0%B4%D0%BE%D0%B2%D1%81%D0%BA%D0%B8%D0%B9%2C_%D0%93%D0%BE%D1%80%D0%B5_%D0%BE%D1%82_%D1%83%D0%BC%D0%B0_11.jpg',
  'Кардовский, Горе от ума 12.jpg': 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/a4/%D0%9A%D0%B0%D1%80%D0%B4%D0%BE%D0%B2%D1%81%D0%BA%D0%B8%D0%B9%2C_%D0%93%D0%BE%D1%80%D0%B5_%D0%BE%D1%82_%D1%83%D0%BC%D0%B0_12.jpg/250px-%D0%9A%D0%B0%D1%80%D0%B4%D0%BE%D0%B2%D1%81%D0%BA%D0%B8%D0%B9%2C_%D0%93%D0%BE%D1%80%D0%B5_%D0%BE%D1%82_%D1%83%D0%BC%D0%B0_12.jpg',
  'Кардовский, Горе от ума 14.jpg': 'https://upload.wikimedia.org/wikipedia/commons/thumb/5/53/%D0%9A%D0%B0%D1%80%D0%B4%D0%BE%D0%B2%D1%81%D0%BA%D0%B8%D0%B9%2C_%D0%93%D0%BE%D1%80%D0%B5_%D0%BE%D1%82_%D1%83%D0%BC%D0%B0_14.jpg/250px-%D0%9A%D0%B0%D1%80%D0%B4%D0%BE%D0%B2%D1%81%D0%BA%D0%B8%D0%B9%2C_%D0%93%D0%BE%D1%80%D0%B5_%D0%BE%D1%82_%D1%83%D0%BC%D0%B0_14.jpg',
  'Кардовский, Горе от ума 15.jpg': 'https://upload.wikimedia.org/wikipedia/commons/thumb/4/4c/%D0%9A%D0%B0%D1%80%D0%B4%D0%BE%D0%B2%D1%81%D0%BA%D0%B8%D0%B9%2C_%D0%93%D0%BE%D1%80%D0%B5_%D0%BE%D1%82_%D1%83%D0%BC%D0%B0_15.jpg/250px-%D0%9A%D0%B0%D1%80%D0%B4%D0%BE%D0%B2%D1%81%D0%BA%D0%B8%D0%B9%2C_%D0%93%D0%BE%D1%80%D0%B5_%D0%BE%D1%82_%D1%83%D0%BC%D0%B0_15.jpg',
  'Кардовский, Горе от ума 16.jpg': 'https://upload.wikimedia.org/wikipedia/commons/thumb/6/68/%D0%9A%D0%B0%D1%80%D0%B4%D0%BE%D0%B2%D1%81%D0%BA%D0%B8%D0%B9%2C_%D0%93%D0%BE%D1%80%D0%B5_%D0%BE%D1%82_%D1%83%D0%BC%D0%B0_16.jpg/250px-%D0%9A%D0%B0%D1%80%D0%B4%D0%BE%D0%B2%D1%81%D0%BA%D0%B8%D0%B9%2C_%D0%93%D0%BE%D1%80%D0%B5_%D0%BE%D1%82_%D1%83%D0%BC%D0%B0_16.jpg',
  'Кардовский, Горе от ума 6.jpg': 'https://upload.wikimedia.org/wikipedia/commons/thumb/7/7d/%D0%9A%D0%B0%D1%80%D0%B4%D0%BE%D0%B2%D1%81%D0%BA%D0%B8%D0%B9%2C_%D0%93%D0%BE%D1%80%D0%B5_%D0%BE%D1%82_%D1%83%D0%BC%D0%B0_6.jpg/250px-%D0%9A%D0%B0%D1%80%D0%B4%D0%BE%D0%B2%D1%81%D0%BA%D0%B8%D0%B9%2C_%D0%93%D0%BE%D1%80%D0%B5_%D0%BE%D1%82_%D1%83%D0%BC%D0%B0_6.jpg',
  'Кардовский, Горе от ума 7.jpg': 'https://upload.wikimedia.org/wikipedia/commons/thumb/8/8c/%D0%9A%D0%B0%D1%80%D0%B4%D0%BE%D0%B2%D1%81%D0%BA%D0%B8%D0%B9%2C_%D0%93%D0%BE%D1%80%D0%B5_%D0%BE%D1%82_%D1%83%D0%BC%D0%B0_7.jpg/250px-%D0%9A%D0%B0%D1%80%D0%B4%D0%BE%D0%B2%D1%81%D0%BA%D0%B8%D0%B9%2C_%D0%93%D0%BE%D1%80%D0%B5_%D0%BE%D1%82_%D1%83%D0%BC%D0%B0_7.jpg',
  'Кардовский, Горе от ума 8.jpg': 'https://upload.wikimedia.org/wikipedia/commons/thumb/e/ef/%D0%9A%D0%B0%D1%80%D0%B4%D0%BE%D0%B2%D1%81%D0%BA%D0%B8%D0%B9%2C_%D0%93%D0%BE%D1%80%D0%B5_%D0%BE%D1%82_%D1%83%D0%BC%D0%B0_8.jpg/250px-%D0%9A%D0%B0%D1%80%D0%B4%D0%BE%D0%B2%D1%81%D0%BA%D0%B8%D0%B9%2C_%D0%93%D0%BE%D1%80%D0%B5_%D0%BE%D1%82_%D1%83%D0%BC%D0%B0_8.jpg',
  'Кардовский, Горе от ума 9.jpg': 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/ac/%D0%9A%D0%B0%D1%80%D0%B4%D0%BE%D0%B2%D1%81%D0%BA%D0%B8%D0%B9%2C_%D0%93%D0%BE%D1%80%D0%B5_%D0%BE%D1%82_%D1%83%D0%BC%D0%B0_9.jpg/250px-%D0%9A%D0%B0%D1%80%D0%B4%D0%BE%D0%B2%D1%81%D0%BA%D0%B8%D0%B9%2C_%D0%93%D0%BE%D1%80%D0%B5_%D0%BE%D1%82_%D1%83%D0%BC%D0%B0_9.jpg',
  'Кардовский, Горе от ума.jpg': 'https://upload.wikimedia.org/wikipedia/commons/thumb/b/b8/%D0%9A%D0%B0%D1%80%D0%B4%D0%BE%D0%B2%D1%81%D0%BA%D0%B8%D0%B9%2C_%D0%93%D0%BE%D1%80%D0%B5_%D0%BE%D1%82_%D1%83%D0%BC%D0%B0.jpg/250px-%D0%9A%D0%B0%D1%80%D0%B4%D0%BE%D0%B2%D1%81%D0%BA%D0%B8%D0%B9%2C_%D0%93%D0%BE%D1%80%D0%B5_%D0%BE%D1%82_%D1%83%D0%BC%D0%B0.jpg',
  'Woe from Wit 01 (Kardovsky).jpg': 'https://upload.wikimedia.org/wikipedia/commons/thumb/5/50/Woe_from_Wit_01_%28Kardovsky%29.jpg/250px-Woe_from_Wit_01_%28Kardovsky%29.jpg',
  'Woe from Wit 02 (Kardovsky).jpg': 'https://upload.wikimedia.org/wikipedia/commons/thumb/4/48/Woe_from_Wit_02_%28Kardovsky%29.jpg/250px-Woe_from_Wit_02_%28Kardovsky%29.jpg',
}

const COMMONS_ILLUSTRATION_FILES = [
  'Woe from Wit 01 (Kardovsky).jpg',
  'Woe from Wit 02 (Kardovsky).jpg',
  'Кардовский Горе от ума. Лиза 2.jpg',
  'Кардовский Горе от ума. Лиза, Фамусов 2.jpg',
  'Кардовский Горе от ума. Лиза, Фамусов.jpg',
  'Кардовский Горе от ума. Лиза.jpg',
  'Кардовский Горе от ума. Молчалин.jpg',
  'Кардовский Горе от ума. Наталья Дмитриевна.jpg',
  'Кардовский Горе от ума. Фамусов 2.jpg',
  'Кардовский Горе от ума. Фамусов.jpg',
  'Кардовский Горе от ума. Чацкий.jpg',
  'Кардовский, Горе от ума 2.jpg',
  'Кардовский, Горе от ума 3.jpg',
  'Кардовский, Горе от ума 4.jpg',
  'Кардовский, Горе от ума 5.jpg',
  'Кардовский, Горе от ума 6.jpg',
  'Кардовский, Горе от ума 7.jpg',
  'Кардовский, Горе от ума 8.jpg',
  'Кардовский, Горе от ума 9.jpg',
  'Кардовский, Горе от ума 10.jpg',
  'Кардовский, Горе от ума 11.jpg',
  'Кардовский, Горе от ума 12.jpg',
  'Кардовский, Горе от ума 13.jpg',
  'Кардовский, Горе от ума 14.jpg',
  'Кардовский, Горе от ума 15.jpg',
  'Кардовский, Горе от ума 16.jpg',
  'Кардовский, Горе от ума.jpg',
] as const

const ACTS = [
  {
    endAt: Date.UTC(1822, 0, 1, 10, 0, 0),
    index: 1,
    roman: 'I',
    startAt: Date.UTC(1822, 0, 1, 6, 0, 0),
    title: 'ДЕЙСТВИЕ ПЕРВОЕ',
  },
  {
    endAt: Date.UTC(1822, 0, 1, 15, 0, 0),
    index: 2,
    roman: 'II',
    startAt: Date.UTC(1822, 0, 1, 10, 0, 0),
    title: 'ДЕЙСТВИЕ ВТОРОЕ',
  },
  {
    endAt: Date.UTC(1822, 0, 1, 23, 0, 0),
    index: 3,
    roman: 'III',
    startAt: Date.UTC(1822, 0, 1, 18, 0, 0),
    title: 'ДЕЙСТВИЕ ТРЕТЬЕ',
  },
  {
    endAt: Date.UTC(1822, 0, 2, 2, 0, 0),
    index: 4,
    roman: 'IV',
    startAt: Date.UTC(1822, 0, 1, 23, 0, 0),
    title: 'ДЕЙСТВИЕ ЧЕТВЕРТОЕ',
  },
] as const

interface RawAct {
  index: number
  roman: string
  text: string
  title: string
  url: string
}

interface ParsedPlayMessage {
  actIndex: number
  actMessageIndex: number
  actTitle: string
  body: string
  messageIndex: number
  sceneIndex: number
  sceneTitle: string
  speaker: string
  stageDirection?: string
  timelineEndYear: number
  timelinePrecision: typeof TIMELINE_PRECISION
  timelineSectionTitle: string
  timelineStartYear: number
  type: 'speech'
}

interface SeededMessage {
  createdAt: Date
  id: string
  messageIndex: number
  sceneKey: string
}

type StressDb = any
type FixtureFileRow = typeof arkFiles.$inferSelect
let illustrationSourceUrlCache: Map<string, string> | null = null

function usage() {
  console.log(`Usage:
  ALLOW_STRESS_SEED=1 pnpm --filter @kurark/ark stress:seed:gore-ot-uma
  ALLOW_STRESS_SEED=1 pnpm --filter @kurark/ark stress:seed:gore-ot-uma:reset

Options:
  --reset      Soft-delete existing Gore ot Uma fixture messages/pins first.
`)
}

function assertStressSeedAllowed() {
  if (process.argv.includes('--help') || process.argv.includes('-h')) {
    usage()
    process.exit(0)
  }

  if (process.env.ALLOW_STRESS_SEED !== '1') {
    throw new Error('Refusing to seed. Set ALLOW_STRESS_SEED=1 to confirm this local fixture.')
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

function rawActUrl(roman: string) {
  const title = encodeURIComponent(`Горе от ума (Грибоедов)/ПСС 1911 (ВТ)/Действие ${roman}`)
  return `https://ru.wikisource.org/w/index.php?title=${title}&action=raw`
}

async function loadGoreOtUmaText(): Promise<RawAct[]> {
  const cachePath = resolve(scriptDir(), '../.data/stress/gore-ot-uma.raw.json')
  try {
    return JSON.parse(await readFile(cachePath, 'utf8')) as RawAct[]
  }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT')
      throw error
  }

  const rawActs: RawAct[] = []
  for (const act of ACTS) {
    const url = rawActUrl(act.roman)
    console.log(`Downloading ${url}`)
    const response = await fetch(url, {
      headers: {
        'user-agent': '@kurark/ark stress seed (local development)',
      },
    })
    if (!response.ok)
      throw new Error(`Failed to download Gore ot Uma act ${act.roman}: HTTP ${response.status}`)

    rawActs.push({
      index: act.index,
      roman: act.roman,
      text: await response.text(),
      title: act.title,
      url,
    })
  }

  await mkdir(dirname(cachePath), { recursive: true })
  await writeFile(cachePath, JSON.stringify(rawActs, null, 2))
  return rawActs
}

function decodeEntities(value: string) {
  return value
    .replace(/&nbsp;/g, ' ')
    .replace(/&mdash;/g, '—')
    .replace(/&laquo;/g, '«')
    .replace(/&raquo;/g, '»')
    .replace(/&amp;/g, '&')
}

function cleanWikiText(value: string) {
  let text = decodeEntities(value)
  text = text.replace(/\[\[Файл:[^\]]+\]\]/g, '')
  text = text.replace(/\[\[[^|\]]+\|([^\]]+)\]\]/g, '$1')
  text = text.replace(/\[\[([^\]]+)\]\]/g, '$1')
  text = text.replace(/\{\{№\|[^}]+\}\}/g, '')
  text = text.replace(/\{\{indent\|[^}]+\}\}/g, '')
  text = text.replace(/\{\{(?:razr2?|lang|nobr)\|([^{}]*)\}\}/g, '$1')
  text = text.replace(/\{\{[^{}]+\}\}/g, '')
  text = text.replace(/'{2,}/g, '')
  text = text.replace(/<[^>]+>/g, '')
  return text.replace(/[ \t]{2,}/g, ' ').trim()
}

function remText(line: string) {
  const match = line.match(/^\{\{rem\|([\s\S]*)\}\}$/)
  return match ? cleanWikiText(match[1]!) : null
}

function reMarker(line: string) {
  const match = line.match(/^\{\{[Rr]e\|([^|}]*)(?:\|([^}]*))?\}\}$/)
  if (!match)
    return null
  return {
    direction: cleanWikiText(match[2] ?? ''),
    speaker: cleanWikiText(match[1] ?? ''),
  }
}

function normalizeSpeaker(value: string) {
  const clean = value.replace(/\s+/g, ' ').trim()
  if (!clean || clean.toLowerCase().startsWith('конец'))
    return null

  const aliases: Record<string, string> = {
    'Голос Софии': 'София',
    'Графиня бабушка': 'Графиня-бабушка',
    'Графиня внучка': 'Графиня-внучка',
    'Графиня-бабушка': 'Графиня-бабушка',
    'Графиня-внучка': 'Графиня-внучка',
    'Лакей его': 'Лакей',
    'Лиза': 'Лиза',
    'Лизанька': 'Лиза',
    'София': 'София',
    'Софья': 'София',
    'Хлестова': 'Хлёстова',
    'Хлёстова': 'Хлёстова',
    'г. D.': 'г. D',
    'г. N.': 'г. N',
  }

  return aliases[clean] ?? clean
}

function parseGoreOtUma(rawActs: RawAct[]): ParsedPlayMessage[] {
  const parsed: ParsedPlayMessage[] = []
  let messageIndex = 0

  for (const rawAct of rawActs) {
    const matchedAct = ACTS.find(item => item.index === rawAct.index)
    if (!matchedAct)
      throw new Error(`Unknown act ${rawAct.index}.`)
    const act = matchedAct

    let sceneIndex = 0
    let sceneTitle = ''
    let currentSpeaker: string | null = null
    let currentStageDirection = ''
    let currentLines: string[] = []
    let actMessageIndex = 0

    function pushMessage(input: {
      body: string
      speaker: string
      stageDirection?: string
      type: ParsedPlayMessage['type']
    }) {
      const body = input.body.trim()
      if (!body || !sceneTitle)
        return

      messageIndex += 1
      actMessageIndex += 1
      parsed.push({
        actIndex: act.index,
        actMessageIndex,
        actTitle: act.title,
        body,
        messageIndex,
        sceneIndex,
        sceneTitle,
        speaker: input.speaker,
        stageDirection: input.stageDirection,
        timelineEndYear: 1822,
        timelinePrecision: TIMELINE_PRECISION,
        timelineSectionTitle: act.title,
        timelineStartYear: 1822,
        type: input.type,
      })
    }

    function flushSpeech() {
      if (!currentSpeaker)
        return

      pushMessage({
        body: currentLines.join('\n'),
        speaker: currentSpeaker,
        stageDirection: currentStageDirection || undefined,
        type: 'speech',
      })
      currentSpeaker = null
      currentStageDirection = ''
      currentLines = []
    }

    for (const rawLine of rawAct.text.split('\n')) {
      const line = rawLine.trim()
      if (!line)
        continue

      const sceneMatch = line.match(/^===\s*(Явление\s[^=]+)===$/)
      if (sceneMatch) {
        flushSpeech()
        sceneIndex += 1
        sceneTitle = sceneMatch[1]!.trim()
        continue
      }

      if (/^==\s*ДЕЙСТВИЕ\b/.test(line) || line === '<poem>' || line === '</poem>' || line.startsWith('{{Отексте') || line.startsWith('|') || line.startsWith('}}') || line.startsWith('__') || line.startsWith('<div'))
        continue

      const direction = remText(line)
      if (direction) {
        flushSpeech()
        continue
      }

      const marker = reMarker(line)
      if (marker) {
        flushSpeech()
        const speaker = normalizeSpeaker(marker.speaker)
        if (!speaker)
          continue

        currentSpeaker = speaker
        currentStageDirection = marker.direction
        currentLines = []
        continue
      }

      const cleaned = cleanWikiText(line)
      if (!cleaned)
        continue

      if (currentSpeaker) {
        currentLines.push(cleaned)
      }
    }

    flushSpeech()
    console.log(`Parsed ${act.title}: ${actMessageIndex} messages across ${sceneIndex} scenes.`)
  }

  if (parsed.length < 300) {
    throw new Error(`Parsed too little text for Gore ot Uma: ${parsed.length} messages.`)
  }

  return parsed
}

function actMessageCounts(playMessages: ParsedPlayMessage[]) {
  const counts = new Map<number, number>()
  for (const message of playMessages)
    counts.set(message.actIndex, (counts.get(message.actIndex) ?? 0) + 1)
  return counts
}

function historicalCreatedAt(message: ParsedPlayMessage, counts: Map<number, number>) {
  const act = ACTS.find(item => item.index === message.actIndex)
  if (!act)
    throw new Error(`Unknown act ${message.actIndex}.`)

  const countInAct = counts.get(message.actIndex) ?? 1
  const duration = Math.max(act.endAt - act.startAt - 1, countInAct)
  const index = message.actMessageIndex - 1
  const offset = Math.floor((duration * index) / countInAct) + (message.messageIndex % 1000)
  return new Date(act.startAt + offset)
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
  if (existing) {
    if (existing.visibility !== 'public') {
      const [updated] = await db.update(arkFiles).set({ visibility: 'public' }).where(eq(arkFiles.id, existing.id)).returning()
      return updated ?? existing
    }
    return existing
  }

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
    topic: 'Горе от ума: пьеса как чат с персонажами-авторами',
    visibility: 'registered',
  }).returning()
  if (!channel)
    throw new Error('Gore ot Uma channel could not be created.')
  return channel
}

function speakerHandle(speaker: string) {
  const aliases: Record<string, string> = {
    '1-я княжна': 'princess-1',
    '2-я княжна': 'princess-2',
    '3-я княжна': 'princess-3',
    '4-я княжна': 'princess-4',
    '5-я княжна': 'princess-5',
    '6-я княжна': 'princess-6',
    'Все': 'all',
    'Все вместе': 'all-together',
    'Графиня-бабушка': 'countess-grandmother',
    'Графиня-внучка': 'countess-granddaughter',
    'Загорецкий': 'zagoretsky',
    'Княгиня': 'princess-tugoukhovskaya',
    'Князь': 'prince-tugoukhovsky',
    'Лакей': 'footman',
    'Лиза': 'liza',
    'Лиза и София': 'liza-and-sofia',
    'Молчалин': 'molchalin',
    'Наталья Дмитриевна': 'natalya-dmitrievna',
    'Платон Михайлович': 'platon-mikhailovich',
    'Репетилов': 'repetilov',
    'Скалозуб': 'skalozub',
    'Слуга': 'servant',
    'София': 'sofia',
    'Фамусов': 'famusov',
    'Хлёстова': 'khlestova',
    'Чацкий': 'chatsky',
    'г. D': 'mr-d',
    'г. N': 'mr-n',
  }

  const fallback = Array.from(speaker)
    .map(character => character.codePointAt(0)!.toString(36))
    .join('-')
  return `${FIXTURE}-${aliases[speaker] ?? fallback}`
}

function commonsFilePathUrl(file: string, width = COMMONS_AVATAR_WIDTH) {
  return `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(file)}?width=${width}`
}

function speakerAvatarFile(speaker: string) {
  return SPEAKER_AVATAR_FILES[speaker] ?? null
}

function fixtureFilePath(file: string) {
  return `fixtures/${FIXTURE}/kardovsky/${encodeURIComponent(file)}`
}

async function loadIllustrationSourceUrls() {
  if (illustrationSourceUrlCache)
    return illustrationSourceUrlCache

  const endpoint = new URL('https://commons.wikimedia.org/w/api.php')
  endpoint.search = new URLSearchParams({
    action: 'query',
    format: 'json',
    gcmlimit: '200',
    gcmtitle: 'Category:Illustrations_to_Woe_from_Wit_by_Dmitry_Kardovsky',
    gcmtype: 'file',
    generator: 'categorymembers',
    iiprop: 'url',
    iiurlwidth: String(COMMONS_MESSAGE_IMAGE_WIDTH),
    origin: '*',
    prop: 'imageinfo',
  }).toString()

  const response = await fetch(endpoint, {
    headers: {
      'user-agent': '@kurark/ark stress seed (local development)',
    },
  })
  if (!response.ok)
    throw new Error(`Failed to load Commons illustration URLs: HTTP ${response.status}`)

  const payload = await response.json() as {
    query?: {
      pages?: Record<string, {
        imageinfo?: Array<{ thumburl?: string, url?: string }>
        title?: string
      }>
    }
  }
  const urls = new Map<string, string>()
  for (const page of Object.values(payload.query?.pages ?? {})) {
    const file = page.title?.replace(/^File:/, '')
    const imageUrl = page.imageinfo?.[0]?.thumburl ?? page.imageinfo?.[0]?.url
    if (file && imageUrl)
      urls.set(file, imageUrl)
  }
  illustrationSourceUrlCache = urls
  return urls
}

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function downloadIllustration(file: string, sourceUrl: string) {
  let lastStatus = 0
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 8000)
    try {
      const response = await fetch(sourceUrl, {
        headers: {
          'user-agent': '@kurark/ark stress seed (local development)',
        },
        signal: controller.signal,
      })
      if (response.ok)
        return response

      lastStatus = response.status
      if (response.status !== 429 && response.status < 500)
        break
    }
    catch (error) {
      lastStatus = error instanceof Error && error.name === 'AbortError' ? 408 : lastStatus
    }
    finally {
      clearTimeout(timeout)
    }

    await sleep(attempt * 1500)
  }

  console.warn(`Skipping Commons illustration ${file}: HTTP ${lastStatus}`)
  return null
}

async function ensureIllustrationFile(db: StressDb, spaceId: string, file: string, sourceUrls: Map<string, string>): Promise<FixtureFileRow | null> {
  const storage = defaultPrivateStorage()
  const path = fixtureFilePath(file)
  const [existing] = await db.select().from(arkFiles).where(and(
    eq(arkFiles.storage, storage.name),
    eq(arkFiles.bucket, storage.bucket),
    eq(arkFiles.path, path),
    isNull(arkFiles.deletedAt),
  )).limit(1)
  if (existing)
    return existing

  const sourceUrl = sourceUrls.get(file) ?? commonsFilePathUrl(file, COMMONS_MESSAGE_IMAGE_WIDTH)
  console.log(`Downloading illustration ${file}`)
  const response = await downloadIllustration(file, sourceUrl)
  if (!response)
    return null

  const data = Buffer.from(await response.arrayBuffer())
  const mimeType = response.headers.get('content-type')?.split(';')[0]?.trim() || 'image/jpeg'
  const id = uuidv7()
  await putStoredObject(storage, path, data, mimeType)

  const [created] = await db.insert(arkFiles).values({
    bucket: storage.bucket,
    checksum: createHash('sha256').update(data).digest('hex'),
    filename: file,
    id,
    metadataJson: {
      commonsFile: file,
      fixture: FIXTURE,
      illustrationCredit: 'Dmitry Kardovsky',
      illustrationLicense: 'public-domain',
      illustrationSource: 'wikimedia-commons',
      source: SOURCE,
      sourceUrl: response.url,
      spaceId,
      stress: true,
      type: 'message-illustration',
    },
    mimeType,
    originalFilename: file,
    path,
    sizeBytes: data.length,
    storage: storage.name,
    visibility: 'public',
  }).returning()
  if (!created)
    throw new Error(`Could not create fixture file row for ${file}.`)
  return created
}

async function ensureIllustrationFiles(db: StressDb, spaceId: string) {
  const sourceUrls = await loadIllustrationSourceUrls()
  const ids = new Map<string, string>()
  for (const file of COMMONS_ILLUSTRATION_FILES) {
    const illustration = await ensureIllustrationFile(db, spaceId, file, sourceUrls)
    if (illustration)
      ids.set(file, illustration.id)
  }
  return ids
}

function sceneFirstMessages(playMessages: ParsedPlayMessage[]) {
  const firstByScene = new Map<string, ParsedPlayMessage>()
  for (const message of playMessages) {
    const sceneKey = `${message.actIndex}:${message.sceneIndex}`
    const existing = firstByScene.get(sceneKey)
    if (!existing || message.messageIndex < existing.messageIndex)
      firstByScene.set(sceneKey, message)
  }
  return [...firstByScene.values()].sort((left, right) => left.messageIndex - right.messageIndex)
}

function illustrationFileIdsByMessageIndex(playMessages: ParsedPlayMessage[], illustrationFileIds: Map<string, string>) {
  const sceneFirsts = sceneFirstMessages(playMessages)
  const result = new Map<number, string[]>()
  const usedMessageIndexes = new Set<number>()
  if (!sceneFirsts.length)
    return result

  const illustrationCount = COMMONS_ILLUSTRATION_FILES.length
  COMMONS_ILLUSTRATION_FILES.forEach((file, index) => {
    const idealSceneIndex = Math.round((index * (sceneFirsts.length - 1)) / (illustrationCount - 1))
    let scene = sceneFirsts[idealSceneIndex]!
    for (let offset = 0; offset < sceneFirsts.length && usedMessageIndexes.has(scene.messageIndex); offset += 1)
      scene = sceneFirsts[(idealSceneIndex + offset) % sceneFirsts.length]!

    const fileId = illustrationFileIds.get(file)
    if (!fileId)
      return

    result.set(scene.messageIndex, [...(result.get(scene.messageIndex) ?? []), fileId])
    usedMessageIndexes.add(scene.messageIndex)
  })
  return result
}

function baseSpeakerProfileJson(speaker: string, existingProfileJson?: unknown) {
  const profileJson = existingProfileJson && typeof existingProfileJson === 'object' && !Array.isArray(existingProfileJson)
    ? existingProfileJson as Record<string, unknown>
    : {}
  const avatarFile = speakerAvatarFile(speaker)

  return {
    ...profileJson,
    fixture: FIXTURE,
    source: SOURCE,
    speaker,
    ...(avatarFile
      ? {
          avatarCredit: 'Dmitry Kardovsky',
          avatarFile,
          avatarLicense: 'public-domain',
          avatarSource: 'wikimedia-commons',
        }
      : {}),
  }
}

async function ensureSpeakerUserIds(db: StressDb, speakerNames: string[]) {
  const ids = new Map<string, string>()
  for (const speaker of speakerNames) {
    const handle = speakerHandle(speaker)
    const [existing] = await db.select().from(arkUsers).where(and(
      eq(arkUsers.kind, 'system'),
      eq(arkUsers.handle, handle),
    )).limit(1)
    if (existing) {
      const profileJson = baseSpeakerProfileJson(speaker, existing.profileJson)
      const shouldUpdateProfile = JSON.stringify(existing.profileJson ?? {}) !== JSON.stringify(profileJson)
      if (shouldUpdateProfile) {
        await db.update(arkUsers).set({
          profileJson,
        }).where(eq(arkUsers.id, existing.id))
      }
      ids.set(speaker, existing.id)
      continue
    }

    const [created] = await db.insert(arkUsers).values({
      displayName: speaker,
      handle,
      kind: 'system',
      profileJson: baseSpeakerProfileJson(speaker),
    }).onConflictDoNothing().returning()
    if (created) {
      ids.set(speaker, created.id)
      continue
    }

    const [raceWinner] = await db.select().from(arkUsers).where(and(
      eq(arkUsers.kind, 'system'),
      eq(arkUsers.handle, handle),
    )).limit(1)
    if (!raceWinner)
      throw new Error(`Could not create speaker user for ${speaker}.`)
    ids.set(speaker, raceWinner.id)
  }
  return ids
}

async function seedMessages(db: StressDb, channel: typeof arkChannels.$inferSelect, playMessages: ParsedPlayMessage[]) {
  const speakerUserIds = await ensureSpeakerUserIds(db, [...new Set(playMessages.map(message => message.speaker))].sort())
  const illustrationFileIds = await ensureIllustrationFiles(db, channel.spaceId)
  const attachmentsByMessageIndex = illustrationFileIdsByMessageIndex(playMessages, illustrationFileIds)
  const counts = actMessageCounts(playMessages)
  const inserted: SeededMessage[] = []

  for (const messagesChunk of chunk(playMessages, BATCH_SIZE)) {
    const values = messagesChunk.map((message) => {
      const createdAt = historicalCreatedAt(message, counts)
      const attachmentFileIds = attachmentsByMessageIndex.get(message.messageIndex) ?? []
      return {
        authorArkUserId: speakerUserIds.get(message.speaker) ?? null,
        body: message.body,
        bodyJson: {
          actIndex: message.actIndex,
          actTitle: message.actTitle,
          ...(attachmentFileIds.length
            ? {
                attachmentFileIds,
                illustrationFixture: {
                  credit: 'Dmitry Kardovsky',
                  license: 'public-domain',
                  source: 'wikimedia-commons',
                },
              }
            : {}),
          fixture: FIXTURE,
          messageIndex: message.messageIndex,
          sceneIndex: message.sceneIndex,
          sceneTitle: message.sceneTitle,
          source: SOURCE,
          speaker: message.speaker,
          stageDirection: message.stageDirection,
          timelineEndYear: message.timelineEndYear,
          timelinePrecision: message.timelinePrecision,
          timelineSectionTitle: message.timelineSectionTitle,
          timelineStartYear: message.timelineStartYear,
          type: message.type,
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
      const metadata = row.bodyJson as { actIndex?: number, messageIndex?: number, sceneIndex?: number }
      inserted.push({
        createdAt: row.createdAt,
        id: row.id,
        messageIndex: Number(metadata.messageIndex),
        sceneKey: `${metadata.actIndex}:${metadata.sceneIndex}`,
      })
    }
    console.log(`Inserted ${inserted.length}/${playMessages.length} messages`)
  }

  return inserted
}

async function seedPins(db: StressDb, channelId: string, seededMessages: SeededMessage[]) {
  const firstMessageByScene = new Map<string, SeededMessage>()
  for (const message of seededMessages) {
    const existing = firstMessageByScene.get(message.sceneKey)
    if (!existing || message.messageIndex < existing.messageIndex)
      firstMessageByScene.set(message.sceneKey, message)
  }

  const pinValues = Array.from(firstMessageByScene.values()).map(message => ({
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

  const rawActs = await loadGoreOtUmaText()
  const playMessages = parseGoreOtUma(rawActs)
  console.log(`Parsed ${playMessages.length} messages across ${new Set(playMessages.map(message => `${message.actIndex}:${message.sceneIndex}`)).size} scenes and ${new Set(playMessages.map(message => message.speaker)).size} speakers.`)

  const seededMessages = await seedMessages(db, channel, playMessages)
  const pinnedCount = await seedPins(db, channel.id, seededMessages)
  const messagesCount = await activeMessageCount(db, channel.id)
  const latestMessage = seededMessages[seededMessages.length - 1]
  await db.update(arkChannels).set({
    lastMessageAt: latestMessage?.createdAt ?? new Date(),
    lastMessagePreview: playMessages[playMessages.length - 1]?.body.slice(0, 180) ?? CHANNEL_NAME,
    messagesCount,
    updatedAt: new Date(),
  }).where(eq(arkChannels.id, channel.id))

  console.log(JSON.stringify({
    channelId: channel.id,
    channelSlug: CHANNEL_SLUG,
    messages: seededMessages.length,
    pins: pinnedCount,
    speakers: new Set(playMessages.map(message => message.speaker)).size,
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
