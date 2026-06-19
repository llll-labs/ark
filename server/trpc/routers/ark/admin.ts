import type { ArkAdminTableRegistration } from '../../../utils/app-extensions'
import { getTableColumns } from 'drizzle-orm'
import { getTableConfig } from 'drizzle-orm/pg-core'
import {
  arkUsers,
  arkChannels,
  arkFiles,
  arkGrants,
  arkMarketCategories,
  arkMarketJobs,
  arkMarketSkills,
  arkMarketStores,
  arkMarketStyles,
  arkMarketTags,
  arkMarketTools,
  arkMemberships,
  arkNotifications,
  arkRoles,
  arkSpaces,
} from '../../../../db/schema'
import { arkCapabilityValues } from '../../../../db/zod'
import { isKnownArkCapability, loadArkAdminTableRegistrations, loadArkTenantCapabilities } from '../../../utils/app-extensions'
import {
  and,
  asc,
  baseProcedure,
  createTRPCRouter,
  desc,
  eq,
  getPublicSpace,
  inArray,
  isNull,
  requireSpaceAccess,
  sql,
  TRPCError,
  z,
} from './shared'

// Generic admin data browser + CRUD (Directus-style). Core tables are always
// present; tenant apps may register their own physical tables through
// app-extensions without making the layer import app-owned schema directly.
const CORE_ADMIN_TABLES: ArkAdminTableRegistration[] = [
  { key: 'users', label: 'ark.users', description: 'Core accounts', icon: 'i-lucide-user-round', group: 'identity', table: arkUsers },
  { key: 'spaces', label: 'ark.spaces', description: 'Personal and organization spaces', icon: 'i-lucide-panels-top-left', group: 'identity', table: arkSpaces },
  { key: 'memberships', label: 'ark_memberships', description: 'Roles per scope', icon: 'i-lucide-users', group: 'identity', table: arkMemberships },
  { key: 'jobs', label: 'ark.market_jobs', description: 'Vacancies and orders', icon: 'i-lucide-briefcase-business', group: 'market', table: arkMarketJobs },
  { key: 'stores', label: 'ark.market_stores', description: 'Seller storefronts', icon: 'i-lucide-store', group: 'market', table: arkMarketStores },
  { key: 'categories', label: 'ark.market_categories', description: 'Market categories', icon: 'i-lucide-folder-tree', group: 'market', table: arkMarketCategories },
  { key: 'skills', label: 'ark_market_skills', description: 'Market skills', icon: 'i-lucide-sparkles', group: 'market', table: arkMarketSkills },
  { key: 'tools', label: 'ark_market_tools', description: 'Market tools', icon: 'i-lucide-wrench', group: 'market', table: arkMarketTools },
  { key: 'styles', label: 'ark_market_styles', description: 'Market styles', icon: 'i-lucide-palette', group: 'market', table: arkMarketStyles },
  { key: 'tags', label: 'ark.market_tags', description: 'Market tags', icon: 'i-lucide-tag', group: 'market', table: arkMarketTags },
  { key: 'channels', label: 'ark_channels', description: 'Channels and threads', icon: 'i-lucide-hash', group: 'content', table: arkChannels },
  { key: 'notifications', label: 'ark.notifications', description: 'Notification outbox', icon: 'i-lucide-bell', group: 'system', table: arkNotifications },
  { key: 'files', label: 'ark.files', description: 'Uploaded files', icon: 'i-lucide-file', group: 'system', table: arkFiles },
]

function adminRegistrations() {
  const tables = new Map<string, ArkAdminTableRegistration>()
  for (const table of CORE_ADMIN_TABLES)
    tables.set(table.key, table)
  for (const table of loadArkAdminTableRegistrations())
    tables.set(table.key, table)
  return tables
}

function serializeTable(registration: ArkAdminTableRegistration) {
  return {
    description: registration.description,
    group: registration.group,
    icon: registration.icon,
    key: registration.key,
    label: registration.label,
    // The client must key edit/delete off this — registered app tables may use
    // a non-`id` primary key (e.g. ark.users → arkUserId).
    primaryKey: primaryKeyOf(registration),
  }
}

