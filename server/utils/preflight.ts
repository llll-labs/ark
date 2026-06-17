/**
 * Core (@kurark/ark) production env preflight.
 *
 * Two tiers:
 *  - CONSISTENCY errors: contradictory / half-configured env that cannot work in
 *    any mode (e.g. a storage location declared with driver=s3 but no bucket).
 *    These are fatal in dev AND production — like Directus, the app must refuse
 *    to boot rather than start in a broken state.
 *  - PRODUCTION-HARDENING errors: weak/dev secrets, local-filesystem storage,
 *    non-HTTPS origin, etc. Fatal only when running in production; surfaced as
 *    warnings in dev so the zero-env embedded runtime still boots.
 *
 * Zero env set => embedded local runtime => no errors.
 *
 * Tenant-specific policy (provider endpoints, AI keys, tenant secret literals)
 * is NOT here — it lives in the consuming app's own preflight (e.g. a server
 * plugin), layered on top of this.
 */
type Env = NodeJS.ProcessEnv

const DEV_SECRET_MARKERS = ['dev-secret', 'change-before-production', 'changeme', 'password']

export function isProductionEnv(env: Env = process.env): boolean {
  return String(env.NODE_ENV ?? '').trim().toLowerCase() === 'production'
}

function val(env: Env, name: string): string {
  return String(env[name] ?? '').trim()
}

function has(env: Env, name: string): boolean {
  return val(env, name).length > 0
}

function storageEnvKey(location: string, suffix: string): string {
  return `STORAGE_${location.toUpperCase().replace(/[^A-Z0-9]+/g, '_')}_${suffix}`
}

function anyHas(env: Env, names: string[]): boolean {
  return names.some(name => has(env, name))
}

export interface PreflightResult {
  errors: string[]
  warnings: string[]
}

/**
 * `errors` already accounts for `production`: consistency issues are always
 * included; hardening issues are included only when `production` is true (else
 * they appear in `warnings`). Callers just throw when `errors.length`.
 */
