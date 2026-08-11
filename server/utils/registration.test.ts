import assert from 'node:assert/strict'
import test from 'node:test'
import { arkRegistrationMode, arkSelfRegistrationAllowed } from './registration'

test('registration defaults to open for legacy or missing settings', () => {
  assert.equal(arkRegistrationMode(undefined), 'open')
  assert.equal(arkRegistrationMode({}), 'open')
  assert.equal(arkRegistrationMode({ registration_enabled: true }), 'open')
  assert.equal(arkSelfRegistrationAllowed(undefined), true)
})

test('closed registration blocks self-service account creation', () => {
  assert.equal(arkRegistrationMode({ registration_mode: 'closed' }), 'closed')
  assert.equal(arkRegistrationMode({ registration_enabled: false }), 'closed')
  assert.equal(arkSelfRegistrationAllowed({ registration_mode: 'closed' }), false)
})

test('invite registration does not permit uninvited self-service account creation', () => {
  assert.equal(arkRegistrationMode({ registration_mode: 'invite' }), 'invite')
  assert.equal(arkSelfRegistrationAllowed({ registration_mode: 'invite' }), false)
})

test('an explicit valid mode wins over the legacy registration flag', () => {
  assert.equal(arkRegistrationMode({ registration_enabled: false, registration_mode: 'open' }), 'open')
  assert.equal(arkRegistrationMode({ registration_enabled: true, registration_mode: 'closed' }), 'closed')
})
