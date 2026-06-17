#!/usr/bin/env node
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

function loadEnvFile(path) {
  if (!existsSync(path))
    return {}

  const env = {}
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#'))
      continue

    const separator = trimmed.indexOf('=')
    if (separator <= 0)
      continue

    const key = trimmed.slice(0, separator).trim()
    const value = trimmed.slice(separator + 1).trim().replace(/^(['"])(.*)\1$/, '$2')
    env[key] = value
  }
  return env
}

const fileEnv = loadEnvFile(resolve(process.cwd(), '.env'))
const env = { ...fileEnv, ...process.env }
const port = Number.parseInt(env.PORT || '5400', 10)

if (!Number.isFinite(port) || port <= 0) {
  console.error(`Invalid PORT value: ${env.PORT}`)
  process.exit(1)
}

env.PORT ||= String(port)
env.POSTGRES_PORT ||= String(port + 1)
env.RUSTFS_PORT ||= String(port + 2)
env.RUSTFS_CONSOLE_PORT ||= String(port + 3)

const command = process.argv[2]
const args = process.argv.slice(3)

if (!command) {
  console.error('Usage: ark-port-cell <command> [...args]')
  process.exit(1)
}

const result = spawnSync(command, args, {
  env,
  stdio: 'inherit',
})

process.exit(result.status ?? 1)
