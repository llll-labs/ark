import type { JWTPayload, JWTVerifyGetKey } from 'jose'
import { createRemoteJWKSet, jwtVerify } from 'jose'

export const telegramOAuthIssuer = 'https://oauth.telegram.org'
export const telegramOAuthDiscoveryUrl = `${telegramOAuthIssuer}/.well-known/openid-configuration`
export const telegramOAuthJwksUrl = `${telegramOAuthIssuer}/.well-known/jwks.json`

const telegramJwks = createRemoteJWKSet(new URL(telegramOAuthJwksUrl))

export interface TelegramOAuthClaims extends JWTPayload {
  first_name?: string
  id?: number | string
  last_name?: string
  name?: string
  picture?: string
  preferred_username?: string
  username?: string
}

export interface TelegramOAuthUserInfo {
  email: string
  emailVerified: boolean
  id: string
  image?: string
  name: string
  username?: string
}

export interface TelegramOAuthTokens {
  idToken?: null | string
}

export interface VerifyTelegramOAuthOptions {
  audience?: string
  issuer?: string
  jwks?: JWTVerifyGetKey
}

export class TelegramOAuthError extends Error {}

export function telegramOAuthClientId() {
  return String(process.env.TELEGRAM_OAUTH_CLIENT_ID ?? '').trim()
}

export function telegramOAuthClientSecret() {
  return String(process.env.TELEGRAM_OAUTH_CLIENT_SECRET ?? '').trim()
}

export function telegramOAuthConfigured() {
  return Boolean(telegramOAuthClientId() && telegramOAuthClientSecret())
}

export function telegramOAuthUserId(claims: TelegramOAuthClaims) {
  return String(claims.id ?? claims.sub ?? '').trim()
}

export function telegramOAuthDisplayName(claims: TelegramOAuthClaims) {
  const explicit = String(claims.name ?? '').trim()
  if (explicit)
    return explicit

  const fullName = [claims.first_name, claims.last_name]
    .map(value => String(value ?? '').trim())
    .filter(Boolean)
    .join(' ')
  if (fullName)
    return fullName

  const username = String(claims.preferred_username ?? claims.username ?? '').trim()
  const id = telegramOAuthUserId(claims)
  return username || (id ? `telegram-${id}` : 'telegram-user')
}

export function mapTelegramOAuthClaimsToUserInfo(claims: TelegramOAuthClaims): TelegramOAuthUserInfo {
  const id = telegramOAuthUserId(claims)
  if (!id)
    throw new TelegramOAuthError('Telegram OAuth user id is missing.')

  const username = String(claims.preferred_username ?? claims.username ?? '').trim()
  return {
    email: `${id}@t.me`,
    emailVerified: true,
    id,
    image: typeof claims.picture === 'string' && claims.picture.trim() ? claims.picture : undefined,
    name: telegramOAuthDisplayName(claims),
    username: username || undefined,
  }
}

export async function verifyTelegramOAuthIdToken(
  idToken: string,
  options: VerifyTelegramOAuthOptions = {},
) {
  const audience = options.audience ?? telegramOAuthClientId()
  if (!audience)
    throw new TelegramOAuthError('Telegram OAuth client id is not configured.')
  if (!idToken)
    throw new TelegramOAuthError('Telegram OAuth id token is missing.')

  const { payload } = await jwtVerify(idToken, options.jwks ?? telegramJwks, {
    audience,
    issuer: options.issuer ?? telegramOAuthIssuer,
  })

  return mapTelegramOAuthClaimsToUserInfo(payload as TelegramOAuthClaims)
}

export async function telegramOAuthUserInfo(tokens: TelegramOAuthTokens) {
  return verifyTelegramOAuthIdToken(String(tokens.idToken ?? ''))
}
