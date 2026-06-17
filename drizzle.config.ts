import { mkdirSync } from 'node:fs'
import { defineConfig } from 'drizzle-kit'
import { resolveArkDataPath } from './server/utils/env'

const dbClient = process.env.DB_CLIENT?.toLowerCase()
const databaseUrl = process.env.DATABASE_URL
const usePostgres = dbClient === 'postgres' || (!dbClient && databaseUrl)

if (dbClient && !['pglite', 'postgres'].includes(dbClient))
  throw new Error(`DB_CLIENT=${process.env.DB_CLIENT} is not supported. Use DB_CLIENT=pglite or DB_CLIENT=postgres.`)

if (usePostgres && !databaseUrl)
  throw new Error('DATABASE_URL is required when DB_CLIENT=postgres.')

const pgliteDataDir = process.env.DB_DATA_DIR || resolveArkDataPath('database', process.env)

if (!usePostgres)
  mkdirSync(pgliteDataDir, { recursive: true })

export default defineConfig({
  schema: './db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  driver: usePostgres ? undefined : 'pglite',
  dbCredentials: {
    url: usePostgres ? databaseUrl! : pgliteDataDir,
  },
  migrations: {
    schema: 'drizzle',
    table: '__ark_migrations',
  },
})
