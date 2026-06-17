import { APIError, createAuthEndpoint } from 'better-auth/api'
import { setSessionCookie } from 'better-auth/cookies'
import { z } from 'zod'
import {
  TelegramLoginAuthError,
  telegramLoginUserName,
  validateTelegramLoginAuth,
} from './telegram-login'
import {
  TelegramMiniAuthError,
  telegramMiniUserName,
  validateTelegramMiniInitData,
} from './telegram-mini'

interface TelegramSignInInput {
  accountId: string
  email: string
  image?: string
  name: string
  providerId: 'telegram' | 'telegram-mini'
}

const telegramMiniBodySchema = z.object({
  initData: z.string(),
})

const telegramLoginQuerySchema = z.object({
  auth_date: z.string(),
  first_name: z.string().optional(),
  hash: z.string(),
  id: z.string(),
  last_name: z.string().optional(),
  photo_url: z.string().optional(),
  redirect: z.string().optional(),
  username: z.string().optional(),
})

function telegramBotToken() {
  return String(process.env.TELEGRAM_BOT_TOKEN ?? '').trim()
}

function authError(error: unknown) {
  if (error instanceof TelegramLoginAuthError || error instanceof TelegramMiniAuthError) {
    throw APIError.fromStatus(error.message.includes('not configured') ? 'SERVICE_UNAVAILABLE' : 'UNAUTHORIZED', {
      message: error.message,
    })
  }
  throw error
}

function safeRedirect(value?: string) {
  if (!value || !value.startsWith('/') || value.startsWith('//'))
    return '/'
  return value
}

async function signInTelegram(ctx: any, input: TelegramSignInInput) {
  const email = input.email.trim().toLowerCase()
  const name = input.name.trim() || email.split('@')[0] || 'Telegram user'
  const image = input.image?.trim() || undefined
  const dbUser = await ctx.context.internalAdapter.findOAuthUser(email, input.accountId, input.providerId)
  let user = dbUser?.user

  if (user) {
    if (!dbUser?.linkedAccount) {
      await ctx.context.internalAdapter.linkAccount({
        accountId: input.accountId,
        providerId: input.providerId,
        userId: user.id,
      })
    }

    const updates: { image?: string, name?: string } = {}
    if (name && user.name !== name)
      updates.name = name
    if (image && user.image !== image)
      updates.image = image
    if (Object.keys(updates).length)
      user = await ctx.context.internalAdapter.updateUser(user.id, updates)
  }
  else {
    const created = await ctx.context.internalAdapter.createOAuthUser({
      email,
      emailVerified: true,
      image,
      name,
    }, {
      accountId: input.accountId,
      providerId: input.providerId,
    })
    user = created.user
  }

  if (!user)
    throw APIError.fromStatus('INTERNAL_SERVER_ERROR', { message: 'Telegram user could not be created.' })

  const session = await ctx.context.internalAdapter.createSession(user.id)
  if (!session)
    throw APIError.fromStatus('INTERNAL_SERVER_ERROR', { message: 'Telegram session could not be created.' })

  await setSessionCookie(ctx, { session, user })

  return { session, user }
}

export function telegramAuthPlugin() {
  return {
    id: 'telegram-auth',
    version: '0.1.0-alpha.6',
    endpoints: {
      telegramLogin: createAuthEndpoint('/telegram-login', {
        method: 'GET',
        query: telegramLoginQuerySchema,
      }, async (ctx) => {
        try {
          const telegram = validateTelegramLoginAuth(ctx.query, telegramBotToken())
          await signInTelegram(ctx, {
            accountId: String(telegram.id),
            email: `${telegram.id}@t.me`,
            image: telegram.photo_url,
            name: telegramLoginUserName(telegram),
            providerId: 'telegram',
          })
          throw ctx.redirect(safeRedirect(ctx.query.redirect))
        }
        catch (error) {
          authError(error)
        }
      }),
      telegramMini: createAuthEndpoint('/telegram-mini', {
        body: telegramMiniBodySchema,
        method: 'POST',
      }, async (ctx) => {
        try {
          const telegram = validateTelegramMiniInitData(ctx.body.initData, telegramBotToken())
          const telegramUserId = String(telegram.user.id)
          const session = await signInTelegram(ctx, {
            accountId: telegramUserId,
            email: `${telegramUserId}@t.me`,
            image: telegram.user.photo_url,
            name: telegramMiniUserName(telegram.user),
            providerId: 'telegram-mini',
          })

          return ctx.json({
            ...session,
            telegram: telegram.user,
          })
        }
        catch (error) {
          authError(error)
        }
      }),
    },
  }
}
