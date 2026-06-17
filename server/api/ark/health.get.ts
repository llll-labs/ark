import { sql } from 'drizzle-orm'
import { defineEventHandler } from 'h3'
import { ensureDefaultArk } from '../../utils/authorization'
import { useDatabase } from '../../utils/db'

export default defineEventHandler(async () => {
  await ensureDefaultArk()
  await useDatabase().execute(sql`select 1 as ok`)
  return {
    database: 'reachable',
    ok: true,
  }
})
