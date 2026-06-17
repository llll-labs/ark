import { parse, validate } from '@tma.js/init-data-node'

interface TelegramMiniUser {
  first_name?: string
  id: number
  last_name?: string
  photo_url?: string
  username?: string
}

export interface TelegramMiniInitData {
  authDate: Date
  queryId?: string
  user: TelegramMiniUser
}

export class TelegramMiniAuthError extends Error {}

export function telegramMiniUserName(user: TelegramMiniUser) {
  return [user.first_name, user.last_name].filter(Boolean).join(' ').trim()
    || user.username
    || `telegram-${user.id}`
}

export function validateTelegramMiniInitData(initData: string, botToken: string): TelegramMiniInitData {
  if (!botToken)
    throw new TelegramMiniAuthError('Telegram bot token is not configured.')
  if (!initData)
    throw new TelegramMiniAuthError('Telegram init data is required.')

  try {
    validate(initData, botToken)
    const parsed = parse(initData)
    if (!parsed.user?.id)
      throw new TelegramMiniAuthError('Telegram user id is missing.')

    return {
      authDate: parsed.auth_date,
      queryId: parsed.query_id,
      user: parsed.user,
    }
  }
  catch (error) {
    if (error instanceof TelegramMiniAuthError)
      throw error
    throw new TelegramMiniAuthError(error instanceof Error ? error.message : 'Telegram init data is invalid.')
  }
}
