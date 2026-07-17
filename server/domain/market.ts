import type { ArkResourceAccountability } from '../resources/types'
import type { arkMarketStores } from '../../db/schema'
import {
  marketStoreCategories,
  marketStoreSkills,
  marketStoreStyles,
  marketStoreTags,
  marketStoreTools,
  arkMarketStores as arkMarketStoresTable,
} from '../../db/schema'
import { and, eq, isNull } from 'drizzle-orm'
import { registerCoreArkResources } from '../resources/core'
import { withArkResourceTransaction } from '../resources/service'

type MarketStoreRow = typeof arkMarketStores.$inferSelect

export interface ArkMarketStoreTargets {
  categoryIds?: string[]
  skillIds?: string[]
  styleIds?: string[]
  tagIds?: string[]
  toolIds?: string[]
}

export interface ArkMarketStoreInput extends ArkMarketStoreTargets {
  availability?: null | string
  bio?: null | string
  headline?: null | string
  id?: string
  location?: null | string
  metaJson?: Record<string, unknown>
  name: string
  ownerSpaceId: string
  portfolioUrl?: null | string
  rateAmount?: null | string
  rateCurrency?: null | string
  rateUnit?: null | string
  remote?: boolean
  serviceSummary?: null | string
  status: MarketStoreRow['status']
  timezone?: null | string
  verificationJson?: Record<string, unknown>
}

const targetTables = {
  categoryIds: marketStoreCategories,
  skillIds: marketStoreSkills,
  styleIds: marketStoreStyles,
  tagIds: marketStoreTags,
  toolIds: marketStoreTools,
} as const

async function replaceTargets(database: any, storeId: string, input: ArkMarketStoreTargets) {
  for (const [field, table] of Object.entries(targetTables) as Array<[keyof ArkMarketStoreTargets, typeof marketStoreCategories]>) {
    const ids = input[field]
    if (ids === undefined)
      continue
    const uniqueIds = [...new Set(ids)]
    await database.delete(table).where(eq(table.storeId, storeId))
    if (uniqueIds.length) {
      await database.insert(table).values(uniqueIds.map(targetId => ({
        storeId,
        targetId,
      }))).onConflictDoNothing()
    }
  }
}

export function createArkMarketService(options: { accountability: ArkResourceAccountability, database: any }) {
  registerCoreArkResources()
  return {
    async upsertStore(input: ArkMarketStoreInput): Promise<MarketStoreRow> {
      return withArkResourceTransaction({
        accountability: options.accountability,
        authorization: 'domain',
        database: options.database,
      }, async ({ database, services }) => {
        const [existing] = input.id
          ? await database.select().from(arkMarketStoresTable).where(and(
              eq(arkMarketStoresTable.id, input.id),
              isNull(arkMarketStoresTable.deletedAt),
            )).limit(1)
          : await database.select().from(arkMarketStoresTable).where(and(
              eq(arkMarketStoresTable.ownerSpaceId, input.ownerSpaceId),
              isNull(arkMarketStoresTable.deletedAt),
            )).limit(1)

        const values = {
          availability: input.availability ?? null,
          bio: input.bio ?? null,
          headline: input.headline ?? null,
          location: input.location ?? null,
          metaJson: input.metaJson ?? existing?.metaJson ?? {},
          name: input.name,
          ownerSpaceId: input.ownerSpaceId,
          portfolioUrl: input.portfolioUrl ?? null,
          rateAmount: input.rateAmount ?? null,
          rateCurrency: input.rateCurrency ?? null,
          rateUnit: input.rateUnit ?? null,
          remote: input.remote ?? true,
          serviceSummary: input.serviceSummary ?? null,
          status: input.status,
          submittedAt: input.status === 'pending_review' ? existing?.submittedAt ?? new Date() : existing?.submittedAt ?? null,
          timezone: input.timezone ?? null,
          updatedAt: new Date(),
          verificationJson: input.verificationJson ?? existing?.verificationJson ?? {},
        }

        let saved: MarketStoreRow
        try {
          saved = existing
            ? await services.resource('ark.market_stores').update(existing.id, values) as MarketStoreRow
            : await services.resource('ark.market_stores').create(values) as MarketStoreRow
        }
        catch (error) {
          if (existing)
            throw error
          const [raceWinner] = await database.select().from(arkMarketStoresTable).where(and(
            eq(arkMarketStoresTable.ownerSpaceId, input.ownerSpaceId),
            isNull(arkMarketStoresTable.deletedAt),
          )).limit(1)
          if (!raceWinner)
            throw error
          saved = await services.resource('ark.market_stores').update(raceWinner.id, values) as MarketStoreRow
        }

        await replaceTargets(database, saved.id, input)
        return saved
      })
    },
  }
}
