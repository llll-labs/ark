/**
 * Shared application secret.
 *
 * Better Auth (session signing) and the local file-URL HMAC signer deliberately
 * share one secret: both are gated by the same trust boundary and `prod:preflight`
 * enforces a strong value in production. This module centralizes the dev fallback
 * so the two callers cannot drift, and emits a single loud warning when the
 * insecure built-in dev secret is used.
 */

export const DEV_FALLBACK_SECRET = 'ark-dev-secret-change-before-production'

let warned = false

/**
 * Resolve the shared app secret. Returns `BETTER_AUTH_SECRET` when set; otherwise
 * falls back to an insecure built-in dev secret and warns once. `prod:preflight`
 * hard-fails on the fallback, so this only ever runs in local/dev.
 */
export function resolveAppSecret(env: NodeJS.ProcessEnv = process.env): string {
  const configured = env.BETTER_AUTH_SECRET?.trim()
  if (configured)
    return configured

  if (!warned) {
    warned = true
    console.warn(
      '[ark] WEAK SECRET: BETTER_AUTH_SECRET is not set; falling back to an insecure built-in '
      + 'development secret shared by auth sessions and file-URL signing. Set a strong '
      + 'BETTER_AUTH_SECRET before production. `pnpm prod:preflight` '
      + 'rejects this fallback.',
    )
  }
  return DEV_FALLBACK_SECRET
}
