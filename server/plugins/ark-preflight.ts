import { assertCoreEnv } from '../utils/preflight'

/**
 * Boot guard: validate core env at server startup. Contradictory configuration
 * fails in any mode; production-hardening gaps fail only when NODE_ENV=production.
 * Throwing here aborts Nitro startup — the app refuses to boot in a broken state
 * rather than serving with mixed/unsafe env (Directus-style).
 *
 * Tenant apps layer their own checks via their own server plugin.
 */
export default defineNitroPlugin(() => {
  assertCoreEnv(process.env, '[ark]')
})
