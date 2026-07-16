import { adminRouter } from './ark/admin'
import { channelCategoriesRouter, channelsRouter, messagesRouter } from './ark/channels'
import { collectionsRouter, itemsRouter } from './ark/knowledge'
import { marketRouter } from './ark/market'
import { pagesRouter } from './ark/pages'
import { settingsRouter } from './ark/settings'
import {
  baseAction,
  createArkActionRouter,
  defaultArkIdentity,
  eq,
  loadArkUserExtension,
  arkMemberships,
} from './ark/shared'
import { membersRouter, permissionsRouter, rolesRouter, spacesRouter } from './ark/spaces'
import { usersRouter } from './ark/users'

export const arkRouter = createArkActionRouter({
  me: baseAction.query(async ({ ctx }) => {
    if (!ctx.session?.user) {
      return {
        ark: defaultArkIdentity(),
        arkUser: null,
        arkUserExtension: null,
        authenticated: false,
        capabilities: [] as string[],
        memberships: [],
        session: null,
        user: null,
      }
    }

    const ark = defaultArkIdentity()
    const [arkUser, root] = await Promise.all([
      ctx.auth.arkUser(),
      ctx.auth.publicSpace(),
    ])
    const capabilityAccess = root ? await ctx.auth.capabilitiesFor(root.id) : { capabilities: [] as string[] }
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
  knowledge: createArkActionRouter({
    collections: collectionsRouter,
    items: itemsRouter,
  }),
  market: marketRouter,
  admin: adminRouter,
})

export type ArkRouter = typeof arkRouter
