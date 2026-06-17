export interface DiscordOAuthTokens {
  accessToken?: null | string
}

export interface DiscordUserInfo {
  avatar?: null | string
  discriminator?: null | string
  email?: null | string
  global_name?: null | string
  id?: null | string
  username?: null | string
  verified?: boolean
}

export interface DiscordOAuthUserInfo {
  email: string
  emailVerified: boolean
  id: string
  image?: string
  name: string
  username?: string
}

export class DiscordOAuthError extends Error {}

export function discordOAuthClientId() {
  return String(process.env.DISCORD_OAUTH_CLIENT_ID ?? '').trim()
}

export function discordOAuthClientSecret() {
  return String(process.env.DISCORD_OAUTH_CLIENT_SECRET ?? '').trim()
}

export function discordOAuthConfigured() {
  return Boolean(discordOAuthClientId() && discordOAuthClientSecret())
}

export function discordDisplayName(profile: DiscordUserInfo) {
  const globalName = String(profile.global_name ?? '').trim()
  if (globalName)
    return globalName

  const username = String(profile.username ?? '').trim()
  if (username)
    return username

  const id = String(profile.id ?? '').trim()
  return id ? `discord-${id}` : 'discord-user'
}

export function discordAvatarUrl(profile: DiscordUserInfo, size = 256) {
  const id = String(profile.id ?? '').trim()
  const avatar = String(profile.avatar ?? '').trim()
  if (!id || !avatar)
    return undefined

  const extension = avatar.startsWith('a_') ? 'gif' : 'png'
  return `https://cdn.discordapp.com/avatars/${encodeURIComponent(id)}/${encodeURIComponent(avatar)}.${extension}?size=${size}`
}

export function mapDiscordUserToOAuthUserInfo(profile: DiscordUserInfo): DiscordOAuthUserInfo {
  const id = String(profile.id ?? '').trim()
  if (!id)
    throw new DiscordOAuthError('Discord OAuth user id is missing.')

  const email = String(profile.email ?? '').trim().toLowerCase()
  const username = String(profile.username ?? '').trim()

  return {
    email: email || `${id}@discord.local`,
    emailVerified: Boolean(email && profile.verified),
    id,
    image: discordAvatarUrl(profile),
    name: discordDisplayName(profile),
    username: username || undefined,
  }
}

export async function discordOAuthUserInfo(tokens: DiscordOAuthTokens) {
  const accessToken = String(tokens.accessToken ?? '').trim()
  if (!accessToken)
    throw new DiscordOAuthError('Discord OAuth access token is missing.')

  const response = await fetch('https://discord.com/api/users/@me', {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  })
  if (!response.ok)
    throw new DiscordOAuthError(`Discord user info request failed: ${response.status}`)

  return mapDiscordUserToOAuthUserInfo(await response.json() as DiscordUserInfo)
}
