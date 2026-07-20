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
  loadArkUserExtension,
} from './ark/shared'
import { membersRouter, permissionsRouter, rolesRouter, spacesRouter } from './ark/spaces'
import { usersRouter } from './ark/users'
import { loadArkMeAccess } from '../../utils/ark-me'

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
    const access = await loadArkMeAccess(ctx.session.user.id, ctx.db)
    const arkUser = access.arkUser

    return {
      ark,
      arkUser,
      arkUserExtension: arkUser ? await loadArkUserExtension({ arkUserId: arkUser.id, db: ctx.db }) : null,
      authenticated: true,
      capabilities: access.capabilities,
      memberships: access.memberships,
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
