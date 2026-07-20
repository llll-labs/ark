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
import { currentArkUser } from '../../utils/authorization'

export const arkRouter = createArkActionRouter({
  me: baseAction.query(async ({ ctx }) => {
    if (!ctx.session?.user) {
      return {
        ark: defaultArkIdentity(),
        authenticated: false,
        session: null,
        user: null,
      }
    }

    return {
      ark: defaultArkIdentity(),
      authenticated: true,
      session: ctx.session.session,
      user: ctx.session.user,
    }
  }),

  profile: baseAction.query(async ({ ctx }) => {
    if (!ctx.session?.user)
      return { arkUser: null, arkUserExtension: null }

    const arkUser = await currentArkUser(ctx.session, { bypassRequestAuth: true, db: ctx.db })
    return {
      arkUser,
      arkUserExtension: arkUser ? await loadArkUserExtension({ arkUserId: arkUser.id, db: ctx.db }) : null,
    }
  }),

  access: baseAction.query(async ({ ctx }) => {
    if (!ctx.session?.user)
      return { capabilities: [] as string[], memberships: [] }

    const access = await loadArkMeAccess(ctx.session.user.id, ctx.db)
    return {
      capabilities: access.capabilities,
      memberships: access.memberships,
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
