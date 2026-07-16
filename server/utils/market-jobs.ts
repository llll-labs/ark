import { and, eq, isNull } from 'drizzle-orm'
import {
  marketJobCategories,
  arkMarketJobs,
  marketJobTags,
} from '../../db/schema'
import type { ArkResourceAccountability } from '../resources/types'
import { registerCoreArkResources } from '../resources/core'
import { systemArkResourceAccountability, withArkResourceTransaction } from '../resources/service'
import { useDatabase } from './db'

type Database = ReturnType<typeof useDatabase>

/**
 * `ark.market_jobs` is a CORE (`ark.*`) table that app/tenant code is
 * allowed to write through this service. App code must not `db.insert/update`
 * the table directly; route market-job creation/updates here so the write path
 * (including join-table fan-out) lives in the layer that owns the schema.
 */

export type MarketJobWriteValues = Omit<
  typeof arkMarketJobs.$inferInsert,
  'id' | 'createdAt' | 'updatedAt' | 'deletedAt'
>

export interface MarketJobTargets {
  categoryIds?: string[]
  tagIds?: string[]
}

/**
 * Single source of truth for the curationStatus→publishedAt invariant:
 * approving stamps the publish time (keeping an earlier one), hiding/parsing
 * clears it. Every write path that changes curationStatus (this upsert
 * service and the REST upsert/curate Actions) must derive publishedAt here.
 * Returns undefined when curationStatus is not being changed — leave
 * publishedAt untouched in that case.
 */
export function publishedAtForCuration(
  curationStatus: 'approved' | 'hidden' | 'parsed' | null | undefined,
  existingPublishedAt: Date | null | undefined,
  explicit?: Date | null,
): Date | null | undefined {
  if (!curationStatus)
    return undefined
  if (curationStatus === 'approved')
    return existingPublishedAt ?? explicit ?? new Date()
  return null
}

async function replaceJobTargets(db: Database, jobId: string, targets: MarketJobTargets) {
  const sets = [
    [marketJobCategories, targets.categoryIds ?? []],
    [marketJobTags, targets.tagIds ?? []],
  ] as const
  for (const [table, ids] of sets) {
    await db.delete(table).where(eq(table.jobId, jobId))
    if (ids.length) {
      await db.insert(table).values(ids.map(targetId => ({
        jobId,
        targetId,
      }))).onConflictDoNothing()
    }
  }
}

/**
 * Create or update an `ark.market_jobs` row (matched on source + externalId when
 * both are present) and replace its category/tag join rows. Returns the job id.
 */
export async function upsertMarketJob(
  values: MarketJobWriteValues,
  targets: MarketJobTargets = {},
  options: { accountability?: ArkResourceAccountability } = {},
): Promise<{ id: string }> {
  registerCoreArkResources()
  const db = useDatabase()
  const accountability = options.accountability ?? {
    ...systemArkResourceAccountability(),
    spaceId: values.spaceId,
  }
  const now = new Date()
  const existing = values.source && values.externalId
    ? (await db.select({
        id: arkMarketJobs.id,
        publishedAt: arkMarketJobs.publishedAt,
      }).from(arkMarketJobs).where(and(
        eq(arkMarketJobs.source, values.source),
        eq(arkMarketJobs.externalId, values.externalId),
        isNull(arkMarketJobs.deletedAt),
      )).limit(1))[0]
    : null

  if (existing) {
    const nextValues: typeof values & { publishedAt?: Date | null, updatedAt: Date } = {
      ...values,
      updatedAt: now,
    }
    const publishedAt = publishedAtForCuration(values.curationStatus, existing.publishedAt, values.publishedAt ?? now)
    if (publishedAt !== undefined)
      nextValues.publishedAt = publishedAt
    return withArkResourceTransaction({
      accountability,
      authorization: 'domain',
      database: db,
    }, async ({ database, services }) => {
      const updated = await services.resource('ark.market_jobs').update(existing.id, nextValues)
      await replaceJobTargets(database, updated.id as string, targets)
      return { id: updated.id as string }
    })
  }

  const insertValues: typeof values & { publishedAt?: Date | null } = {
    ...values,
  }
  const publishedAt = publishedAtForCuration(values.curationStatus, null, values.publishedAt ?? now)
  if (publishedAt !== undefined)
    insertValues.publishedAt = publishedAt
  return withArkResourceTransaction({
    accountability,
    authorization: 'domain',
    database: db,
  }, async ({ database, services }) => {
    const created = await services.resource('ark.market_jobs').create(insertValues)
    await replaceJobTargets(database, created.id as string, targets)
    return { id: created.id as string }
  })
}
