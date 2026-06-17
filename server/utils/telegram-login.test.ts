/* eslint-disable test/no-import-node-test */
import assert from 'node:assert/strict'
import test from 'node:test'
import {
  telegramLoginDataCheckString,
  telegramLoginHash,
  telegramLoginUserName,
  validateTelegramLoginAuth,
} from './telegram-login'

test('telegram login auth validates a signed login_url payload', () => {
  const botToken = '123456:telegram-test-token'
  const payload = {
    auth_date: '1781624166',
    first_name: 'Ada',
    id: '424242',
    last_name: 'Render',
    photo_url: 'https://t.me/i/userpic/320/test.jpg',
    username: 'adarender',
  }
  const signed = {
    ...payload,
    hash: telegramLoginHash(payload, botToken),
  }

  assert.equal(telegramLoginDataCheckString(signed), [
    'auth_date=1781624166',
    'first_name=Ada',
    'id=424242',
    'last_name=Render',
    'photo_url=https://t.me/i/userpic/320/test.jpg',
    'username=adarender',
  ].join('\n'))
  assert.deepEqual(validateTelegramLoginAuth(signed, botToken, new Date('2026-06-16T15:40:00.000Z')), signed)
})

test('telegram login auth rejects invalid hashes', () => {
  assert.throws(() => validateTelegramLoginAuth({
    auth_date: '1781624166',
    first_name: 'Ada',
    hash: '0'.repeat(64),
    id: '424242',
  }, '123456:telegram-test-token', new Date('2026-06-16T15:40:00.000Z')), /hash is invalid/)
})

test('telegram login name falls back to username and id', () => {
  assert.equal(telegramLoginUserName({ first_name: 'Ada', id: '1', last_name: 'Render' }), 'Ada Render')
  assert.equal(telegramLoginUserName({ id: '1', username: 'adarender' }), 'adarender')
  assert.equal(telegramLoginUserName({ id: '1' }), 'telegram-1')
})
