import { adminRouter } from './ark/admin'
import { channelCategoriesRouter, channelsRouter, messagesRouter } from './ark/channels'
import { collectionsRouter, itemsRouter } from './ark/knowledge'
import { marketRouter } from './ark/market'
import { pagesRouter } from './ark/pages'
import { settingsRouter } from './ark/settings'
import {
  baseProcedure,
  createTRPCRouter,
  currentArkUser,
  ensureDefaultArk,
  eq,
  getDefaultArk,
  getEffectiveCapabilities,
  getPublicSpace,
  loadArkUserExtension,
  arkMemberships,
  sql,
  virtualArk,
} from './ark/shared'
import { membersRouter, permissionsRouter, rolesRouter, spacesRouter } from './ark/spaces'
import { usersRouter } from './ark/users'

export const arkRouter = createTRPCRouter({
  health: baseProcedure.query(async ({ ctx }) => {
    await ensureDefaultArk()
    await ctx.db.execute(sql`select 1 as ok`)
    return { database: 'reachable', ok: true }
  }),

  me: baseProcedure.query(async ({ ctx }) => {
    if (!ctx.session?.user) {
      return {
        ark: virtualArk(),
        arkUser: null,
        arkUserExtension: null,
        authenticated: false,
        capabilities: [] as string[],
        memberships: [],
        session: null,
        user: null,
      }
    }

    const ark = await getDefaultArk()
    const arkUser = await currentArkUser(ctx.session)
    const root = await getPublicSpace()
    const capabilityAccess = root ? await getEffectiveCapabilities(root.id, ctx.session) : { capabilities: [] as string[] }
    const rows = arkUser
      ? await ctx.db.select().from(arkMemberships).where(eq(arkMemberships.arkUserId, arkUser.id))
      : []

    return {
      ark,
      arkUser,
      arkUserExtension: arkUser ? await loadArkUserExtension({ arkUserId: arkUser.id, db: ctx.db }) : null,
      authenticated: true,
      capabilities: capabilityAccess.capabilities,
      memberships: rows,
      session: ctx.session.session,
      user: ctx.session.user,
    }
  }),

  settings: settingsRouter,
  users: usersRouter,
  spaces: spacesRouter,
  members: membersRouter,
  roles: rolesRouter,
  permissions: permissionsRouter,
  channelCategories: channelCategoriesRouter,
  channels: channelsRouter,
  messages: messagesRouter,
  pages: pagesRouter,
  collections: collectionsRouter,
  items: itemsRouter,
  market: marketRouter,
  admin: adminRouter,
})
