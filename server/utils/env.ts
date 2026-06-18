import { existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { config as loadDotenv } from 'dotenv'

loadDotenv({ path: resolve(process.cwd(), '.env'), quiet: true })

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
