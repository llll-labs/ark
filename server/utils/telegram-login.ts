import { createHash } from 'node:crypto'
import { signData, validate } from '@tma.js/init-data-node'

export interface TelegramLoginUser {
  auth_date: string
  first_name?: string
  hash: string
  id: string
  last_name?: string
  photo_url?: string
  username?: string
}

export class TelegramLoginAuthError extends Error {}

export const telegramLoginFields = [
  'auth_date',
  'first_name',
  'id',
  'last_name',
  'photo_url',
  'username',
] as const

type TelegramLoginField = typeof telegramLoginFields[number]
type TelegramLoginHashInput = Pick<TelegramLoginUser, TelegramLoginField>

function stringField(input: Record<string, unknown>, field: TelegramLoginField) {
  const value = input[field]
  if (value == null)
    return undefined
  if (typeof value !== 'string')
    throw new TelegramLoginAuthError(`Telegram ${field} is invalid.`)
  return value
}

export function telegramLoginUserName(user: Pick<TelegramLoginUser, 'first_name' | 'id' | 'last_name' | 'username'>) {
  return [user.first_name, user.last_name].filter(Boolean).join(' ').trim()
    || user.username
    || `telegram-${user.id}`
}

export function telegramLoginDataCheckString(input: TelegramLoginHashInput) {
  return Object.entries(input)
    .filter((entry): entry is [string, string] => entry[0] !== 'hash' && typeof entry[1] === 'string')
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${value}`)
    .join('\n')
}

function telegramLoginTokenSecret(botToken: string) {
  return createHash('sha256').update(botToken).digest('hex')
}

function telegramLoginSearchParams(input: TelegramLoginHashInput & Pick<TelegramLoginUser, 'hash'>) {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(input)) {
    if (typeof value === 'string')
      params.append(key, value)
  }
  return params
}

export function telegramLoginHash(input: TelegramLoginHashInput, botToken: string) {
  return signData(telegramLoginDataCheckString(input), telegramLoginTokenSecret(botToken), {
    tokenHashed: true,
  })
}

export function validateTelegramLoginAuth(
  input: Record<string, unknown>,
  botToken: string,
  now = new Date(),
): TelegramLoginUser {
  if (!botToken)
    throw new TelegramLoginAuthError('Telegram bot token is not configured.')

  const id = stringField(input, 'id')?.trim()
  const authDate = stringField(input, 'auth_date')?.trim()
  const hash = typeof input.hash === 'string' ? input.hash.trim() : ''
  if (!id)
    throw new TelegramLoginAuthError('Telegram user id is missing.')
  if (!authDate)
    throw new TelegramLoginAuthError('Telegram auth date is missing.')
  if (!hash)
    throw new TelegramLoginAuthError('Telegram hash is missing.')

  const authTimestamp = Number.parseInt(authDate, 10)
  if (!Number.isFinite(authTimestamp))
    throw new TelegramLoginAuthError('Telegram auth date is invalid.')

  const ageMs = now.getTime() - authTimestamp * 1000
  if (ageMs > 24 * 60 * 60 * 1000)
    throw new TelegramLoginAuthError('Telegram login data is expired.')
  if (ageMs < -5 * 60 * 1000)
    throw new TelegramLoginAuthError('Telegram login data is from the future.')

  const user: TelegramLoginUser = {
    auth_date: authDate,
    first_name: stringField(input, 'first_name')?.trim() || undefined,
    hash,
    id,
    last_name: stringField(input, 'last_name')?.trim() || undefined,
    photo_url: stringField(input, 'photo_url')?.trim() || undefined,
    username: stringField(input, 'username')?.trim() || undefined,
  }

  try {
    validate(telegramLoginSearchParams(user), telegramLoginTokenSecret(botToken), {
      expiresIn: 0,
      tokenHashed: true,
    })
  }
  catch {
    throw new TelegramLoginAuthError('Telegram hash is invalid.')
  }

  return user
}
