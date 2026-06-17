import { mkdirSync } from 'node:fs'
import { drizzle as drizzlePglite } from 'drizzle-orm/pglite'
import { drizzle as drizzlePostgres } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as schema from '../../db/schema'
import { resolveArkDataPath } from './env'

type DatabaseClient = 'pglite' | 'postgres'

interface DatabaseConfig {
  client: DatabaseClient
  dataDir?: string
  url?: string
}

let postgresClient: postgres.Sql | undefined
let database: ReturnType<typeof drizzlePostgres<typeof schema>> | ReturnType<typeof drizzlePglite<typeof schema>> | undefined

function normalizeDbClient(value: string | undefined): DatabaseClient | null {
  if (!value)
    return null

  const normalized = value.toLowerCase()
  if (normalized === 'postgres' || normalized === 'pglite')
    return normalized

  throw new Error(`DB_CLIENT=${value} is not supported. Use DB_CLIENT=pglite or DB_CLIENT=postgres.`)
}

export function resolveDatabaseConfig(env: NodeJS.ProcessEnv = process.env): DatabaseConfig {
  const explicitClient = normalizeDbClient(env.DB_CLIENT)
  const client = explicitClient ?? (env.DATABASE_URL ? 'postgres' : 'pglite')

  if (client === 'postgres') {
    if (!env.DATABASE_URL)
      throw new Error('DATABASE_URL is required when DB_CLIENT=postgres.')

    return {
      client,
      url: env.DATABASE_URL,
    }
  }

  return {
    client,
    dataDir: env.DB_DATA_DIR || resolveArkDataPath('database', env),
  }
}

export function useDatabase() {
  if (database)
    return database

  const config = resolveDatabaseConfig()

  if (config.client === 'postgres') {
    postgresClient = postgres(config.url!, {
      max: 10,
      prepare: false,
    })

    database = drizzlePostgres(postgresClient, { schema })
    return database
  }

  mkdirSync(config.dataDir!, { recursive: true })

  database = drizzlePglite({
    connection: {
      dataDir: config.dataDir,
    },
    schema,
  })

  return database
}

export function queryResultRows<T = Record<string, unknown>>(result: { rows: T[] } | T[]) {
  return Array.isArray(result) ? result : result.rows
}

export async function resetDatabaseForTests() {
  if (postgresClient)
    await postgresClient.end({ timeout: 1 })

  postgresClient = undefined
  database = undefined
}