// Auto-managed columns: never shown as editable in the generic form.
const AUTO_COLUMNS = new Set(['id', 'createdAt', 'updatedAt', 'deletedAt'])
// Preferred human-readable label column for foreign-key display/pickers.
const LABEL_PREFERENCE = ['name', 'title', 'displayName', 'slug', 'label', 'key', 'arkUserId']

interface ColumnMeta { dataType: string, enumValues?: string[], notNull: boolean }

function resolveRegistration(key: string): ArkAdminTableRegistration {
  const registration = adminRegistrations().get(key)
  if (!registration)
    throw new TRPCError({ code: 'NOT_FOUND', message: `Unknown admin table: ${key}` })
  return registration
}

function resolveTable(key: string): any {
  return resolveRegistration(key).table
}

function primaryKeyOf(registration: ArkAdminTableRegistration) {
  return registration.primaryKey ?? 'id'
}

function columnsOf(table: any): Record<string, ColumnMeta> {
  return getTableColumns(table) as Record<string, ColumnMeta>
}

function labelColumnFor(table: any): string {
  const keys = Object.keys(getTableColumns(table))
  return LABEL_PREFERENCE.find(key => keys.includes(key)) ?? 'id'
}

// Foreign keys keyed by local JS field name: which (whitelisted) table they
// point at + that table's label column + the Drizzle table object (for joins).
function foreignKeysOf(table: any): Record<string, { tableKey: string | null, labelColumn: string, refTable: any }> {
  const out: Record<string, { tableKey: string | null, labelColumn: string, refTable: any }> = {}
  try {
    const fieldByColumn = Object.entries(getTableColumns(table)) as [string, any][]
    for (const fk of getTableConfig(table).foreignKeys ?? []) {
      const reference = fk.reference()
      const localColumn = reference.columns?.[0]
      const foreignColumn = reference.foreignColumns?.[0]
      if (!localColumn || !foreignColumn)
        continue
      const localField = fieldByColumn.find(([, column]) => column === localColumn || column.name === localColumn.name)?.[0]
      if (!localField)
        continue
      const refTable = foreignColumn.table
      const tableKey = [...adminRegistrations().entries()].find(([, value]) => value.table === refTable)?.[0] ?? null
      out[localField] = { tableKey, labelColumn: labelColumnFor(refTable), refTable }
    }
  }
  catch {
    // Drizzle FK introspection is best-effort; fall back to raw ids.
  }
  return out
}

async function requireAdmin(sessionOrCtx: any) {
  const root = sessionOrCtx?.auth ? await sessionOrCtx.auth.publicSpace() : await getPublicSpace()
  if (!root)
    throw new TRPCError({ code: 'NOT_FOUND', message: 'Public space not found' })
  await requireSpaceAccess(root.id, sessionOrCtx, 'settings.manage')
}

// Coerce form values to the shapes Drizzle expects, dropping unknown/auto columns.
function sanitizeValues(cols: Record<string, ColumnMeta>, values: Record<string, unknown>) {
  const out: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(values)) {
    if (!(key in cols) || AUTO_COLUMNS.has(key))
      continue
    if (value === null || value === undefined || value === '') {
      out[key] = null
      continue
    }
    const dataType = cols[key]!.dataType
    if (dataType === 'date')
      out[key] = new Date(value as string)
    else if (dataType === 'json')
      out[key] = typeof value === 'string' ? JSON.parse(value) : value
    else
      out[key] = value
  }
  return out
}

const tableInput = z.object({ table: z.string().max(64) })

