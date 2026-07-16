import type { ArkResourceDefinition, ArkResourceDeletionPolicy, ArkResourceFilter, ArkResourceOperation } from './types'
import {
  bigint,
  boolean,
  date,
  integer,
  jsonb,
  numeric,
  pgTable,
  real,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core'
import { and, eq, getTableColumns, sql } from 'drizzle-orm'
import { arkResourceDefinitions } from '../../db/schema'
import { queryResultRows, useDatabase } from '../utils/db'
import { getArkResource, replaceAdoptedArkResources } from './registry'

interface DiscoveredColumn {
  column_name: string
  data_type: string
  is_nullable: 'NO' | 'YES'
  udt_name: string
}

interface DiscoveredTableRow {
  primary_key: null | string
  table_name: string
}

interface DiscoveredRelationRow {
  column_name: string
  foreign_column_name: string
  foreign_table_name: string
}

const operationNames: ArkResourceOperation[] = ['read', 'create', 'update', 'delete']

function columnBuilder(column: DiscoveredColumn) {
  const name = column.column_name
  switch (column.udt_name) {
    case 'uuid': return uuid(name)
    case 'bool': return boolean(name)
    case 'int2':
    case 'int4': return integer(name)
    case 'int8': return bigint(name, { mode: 'number' })
    case 'float4':
    case 'float8': return real(name)
    case 'numeric': return numeric(name)
    case 'date': return date(name, { mode: 'date' })
    case 'timestamp': return timestamp(name)
    case 'timestamptz': return timestamp(name, { withTimezone: true })
    case 'json':
    case 'jsonb': return jsonb(name)
    default: return text(name)
  }
}

async function tableColumns(database: any, tableName: string) {
  const result = await database.execute(sql`
    select column_name, data_type, is_nullable, udt_name
    from information_schema.columns
    where table_schema = 'public' and table_name = ${tableName}
    order by ordinal_position
  `)
  return queryResultRows<DiscoveredColumn>(result)
}

async function dynamicPublicTable(database: any, tableName: string) {
  const columns = await tableColumns(database, tableName)
  if (!columns.length)
    throw new Error(`Public table "${tableName}" was not found.`)
  return pgTable(tableName, Object.fromEntries(columns.map(column => [column.column_name, columnBuilder(column)])) as any)
}

async function tableRelations(database: any, tableName: string, resourceByTable: Map<string, string>) {
  const result = await database.execute(sql`
    select kcu.column_name, ccu.table_name as foreign_table_name, ccu.column_name as foreign_column_name
    from information_schema.table_constraints tc
    join information_schema.key_column_usage kcu
      on kcu.constraint_name = tc.constraint_name and kcu.constraint_schema = tc.constraint_schema
    join information_schema.constraint_column_usage ccu
      on ccu.constraint_name = tc.constraint_name and ccu.constraint_schema = tc.constraint_schema
    where tc.table_schema = 'public'
      and tc.table_name = ${tableName}
      and tc.constraint_type = 'FOREIGN KEY'
  `)
  const relations: Record<string, { field: string, resource: string, targetField: string }> = {}
  for (const row of queryResultRows<DiscoveredRelationRow>(result)) {
    const resource = resourceByTable.get(row.foreign_table_name)
    if (!resource)
      continue
    const preferred = row.column_name.replace(/_id$/, '')
    const name = relations[preferred] ? row.column_name : preferred
    relations[name] = { field: row.column_name, resource, targetField: row.foreign_column_name }
  }
  return relations
}

export async function discoverArkResourceTables(database: any = useDatabase()) {
  const result = await database.execute(sql`
    select t.table_name, pk.primary_key
    from information_schema.tables t
    left join lateral (
      select kcu.column_name as primary_key
      from information_schema.table_constraints tc
      join information_schema.key_column_usage kcu
        on kcu.constraint_name = tc.constraint_name
       and kcu.constraint_schema = tc.constraint_schema
      where tc.table_schema = t.table_schema
        and tc.table_name = t.table_name
        and tc.constraint_type = 'PRIMARY KEY'
      order by kcu.ordinal_position
      limit 1
    ) pk on true
    where t.table_schema = 'public'
      and t.table_type = 'BASE TABLE'
    order by t.table_name
  `)
  const tables = queryResultRows<DiscoveredTableRow>(result)
  const adopted = await database.select().from(arkResourceDefinitions) as Array<typeof arkResourceDefinitions.$inferSelect>
  const metadataByTable = new Map(adopted.map(row => [row.tableName, row]))
  return tables.map(table => ({
    adopted: metadataByTable.has(table.table_name),
    eligible: Boolean(table.primary_key),
    name: metadataByTable.get(table.table_name)?.name ?? table.table_name,
    primaryKey: table.primary_key,
    schema: 'public',
    table: table.table_name,
  }))
}

function persistedDefinition(row: typeof arkResourceDefinitions.$inferSelect, table: any, relations: ArkResourceDefinition['relations']): ArkResourceDefinition {
  const operations = Object.fromEntries(operationNames.map(operation => [operation, Boolean(row.operationsJson[operation])]))
  const deletion = ['disabled', 'hard', 'soft'].includes(row.deletionPolicy)
    ? row.deletionPolicy as ArkResourceDeletionPolicy
    : 'disabled'
  return {
    deletion,
    fields: row.fieldsJson,
    name: row.name,
    operations,
    primaryKey: row.primaryKey,
    relations,
    rowPolicy: row.rowPolicyJson as Partial<Record<ArkResourceOperation, ArkResourceFilter>>,
    softDeleteField: deletion === 'soft' ? softDeleteField(table) : undefined,
    source: 'adopted',
    table,
  }
}

function softDeleteField(table: any) {
  const columns = getTableColumns(table)
  if ('deleted_at' in columns)
    return 'deleted_at'
  if ('deletedAt' in columns)
    return 'deletedAt'
  return undefined
}

export async function loadPersistedArkResources(database: any = useDatabase()) {
  const rows = await database.select().from(arkResourceDefinitions) as Array<typeof arkResourceDefinitions.$inferSelect>
  const resourceByTable = new Map(rows.filter(row => row.schemaName === 'public').map(row => [row.tableName, row.name]))
  const definitions: Array<Omit<ArkResourceDefinition, 'source'>> = []
  for (const row of rows.filter(row => row.schemaName === 'public')) {
    const table = await dynamicPublicTable(database, row.tableName)
    const relations = await tableRelations(database, row.tableName, resourceByTable)
    definitions.push(persistedDefinition(row, table, relations))
  }
  replaceAdoptedArkResources(definitions)
  return rows.length
}

export async function adoptDiscoveredArkResource(input: {
  deletion?: ArkResourceDeletionPolicy
  name?: string
  table: string
}, database: any = useDatabase()) {
  const discovered = await discoverArkResourceTables(database)
  const candidate = discovered.find(table => table.table === input.table)
  if (!candidate?.eligible || !candidate.primaryKey)
    throw new Error(`Public table "${input.table}" is not eligible for adoption.`)
  const name = input.name?.trim() || input.table
  const deletion = input.deletion ?? 'disabled'
  if (deletion === 'soft') {
    const table = await dynamicPublicTable(database, input.table)
    if (!softDeleteField(table))
      throw new Error(`Public table "${input.table}" needs a deleted_at column for soft deletion.`)
  }
  const operations = { create: true, delete: deletion !== 'disabled', read: true, update: true }
  const [existing] = await database.select().from(arkResourceDefinitions).where(and(
    eq(arkResourceDefinitions.schemaName, 'public'),
    eq(arkResourceDefinitions.tableName, input.table),
  )).limit(1)
  const values = {
    deletionPolicy: deletion,
    name,
    operationsJson: operations,
    primaryKey: candidate.primaryKey,
    tableName: input.table,
    updatedAt: new Date(),
  }
  const row = existing
    ? (await database.update(arkResourceDefinitions).set(values).where(eq(arkResourceDefinitions.id, existing.id)).returning())[0]
    : (await database.insert(arkResourceDefinitions).values(values).returning())[0]
  if (!row)
    throw new Error('Resource adoption metadata was not saved.')
  await loadPersistedArkResources(database)
  return { metadata: row, resource: getArkResource(row.name) }
}