export function validateCoreEnv(env: Env = process.env, production: boolean = isProductionEnv(env)): PreflightResult {
  const errors: string[] = []
  const warnings: string[] = []

  // Hardening issues route to errors in prod, warnings in dev.
  const hardening = production ? errors : warnings

  // --- Auth secret -----------------------------------------------------------
  const secret = val(env, 'BETTER_AUTH_SECRET')
  if (!secret) {
    hardening.push('BETTER_AUTH_SECRET is required in production.')
  }
  else {
    if (secret.length < 32)
      hardening.push('BETTER_AUTH_SECRET must be at least 32 characters.')
    if (DEV_SECRET_MARKERS.some(marker => secret.toLowerCase().includes(marker)))
      hardening.push('BETTER_AUTH_SECRET still looks like a development secret.')
  }

  // --- Auth origin (consistency + hardening) ---------------------------------
  const authUrl = val(env, 'BETTER_AUTH_URL')
  let authOrigin: string | null = null
  if (authUrl) {
    try {
      const parsed = new URL(authUrl)
      authOrigin = parsed.origin
      if (production && parsed.protocol !== 'https:')
        errors.push('BETTER_AUTH_URL must use https:// in production.')
    }
    catch {
      // Malformed URL is a consistency error in any mode.
      errors.push('BETTER_AUTH_URL must be a valid URL.')
    }
  }
  else {
    hardening.push('BETTER_AUTH_URL is required in production.')
  }

  const trustedRaw = val(env, 'BETTER_AUTH_TRUSTED_ORIGINS')
  if (authOrigin) {
    const trusted = trustedRaw.split(',').map(s => s.trim()).filter(Boolean)
    if (trustedRaw && !trusted.includes(authOrigin)) {
      // You set both, but they disagree — always fatal.
      errors.push('BETTER_AUTH_TRUSTED_ORIGINS must include the exact BETTER_AUTH_URL origin.')
    }
    else if (!trustedRaw) {
      hardening.push('BETTER_AUTH_TRUSTED_ORIGINS must include the BETTER_AUTH_URL origin in production.')
    }
  }

  // --- Admin bootstrap -------------------------------------------------------
  if (!has(env, 'ADMIN_EMAIL'))
    hardening.push('ADMIN_EMAIL is required for the operator account.')
  if (!has(env, 'ADMIN_PASSWORD'))
    hardening.push('ADMIN_PASSWORD is required for the operator account.')

  // --- Email verification transport -----------------------------------------
  const emailKeys = ['EMAIL_FROM', 'EMAIL_SMTP_HOST', 'EMAIL_SMTP_USER', 'EMAIL_SMTP_PASSWORD']
  if (anyHas(env, emailKeys)) {
    for (const key of emailKeys) {
      if (!has(env, key))
        errors.push(`${key} is required when SMTP email is configured.`)
    }
    const smtpPort = val(env, 'EMAIL_SMTP_PORT')
    if (smtpPort && !Number.isFinite(Number.parseInt(smtpPort, 10)))
      errors.push('EMAIL_SMTP_PORT must be a number.')
  }
  else {
    hardening.push('EMAIL_FROM, EMAIL_SMTP_HOST, EMAIL_SMTP_USER, and EMAIL_SMTP_PASSWORD are required for email verification.')
  }

  // --- Database --------------------------------------------------------------
  const dbClient = val(env, 'DB_CLIENT').toLowerCase()
  if (dbClient && !['pglite', 'postgres'].includes(dbClient))
    errors.push('DB_CLIENT must be "pglite" or "postgres".')

  const databaseUrl = val(env, 'DATABASE_URL')
  if (databaseUrl) {
    try {
      void new URL(databaseUrl)
    }
    catch {
      errors.push('DATABASE_URL must be a valid connection URL.')
    }
  }
  else if (dbClient === 'postgres') {
    errors.push('DATABASE_URL is required when DB_CLIENT=postgres.')
  }
  else {
    // No DATABASE_URL => embedded PGlite. Fine locally, not for production.
    hardening.push('DATABASE_URL is required in production (embedded PGlite is local-only).')
  }

  // --- Storage ---------------------------------------------------------------
  const locations = val(env, 'STORAGE_LOCATIONS').split(',').map(s => s.trim().toLowerCase()).filter(Boolean)
  if (locations.length) {
    const privateLocation = (val(env, 'STORAGE_PRIVATE_LOCATION') || val(env, 'STORAGE_DEFAULT_LOCATION') || locations[0] || '').toLowerCase()
    if (!locations.includes(privateLocation))
      errors.push('STORAGE_PRIVATE_LOCATION must be one of STORAGE_LOCATIONS.')

    for (const location of locations) {
      const driver = val(env, storageEnvKey(location, 'DRIVER')).toLowerCase()
      if (!driver) {
        errors.push(`${storageEnvKey(location, 'DRIVER')} is required because "${location}" is listed in STORAGE_LOCATIONS.`)
        continue
      }
      if (driver === 's3') {
        for (const suffix of ['BUCKET', 'ENDPOINT', 'KEY', 'SECRET']) {
          if (!has(env, storageEnvKey(location, suffix)))
            errors.push(`${storageEnvKey(location, suffix)} is required for s3 storage location "${location}".`)
        }
      }
      else if (driver === 'local') {
        hardening.push(`Storage location "${location}" uses the local filesystem driver; production needs S3-compatible storage.`)
      }
      else {
        errors.push(`${storageEnvKey(location, 'DRIVER')} must be "s3" or "local".`)
      }
    }
  }
  else if (production) {
    errors.push('STORAGE_LOCATIONS is required in production (the local filesystem driver is local-only).')
  }

  // --- Port ------------------------------------------------------------------
  const port = val(env, 'PORT')
  if (port && !/^\d+$/.test(port))
    errors.push('PORT must be numeric when set.')

  if (production && !isProductionEnv(env))
    warnings.push('NODE_ENV is not "production"; set it in the deployed process manager.')

  return { errors, warnings }
}

/**
 * Throw a single aggregated Error when env is invalid. Used by the boot guard.
 */
export function assertCoreEnv(env: Env = process.env, label = '[ark]'): void {
  const production = isProductionEnv(env)
  const { errors, warnings } = validateCoreEnv(env, production)

  for (const warning of warnings)
    console.warn(`${label} preflight: ${warning}`)

  if (errors.length) {
    const heading = production
      ? `${label} production preflight failed — refusing to start:`
      : `${label} env preflight failed (contradictory configuration) — refusing to start:`
    throw new Error([heading, ...errors.map(e => `  - ${e}`)].join('\n'))
  }
}
