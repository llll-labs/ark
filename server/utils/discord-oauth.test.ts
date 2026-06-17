/* eslint-disable test/no-import-node-test */
import assert from 'node:assert/strict'
import test from 'node:test'
import {
  discordAvatarUrl,
  discordDisplayName,
  discordOAuthClientId,
  discordOAuthClientSecret,
  mapDiscordUserToOAuthUserInfo,
} from './discord-oauth'

test('mapDiscordUserToOAuthUserInfo maps real email and avatar', () => {
  const user = mapDiscordUserToOAuthUserInfo({
    avatar: 'avatarhash',
    email: 'Ada@Example.Test',
    global_name: 'Ada Render',
    id: '12345',
    username: 'ada3d',
    verified: true,
  })

  assert.equal(user.id, '12345')
  assert.equal(user.email, 'ada@example.test')
  assert.equal(user.emailVerified, true)
  assert.equal(user.name, 'Ada Render')
  assert.equal(user.image, 'https://cdn.discordapp.com/avatars/12345/avatarhash.png?size=256')
  assert.equal(user.username, 'ada3d')
})

test('mapDiscordUserToOAuthUserInfo synthesizes missing email', () => {
  const user = mapDiscordUserToOAuthUserInfo({
    id: '777',
    username: 'maker',
  })

  assert.equal(user.email, '777@discord.local')
  assert.equal(user.emailVerified, false)
  assert.equal(user.name, 'maker')
  assert.equal(user.image, undefined)
})

test('discordAvatarUrl uses gif for animated avatars', () => {
  assert.equal(
    discordAvatarUrl({ avatar: 'a_animatedhash', id: '42' }),
    'https://cdn.discordapp.com/avatars/42/a_animatedhash.gif?size=256',
  )
})

test('discordDisplayName falls back to Discord id', () => {
  assert.equal(discordDisplayName({ id: '42' }), 'discord-42')
})

test('discord oauth config reads DISCORD_OAUTH env', () => {
  const previousClientId = process.env.DISCORD_OAUTH_CLIENT_ID
  const previousClientSecret = process.env.DISCORD_OAUTH_CLIENT_SECRET

  try {
    process.env.DISCORD_OAUTH_CLIENT_ID = 'oauth-client-id'
    process.env.DISCORD_OAUTH_CLIENT_SECRET = 'oauth-client-secret'

    assert.equal(discordOAuthClientId(), 'oauth-client-id')
    assert.equal(discordOAuthClientSecret(), 'oauth-client-secret')
  }
  finally {
    if (previousClientId === undefined)
      delete process.env.DISCORD_OAUTH_CLIENT_ID
    else
      process.env.DISCORD_OAUTH_CLIENT_ID = previousClientId
    if (previousClientSecret === undefined)
      delete process.env.DISCORD_OAUTH_CLIENT_SECRET
    else
      process.env.DISCORD_OAUTH_CLIENT_SECRET = previousClientSecret
  }
})