export const adminRouter = createTRPCRouter({
  tables: baseProcedure.query(async ({ ctx }) => {
    await requireAdmin(ctx)
    return [...adminRegistrations().values()].map(serializeTable)
  }),

  rows: baseProcedure
    .input(z.object({
      table: z.string().max(64),
      limit: z.number().int().min(1).max(1000).default(25),
      offset: z.number().int().min(0).default(0),
      sortColumn: z.string().max(64).optional(),
      sortDir: z.enum(['asc', 'desc']).default('desc'),
      filters: z.array(z.object({ column: z.string().max(64), value: z.string().max(200) })).default([]),
    }))
    .query(async ({ ctx, input }) => {
      await requireAdmin(ctx)
      const registration = resolveRegistration(input.table)
      const table = registration.table as any
      const cols = columnsOf(table)
      const primaryKey = primaryKeyOf(registration)
      const columnKeys = Object.keys(cols)
      const fks = foreignKeysOf(table)
      const columns = columnKeys.map(key => ({
        key,
        type: cols[key]!.dataType,
        enumValues: cols[key]!.enumValues,
        editable: !AUTO_COLUMNS.has(key) && key !== primaryKey,
        ref: fks[key] ? { table: fks[key]!.tableKey, labelColumn: fks[key]!.labelColumn } : undefined,
      }))

      const conditions = input.filters
        .filter(filter => columnKeys.includes(filter.column) && filter.value !== '')
        .map(filter => cols[filter.column]!.dataType === 'string'
          ? sql`${table[filter.column]} ilike ${`%${filter.value}%`}`
          : sql`${table[filter.column]}::text = ${filter.value}`)
      // Hide soft-deleted rows by default when the table supports it.
      if ('deletedAt' in cols)
        conditions.push(isNull(table.deletedAt))
      const where = conditions.length ? and(...conditions) : undefined

      const sortKey: string = input.sortColumn && columnKeys.includes(input.sortColumn)
        ? input.sortColumn
        : (columnKeys.includes('createdAt') ? 'createdAt' : (columnKeys[0] ?? 'id'))
      const orderBy = input.sortDir === 'asc' ? asc(table[sortKey]) : desc(table[sortKey])

      const [totals] = await ctx.db.select({ total: sql<number>`count(*)` }).from(table).where(where)
      const rows = await ctx.db.select().from(table).where(where).orderBy(orderBy).limit(input.limit).offset(input.offset) as Record<string, unknown>[]

      // Resolve FK labels for the rows on this page (batched per relation).
      const refs: Record<string, Record<string, string>> = {}
      for (const [field, fk] of Object.entries(fks)) {
        const ids = [...new Set(rows.map(row => row[field]).filter(Boolean))] as string[]
        if (!ids.length)
          continue
        const labelColumn = fk.refTable[fk.labelColumn] ?? fk.refTable.id
        const refRows = await ctx.db.select({ id: fk.refTable.id, label: labelColumn }).from(fk.refTable).where(inArray(fk.refTable.id, ids)) as { id: string, label: unknown }[]
        refs[field] = Object.fromEntries(refRows.map(row => [row.id, String(row.label ?? row.id)]))
      }

      return { columns, refs, rows, sortColumn: sortKey, sortDir: input.sortDir, table: serializeTable(registration), total: Number(totals?.total ?? 0) }
    }),

  // Relation-picker options for a whitelisted table: [{ id, label }].
  options: baseProcedure
    .input(tableInput)
    .query(async ({ ctx, input }) => {
      await requireAdmin(ctx)
      const registration = resolveRegistration(input.table)
      const table = registration.table as any
      const primaryKey = primaryKeyOf(registration)
      const labelColumn = labelColumnFor(table)
      const cols = columnsOf(table)
      const where = 'deletedAt' in cols ? isNull(table.deletedAt) : undefined
      const primaryColumn = table[primaryKey]
      const rows = await ctx.db
        .select({ id: primaryColumn, label: table[labelColumn] })
        .from(table)
        .where(where)
        .orderBy(asc(table[labelColumn]))
        .limit(200) as { id: string, label: unknown }[]
      return rows.map(row => ({ id: row.id, label: String(row.label ?? row.id) }))
    }),

  get: baseProcedure
    .input(tableInput.extend({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      await requireAdmin(ctx)
      const registration = resolveRegistration(input.table)
      const table = registration.table as any
      const [row] = await ctx.db.select().from(table).where(eq(table[primaryKeyOf(registration)], input.id)).limit(1)
      return row ?? null
    }),

  create: baseProcedure
    .input(tableInput.extend({ values: z.record(z.string(), z.unknown()) }))
    .mutation(async ({ ctx, input }) => {
      await requireAdmin(ctx)
      const table = resolveTable(input.table)
      const inserted = await ctx.db.insert(table).values(sanitizeValues(columnsOf(table), input.values)).returning() as any[]
      return inserted[0]
    }),

  update: baseProcedure
    .input(tableInput.extend({ id: z.string(), values: z.record(z.string(), z.unknown()) }))
    .mutation(async ({ ctx, input }) => {
      await requireAdmin(ctx)
      const registration = resolveRegistration(input.table)
      const table = registration.table as any
      const cols = columnsOf(table)
      const patch = sanitizeValues(cols, input.values)
      if ('updatedAt' in cols)
        patch.updatedAt = new Date()
      const updated = await ctx.db.update(table).set(patch).where(eq(table[primaryKeyOf(registration)], input.id)).returning() as any[]
      if (!updated[0])
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Row not found' })
      return updated[0]
    }),

  // Soft-delete when the table has deletedAt; hard delete otherwise.
  remove: baseProcedure
    .input(tableInput.extend({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await requireAdmin(ctx)
      const registration = resolveRegistration(input.table)
      const table = registration.table as any
      const cols = columnsOf(table)
      if ('deletedAt' in cols)
        await ctx.db.update(table).set({ deletedAt: new Date() }).where(eq(table[primaryKeyOf(registration)], input.id))
      else
        await ctx.db.delete(table).where(eq(table[primaryKeyOf(registration)], input.id))
      return { ok: true, soft: 'deletedAt' in cols }
    }),

  // Permissions matrix: roles × capabilities, backed by ark_grants on the root space.
  permissions: baseProcedure.query(async ({ ctx }) => {
    await requireAdmin(ctx)
    const root = await ctx.auth.publicSpace()
    if (!root)
      throw new TRPCError({ code: 'NOT_FOUND', message: 'Public space not found' })
    const roleRows = await ctx.db
      .select({ id: arkRoles.id, key: arkRoles.key, name: arkRoles.name, rank: arkRoles.rank, isSystem: arkRoles.isSystem })
      .from(arkRoles)
      .where(and(eq(arkRoles.scopeType, 'space'), eq(arkRoles.scopeId, root.id)))
      .orderBy(desc(arkRoles.rank))
    const grantRows = await ctx.db
      .select({ subjectId: arkGrants.subjectId, action: arkGrants.action })
      .from(arkGrants)
      .where(and(
        eq(arkGrants.scopeType, 'space'),
        eq(arkGrants.scopeId, root.id),
        eq(arkGrants.subjectType, 'role'),
        eq(arkGrants.effect, 'allow'),
        eq(arkGrants.status, 'active'),
      ))
    const byRole: Record<string, string[]> = {}
    for (const row of grantRows) {
      if (!row.subjectId)
        continue
      const list = byRole[row.subjectId] ?? (byRole[row.subjectId] = [])
      list.push(row.action)
    }
    return { roles: roleRows, capabilities: [...new Set([...arkCapabilityValues as readonly string[], ...loadArkTenantCapabilities()])], grants: byRole }
  }),

  setGrant: baseProcedure
    .input(z.object({ roleId: z.string(), capability: z.string().max(80), allow: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      await requireAdmin(ctx)
      const root = await ctx.auth.publicSpace()
      if (!root)
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Public space not found' })
      if (!isKnownArkCapability(input.capability))
        throw new TRPCError({ code: 'BAD_REQUEST', message: `Unknown capability: ${input.capability}` })
      const match = and(
        eq(arkGrants.scopeType, 'space'),
        eq(arkGrants.scopeId, root.id),
        eq(arkGrants.subjectType, 'role'),
        eq(arkGrants.subjectId, input.roleId),
        eq(arkGrants.action, input.capability as any),
        eq(arkGrants.effect, 'allow'),
      )
      // Dup-safe: insert only if no active grant exists; on remove, deactivate
      // every matching active grant (the table has no unique constraint).
      if (input.allow) {
        const [active] = await ctx.db.select({ id: arkGrants.id }).from(arkGrants).where(and(match, eq(arkGrants.status, 'active'))).limit(1)
        if (!active)
          await ctx.db.insert(arkGrants).values({ action: input.capability as any, effect: 'allow', scopeId: root.id, scopeType: 'space', subjectId: input.roleId, subjectType: 'role' })
      }
      else {
        await ctx.db.update(arkGrants).set({ status: 'inactive', updatedAt: new Date() }).where(and(match, eq(arkGrants.status, 'active')))
      }
      return { ok: true }
    }),
})
