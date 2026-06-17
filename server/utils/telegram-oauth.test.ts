/* eslint-disable test/no-import-node-test */
import { strict as assert } from 'node:assert'
import test from 'node:test'
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from 'jose'
import {
  mapTelegramOAuthClaimsToUserInfo,
  telegramOAuthClientId,
  telegramOAuthClientSecret,
  telegramOAuthIssuer,
  verifyTelegramOAuthIdToken,
} from './telegram-oauth'

async function signedTelegramToken(claims: Record<string, unknown>, options: { audience?: string, issuer?: string } = {}) {
  const { privateKey, publicKey } = await generateKeyPair('RS256')
  const jwk = await exportJWK(publicKey)
  jwk.kid = 'telegram-test-key'
  const jwks = createLocalJWKSet({ keys: [jwk] })
  const token = await new SignJWT(claims)
    .setProtectedHeader({ alg: 'RS256', kid: jwk.kid })
    .setIssuer(options.issuer ?? telegramOAuthIssuer)
    .setAudience(options.audience ?? 'telegram-client')
    .setIssuedAt()
    .setExpirationTime('5m')
    .sign(privateKey)
  return { jwks, token }
}

test('mapTelegramOAuthClaimsToUserInfo uses stable Telegram id synthetic email', () => {
  const user = mapTelegramOAuthClaimsToUserInfo({
    id: 12345,
    name: 'Ada Render',
    picture: 'https://cdn.example/avatar.jpg',
    sub: 'ignored',
    username: 'ada3d',
  })

  assert.equal(user.id, '12345')
  assert.equal(user.email, '12345@t.me')
  assert.equal(user.emailVerified, true)
  assert.equal(user.name, 'Ada Render')
  assert.equal(user.image, 'https://cdn.example/avatar.jpg')
  assert.equal(user.username, 'ada3d')
})

test('mapTelegramOAuthClaimsToUserInfo falls back from id to sub', () => {
  const user = mapTelegramOAuthClaimsToUserInfo({
    first_name: 'Ada',
    last_name: 'Lovelace',
    sub: '777',
  })

  assert.equal(user.id, '777')
  assert.equal(user.email, '777@t.me')
  assert.equal(user.name, 'Ada Lovelace')
})

test('mapTelegramOAuthClaimsToUserInfo falls back to username or telegram id for name', () => {
  assert.equal(mapTelegramOAuthClaimsToUserInfo({ sub: '1', username: 'maker' }).name, 'maker')
  assert.equal(mapTelegramOAuthClaimsToUserInfo({ sub: '2' }).name, 'telegram-2')
})

test('verifyTelegramOAuthIdToken accepts valid Telegram OIDC token', async () => {
  const { jwks, token } = await signedTelegramToken({
    id: '999',
    name: 'Valid User',
    picture: 'https://cdn.example/valid.jpg',
    sub: '999',
  })

  const user = await verifyTelegramOAuthIdToken(token, {
    audience: 'telegram-client',
    jwks,
  })

  assert.equal(user.id, '999')
  assert.equal(user.email, '999@t.me')
  assert.equal(user.name, 'Valid User')
})

test('verifyTelegramOAuthIdToken rejects invalid issuer or audience', async () => {
  const { jwks, token } = await signedTelegramToken({
    name: 'Invalid User',
    sub: '999',
  }, {
    audience: 'other-client',
    issuer: 'https://example.invalid',
  })

  await assert.rejects(
    () => verifyTelegramOAuthIdToken(token, {
      audience: 'telegram-client',
      jwks,
    }),
  )
})

test('telegram oauth config reads TELEGRAM_OAUTH env', () => {
  const previousClientId = process.env.TELEGRAM_OAUTH_CLIENT_ID
  const previousClientSecret = process.env.TELEGRAM_OAUTH_CLIENT_SECRET

  try {
    process.env.TELEGRAM_OAUTH_CLIENT_ID = 'oauth-client-id'
    process.env.TELEGRAM_OAUTH_CLIENT_SECRET = 'oauth-client-secret'

    assert.equal(telegramOAuthClientId(), 'oauth-client-id')
    assert.equal(telegramOAuthClientSecret(), 'oauth-client-secret')
  }
  finally {
    if (previousClientId === undefined)
      delete process.env.TELEGRAM_OAUTH_CLIENT_ID
    else
      process.env.TELEGRAM_OAUTH_CLIENT_ID = previousClientId
    if (previousClientSecret === undefined)
      delete process.env.TELEGRAM_OAUTH_CLIENT_SECRET
    else
      process.env.TELEGRAM_OAUTH_CLIENT_SECRET = previousClientSecret
  }
})
