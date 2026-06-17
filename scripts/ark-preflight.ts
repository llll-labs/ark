#!/usr/bin/env node
import { isProductionEnv, validateCoreEnv } from '../server/utils/preflight'

// CI / pre-deploy check (no boot). Same validator as the runtime boot guard.
// Run via tsx. `--production` forces the production tier even if NODE_ENV is
// unset in CI.
const forceProduction = process.argv.slice(2).includes('--production')
const production = forceProduction || isProductionEnv(process.env)

const { errors, warnings } = validateCoreEnv(process.env, production)

if (warnings.length) {
  console.log('Core preflight warnings:')
  for (const warning of warnings)
    console.log(`  - ${warning}`)
}

if (errors.length) {
  console.error(`\nCore preflight failed (${production ? 'production' : 'consistency'}):`)
  for (const error of errors)
    console.error(`  - ${error}`)
  process.exit(1)
}

console.log(`Core preflight passed${production ? ' (production tier)' : ''}.`)
