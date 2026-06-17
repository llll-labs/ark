import { existsSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'

function loadEnvFile(path: string) {
  if (!existsSync(path))
    return

  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#'))
      continue
    const separator = trimmed.indexOf('=')
    if (separator <= 0)
      continue
    const key = trimmed.slice(0, separator).trim()
    const value = trimmed.slice(separator + 1).trim().replace(/^(['"])(.*)\1$/, '$2')
    process.env[key] ??= value
  }
}

loadEnvFile(resolve(process.cwd(), '.env'))

function findWorkspaceRoot(start: string) {
  let current = resolve(start)

  while (true) {
    if (existsSync(resolve(current, 'pnpm-workspace.yaml')))
      return current

    const parent = dirname(current)
    if (parent === current)
      return start

    current = parent
  }
}

export function defaultArkDataDir() {
  return defaultArkDataDirForEnv(process.env)
}

export function defaultArkPort(env: NodeJS.ProcessEnv = process.env) {
  return (env.PORT || '5400').replace(/[^\w.-]+/g, '_')
}

export function defaultArkDataDirForEnv(env: NodeJS.ProcessEnv = process.env) {
  return resolve(findWorkspaceRoot(process.cwd()), '.ark', defaultArkPort(env))
}

export function resolveArkDataPath(child: string, env: NodeJS.ProcessEnv = process.env) {
  return resolve(defaultArkDataDirForEnv(env), child)
}
