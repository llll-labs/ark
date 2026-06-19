import { publishedAtForCuration } from '../../../utils/market-jobs'
import {
  and,
  arkUserProcedure,
  arkUsers,
  baseProcedure,
  byIdSchema,
  arkChannels,
  createTRPCRouter,
  currentArkUserOrThrow,
  desc,
  emptyListSchema,
  eq,
  inArray,
  isNull,
  arkMarketCategories,
  marketJobCategories,
  marketJobCurationSchema,
  arkMarketJobs,
  marketJobTags,
  marketJobUpsertSchema,
  marketManageSpaceIds,
  arkMarketSkills,
  marketStoreListSchema,
  arkMarketStores,
  marketStoreUpsertSchema,
  arkMarketStyles,
  arkMarketTags,
  arkMarketTools,
  or,
  protectedProcedure,
  publicMarketJob,
  replaceJobTargets,
  replaceStoreTargets,
  requireSpaceAccess,
  requireStoreManage,
  requireStoreOwnerInput,
  slugify,
  arkSpaces,
  sql,
  TRPCError,
  withMarketJobDetails,
  withStoreDetails,
  z,
} from './shared'

export const marketRouter = createTRPCRouter({
  options: baseProcedure.input(emptyListSchema).query(async ({ ctx }) => {
    const root = await ctx.auth.publicSpace()
    if (!root)
      throw new TRPCError({ code: 'NOT_FOUND', message: 'Public space not found' })
    await requireSpaceAccess(root.id, ctx, 'market.access')
    const sourceRows = await ctx.db
      .selectDistinct({ source: arkMarketJobs.source })
      .from(arkMarketJobs)
      .where(sql`${arkMarketJobs.source} is not null and ${arkMarketJobs.source} <> ''`)
    return {
      categories: await ctx.db.select().from(arkMarketCategories).orderBy(arkMarketCategories.position),
      sources: sourceRows
        .map((row: { source: null | string }) => row.source)
        .filter((value: null | string): value is string => Boolean(value))
        .sort((a: string, b: string) => a.localeCompare(b))
        .map((source: string) => ({ key: source, name: source })),
      skills: await ctx.db.select().from(arkMarketSkills).orderBy(arkMarketSkills.position),
      styles: await ctx.db.select().from(arkMarketStyles).orderBy(arkMarketStyles.position),
      tags: await ctx.db.select().from(arkMarketTags).orderBy(arkMarketTags.position),
      tools: await ctx.db.select().from(arkMarketTools).orderBy(arkMarketTools.position),
    }
  }),
  stores: createTRPCRouter({
    list: baseProcedure.input(marketStoreListSchema).query(async ({ ctx, input }) => {
      const root = await ctx.auth.publicSpace()
      if (!root)
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Public space not found' })
      const rootAccess = await requireSpaceAccess(root.id, ctx, 'market.access')
      const filters = [
        eq(arkMarketStores.status, input.status && rootAccess.capabilities.includes('market.jobs.manage') ? input.status : 'active'),
      ]
      if (input.ownerSpaceId)
        filters.push(eq(arkMarketStores.ownerSpaceId, input.ownerSpaceId))
      const rows = await ctx.db.select().from(arkMarketStores).where(and(...filters)).orderBy(desc(arkMarketStores.updatedAt)).limit(input.limit)
      return withStoreDetails(ctx, rows)
    }),
    mine: protectedProcedure.input(emptyListSchema).query(async ({ ctx }) => {
      const arkUser = await currentArkUserOrThrow(ctx)
      const spaceIds = await marketManageSpaceIds(ctx, arkUser.id)
      const rows = spaceIds.length
        ? await ctx.db.select().from(arkMarketStores).where(and(
            inArray(arkMarketStores.ownerSpaceId, spaceIds),
            isNull(arkMarketStores.deletedAt),
          )).orderBy(desc(arkMarketStores.updatedAt))
        : []
      return {
        stores: await withStoreDetails(ctx, rows),
        manageableSpaceIds: spaceIds,
      }
    }),
    upsert: arkUserProcedure.input(marketStoreUpsertSchema).mutation(async ({ ctx, input }) => {
      const owner = await requireStoreOwnerInput(ctx, input)
      const existing = input.id
        ? (await ctx.db.select().from(arkMarketStores).where(eq(arkMarketStores.id, input.id)).limit(1))[0]
        : (await ctx.db.select().from(arkMarketStores).where(and(
            eq(arkMarketStores.ownerSpaceId, owner.ownerSpaceId),
            isNull(arkMarketStores.deletedAt),
          )).limit(1))[0]
      if (existing)
        await requireStoreManage(ctx, existing)

      const values = {
        availability: input.availability ?? null,
        bio: input.bio ?? null,
        headline: input.headline ?? null,
        location: input.location ?? null,
        metaJson: input.metaJson,
        name: input.name,
        ownerSpaceId: owner.ownerSpaceId,
        portfolioUrl: input.portfolioUrl ?? null,
        rateAmount: input.rateAmount ?? null,
        rateCurrency: input.rateCurrency ?? null,
        rateUnit: input.rateUnit ?? null,
        remote: input.remote,
        serviceSummary: input.serviceSummary ?? null,
        submittedAt: input.status === 'pending_review' ? existing?.submittedAt ?? new Date() : existing?.submittedAt ?? null,
        status: input.status,
        timezone: input.timezone ?? null,
        verificationJson: input.verificationJson,
        updatedAt: new Date(),
      }
      const [store] = existing
        ? await ctx.db.update(arkMarketStores).set(values).where(eq(arkMarketStores.id, existing.id)).returning()
        : await ctx.db.insert(arkMarketStores).values(values).returning()
      if (!store)
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Store was not saved.' })

      await replaceStoreTargets(ctx, store.id, input)
      return (await withStoreDetails(ctx, [store]))[0]
    }),
    review: arkUserProcedure.input(z.object({
      action: z.enum(['approve', 'reject']),
      id: z.uuid(),
      reviewNote: z.string().max(2000).optional(),
    })).mutation(async ({ ctx, input }) => {
      const root = await ctx.auth.publicSpace()
      if (!root)
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Public space not found' })
      await requireSpaceAccess(root.id, ctx, 'market.jobs.manage')
      const reviewer = await currentArkUserOrThrow(ctx)
      const [store] = await ctx.db.select().from(arkMarketStores).where(eq(arkMarketStores.id, input.id)).limit(1)
      if (!store)
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Store not found' })

      const [updated] = await ctx.db.update(arkMarketStores).set({
        reviewNote: input.reviewNote ?? null,
        reviewedAt: new Date(),
        reviewedByArkUserId: reviewer.id,
        status: input.action === 'approve' ? 'active' : 'rejected',
        updatedAt: new Date(),
      }).where(eq(arkMarketStores.id, store.id)).returning()
      if (!updated)
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Store review was not saved.' })

      // Write the onboarding outcome back to the owning space's owner user.
      const [ownerSpace] = await ctx.db.select().from(arkSpaces).where(eq(arkSpaces.id, store.ownerSpaceId)).limit(1)
      if (ownerSpace?.ownerArkUserId) {
        const [owner] = await ctx.db.select().from(arkUsers).where(eq(arkUsers.id, ownerSpace.ownerArkUserId)).limit(1)
        if (owner) {
          const profileJson = owner.profileJson && typeof owner.profileJson === 'object' && !Array.isArray(owner.profileJson)
            ? owner.profileJson as Record<string, any>
            : {}
          const onboarding = profileJson.onboarding && typeof profileJson.onboarding === 'object' && !Array.isArray(profileJson.onboarding)
            ? profileJson.onboarding as Record<string, any>
            : {}
          const approved = input.action === 'approve'
          await ctx.db.update(arkUsers).set({
            profileJson: {
              ...profileJson,
              onboarding: {
                ...onboarding,
                completed: approved,
                completedAt: approved ? new Date().toISOString() : onboarding.completedAt,
                storeIds: [store.id],
                reviewNote: input.reviewNote ?? null,
                reviewStatus: approved ? 'active' : 'rejected',
                role: 'seller',
              },
              onboarding_completed: approved,
              onboarding_pending_review: false,
            },
            updatedAt: new Date(),
          }).where(eq(arkUsers.id, owner.id))
        }
      }

      return (await withStoreDetails(ctx, [updated]))[0]
    }),
  }),
  jobs: createTRPCRouter({
    list: baseProcedure.input(z.object({
      admin: z.boolean().default(false),
      categoryId: z.string().uuid().optional(),
      curation: z.string().max(40).optional(),
      kindGroup: z.enum(['order', 'vacancy']).optional(),
      limit: z.number().int().min(1).max(100).default(10),
      offset: z.number().int().min(0).default(0),
      query: z.string().trim().max(200).optional(),
      sort: z.enum(['newest', 'oldest', 'budget_desc', 'budget_asc']).default('newest'),
      source: z.string().max(80).optional(),
      spaceId: z.string().uuid().optional(),
      status: z.string().max(40).optional(),
      tagId: z.string().uuid().optional(),
    }).default({ admin: false, limit: 10, offset: 0, sort: 'newest' })).query(async ({ ctx, input }) => {
      const root = await ctx.auth.publicSpace()
      if (!root)
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Public space not found' })
      const access = await requireSpaceAccess(root.id, ctx, 'market.access')
      const canManage = access.capabilities.includes('market.jobs.manage')
      const adminView = canManage && input.admin

      const conditions: any[] = []
      if (input.spaceId)
        conditions.push(eq(arkMarketJobs.spaceId, input.spaceId))
      if (!adminView) {
        conditions.push(sql`${arkMarketJobs.curationStatus} <> 'hidden'`)
        conditions.push(sql`${arkMarketJobs.status} <> 'archived'`)
      }
      if (input.status)
        conditions.push(sql`${arkMarketJobs.status} = ${input.status}`)
      // Vacancy/order split: vacancies are employment kinds; everything else
      // (freelance_project, gig, order, unknown, …) counts as an order.
      if (input.kindGroup === 'vacancy')
        conditions.push(sql`${arkMarketJobs.kind} in ('vacancy', 'internship')`)
      else if (input.kindGroup === 'order')
        conditions.push(sql`${arkMarketJobs.kind} not in ('vacancy', 'internship')`)
      if (adminView && input.curation)
        conditions.push(sql`${arkMarketJobs.curationStatus} = ${input.curation}`)
      if (input.source) {
        conditions.push(input.source === 'manual'
          ? or(isNull(arkMarketJobs.source), eq(arkMarketJobs.source, 'manual'))
          : eq(arkMarketJobs.source, input.source))
      }
      if (input.categoryId) {
        conditions.push(or(
          eq(arkMarketJobs.primaryCategoryId, input.categoryId),
          sql`exists (select 1 from ${marketJobCategories} where ${marketJobCategories.jobId} = ${arkMarketJobs.id} and ${marketJobCategories.targetId} = ${input.categoryId})`,
        ))
      }
      if (input.tagId) {
        conditions.push(sql`exists (select 1 from ${marketJobTags} where ${marketJobTags.jobId} = ${arkMarketJobs.id} and ${marketJobTags.targetId} = ${input.tagId})`)
      }
      if (input.query) {
        const like = `%${input.query.toLowerCase()}%`
        conditions.push(sql`(lower(${arkMarketJobs.title}) like ${like} or lower(coalesce(${arkMarketJobs.summary}, '')) like ${like} or lower(coalesce(${arkMarketJobs.description}, '')) like ${like} or lower(coalesce(${arkMarketJobs.sourceUrl}, '')) like ${like} or lower(coalesce(${arkMarketJobs.status}, '')) like ${like})`)
      }

      const where = conditions.length ? and(...conditions) : undefined
      const [totals] = await ctx.db.select({ total: sql<number>`count(*)` }).from(arkMarketJobs).where(where)
      const orderBy = input.sort === 'oldest'
        ? sql`${arkMarketJobs.updatedAt} asc`
        : input.sort === 'budget_desc'
          ? sql`${arkMarketJobs.budgetAmount} desc nulls last`
          : input.sort === 'budget_asc'
            ? sql`${arkMarketJobs.budgetAmount} asc nulls last`
            : sql`${arkMarketJobs.updatedAt} desc`
      const rows = await ctx.db.select().from(arkMarketJobs).where(where).orderBy(orderBy).limit(input.limit).offset(input.offset)
      const detailed = await withMarketJobDetails(ctx, rows)
      return {
        items: canManage ? detailed : detailed.map(publicMarketJob),
        total: Number(totals?.total ?? 0),
      }
    }),
    byId: baseProcedure.input(byIdSchema).query(async ({ ctx, input }) => {
      const [job] = await ctx.db.select().from(arkMarketJobs).where(eq(arkMarketJobs.id, input.id)).limit(1)
      if (!job)
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Job not found' })
      const access = await requireSpaceAccess(job.spaceId, ctx, 'market.access')
      const canManage = access.capabilities.includes('market.jobs.manage')
      if (!canManage && (job.curationStatus === 'hidden' || job.status === 'archived')) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Job not found' })
      }
      const detailed = (await withMarketJobDetails(ctx, [job]))[0]
      if (!detailed)
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Job not found' })
      return canManage ? detailed : publicMarketJob(detailed)
    }),
    upsert: arkUserProcedure.input(marketJobUpsertSchema).mutation(async ({ ctx, input }) => {
      const { categoryIds, tagIds, ...jobInput } = input
      const root = input.spaceId ? null : await ctx.auth.publicSpace()
      const spaceId = input.spaceId ?? root?.id
      if (!spaceId)
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Target space not found' })
      await requireSpaceAccess(spaceId, ctx, 'market.access')
      const imported = Boolean(input.source || input.externalId)
      const access = await requireSpaceAccess(spaceId, ctx, imported ? 'market.jobs.import' : 'market.jobs.manage')
      const existing = input.source && input.externalId
        ? (await ctx.db.select().from(arkMarketJobs).where(and(
            eq(arkMarketJobs.source, input.source),
            eq(arkMarketJobs.externalId, input.externalId),
          )).limit(1))[0]
        : null
      if (existing) {
        const publishedAt = publishedAtForCuration(jobInput.curationStatus, existing.publishedAt)
        const [updated] = await ctx.db.update(arkMarketJobs).set({
          ...jobInput,
          ...(publishedAt !== undefined ? { publishedAt } : {}),
          updatedAt: new Date(),
        }).where(eq(arkMarketJobs.id, existing.id)).returning()
        if (!updated)
          throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Job update did not return a row.' })
        await replaceJobTargets(ctx, updated.id, { categoryIds, tagIds })
        return (await withMarketJobDetails(ctx, [updated]))[0]
      }
      const insertPublishedAt = publishedAtForCuration(jobInput.curationStatus, null)
      const [job] = await ctx.db.insert(arkMarketJobs).values({
        ...jobInput,
        ...(insertPublishedAt !== undefined ? { publishedAt: insertPublishedAt } : {}),
        budgetAmount: input.budgetAmount,
        createdByArkUserId: access.arkUser?.id,
        spaceId,
      }).returning()
      if (!job)
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Job insert did not return a row.' })
      await replaceJobTargets(ctx, job.id, { categoryIds, tagIds })
      return (await withMarketJobDetails(ctx, [job]))[0]
    }),
    curate: arkUserProcedure.input(marketJobCurationSchema).mutation(async ({ ctx, input }) => {
      const [job] = await ctx.db.select().from(arkMarketJobs).where(eq(arkMarketJobs.id, input.id)).limit(1)
      if (!job)
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Job not found' })
      await requireSpaceAccess(job.spaceId, ctx, 'market.access')
      await requireSpaceAccess(job.spaceId, ctx, 'market.jobs.manage')
      const now = new Date()
      const nextCuration = input.action === 'approve' ? 'approved' as const : 'hidden' as const
      const nextValues = input.action === 'archive'
        ? {
            archivedAt: now,
            curationStatus: 'hidden' as const,
            publishedAt: publishedAtForCuration('hidden', job.publishedAt) ?? null,
            status: 'archived' as const,
            updatedAt: now,
          }
        : {
            archivedAt: null,
            curationStatus: nextCuration,
            publishedAt: publishedAtForCuration(nextCuration, job.publishedAt) ?? null,
            updatedAt: now,
          }
      const [updated] = await ctx.db.update(arkMarketJobs).set({
        ...nextValues,
      }).where(eq(arkMarketJobs.id, job.id)).returning()
      return updated
    }),
    startDiscussion: arkUserProcedure.input(byIdSchema).mutation(async ({ ctx, input }) => {
      const [job] = await ctx.db.select().from(arkMarketJobs).where(eq(arkMarketJobs.id, input.id)).limit(1)
      if (!job)
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Job not found' })
      const access = await requireSpaceAccess(job.spaceId, ctx, 'market.access')
      await requireSpaceAccess(job.spaceId, ctx, 'market.jobs.read')
      if (!access.capabilities.includes('market.jobs.manage') && (job.curationStatus === 'hidden' || job.status === 'archived')) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Job not found' })
      }
      if (job.discussionChannelId) {
        const [channel] = await ctx.db.select().from(arkChannels).where(eq(arkChannels.id, job.discussionChannelId)).limit(1)
        return { channel, job }
      }
      const arkUser = await ctx.auth.arkUser()
      const [channel] = await ctx.db.insert(arkChannels).values({
        createdByArkUserId: arkUser?.id,
        kind: 'job_discussion',
        name: job.title,
        slug: `job-${job.id.slice(0, 8)}-${slugify(job.title).slice(0, 40)}`,
        spaceId: job.spaceId,
        targetId: job.id,
        targetType: 'job',
        topic: 'Job discussion',
        visibility: 'space',
      }).returning()
      if (!channel)
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Discussion channel could not be created' })
      const [updated] = await ctx.db.update(arkMarketJobs).set({
        discussionChannelId: channel.id,
        status: 'responding',
        updatedAt: new Date(),
      }).where(eq(arkMarketJobs.id, job.id)).returning()
      return { channel, job: updated }
    }),
  }),
})
