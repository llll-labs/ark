import type {
  ArkResourceAccountability,
  ArkResourceFilter,
  ArkResourceListResult,
  ArkResourceOperation,
  ArkResourceQuery,
  ArkResourceServices,
  ArkResourceServiceOptions,
  ResolvedArkResourceDefinition,
} from './types'
import { and, asc, desc, eq, getTableColumns, isNull, sql } from 'drizzle-orm'
import { useDatabase } from '../utils/db'
import { ArkResourceError, resourceBadRequest, resourceForbidden, resourceNotFound, resourceOperationDisabled, resourceUnknown } from './errors'
import { arkResourceHooks } from './hooks'
import { combineArkResourceFilters, compileArkResourceFilter } from './query'
import { getArkResource } from './registry'

interface PendingAction {
  accountability: ArkResourceAccountability
  authorization: 'domain' | 'resource'
  definition: ResolvedArkResourceDefinition
  event: string
  meta: {
    collection: string
    key?: unknown
    payload?: Record<string, unknown>
  }
}

interface ResourceSelection {
  expanded: Record<string, string[]>
  requested: string[]
  selected: string[]
}

const postCommitActions = new WeakMap<object, PendingAction[]>()

function hookContext(
  accountability: ArkResourceAccountability,
  database: any,
  definition: ResolvedArkResourceDefinition,
  authorization: 'domain' | 'resource',
  transaction?: any,
) {
  return {
    accountability,
    database,
    schema: definition,
    services: createArkResourceServices({ accountability, authorization, database, transaction }),
  }
}

async function runResourceTransaction<T>(
  database: any,
  transaction: any | undefined,
  handler: (transaction: any, pending: PendingAction[]) => Promise<T>,
) {
  if (transaction !== undefined) {
    const existingQueue = transaction && typeof transaction === 'object' ? postCommitActions.get(transaction) : undefined
    if (!existingQueue) {
      throw new Error('Ark Resource transactions must be created with withArkResourceTransaction().')
    }
    return handler(transaction, existingQueue)
  }

  let pending: PendingAction[] = []
  const result = await database.transaction(async (nextTransaction: any) => {
    pending = []
    if (nextTransaction && typeof nextTransaction === 'object')
      postCommitActions.set(nextTransaction, pending)
    try {
      return await handler(nextTransaction, pending)
    }
    finally {
      if (nextTransaction && typeof nextTransaction === 'object')
        postCommitActions.delete(nextTransaction)
    }
  })

  for (const action of pending) {
    arkResourceHooks.dispatchBestEffort(
      action.event,
      action.meta,
      hookContext(action.accountability, database, action.definition, action.authorization),
    )
  }
  return result
}

function permission(resource: string, operation: ArkResourceOperation) {
  return `${resource}.items.${operation}`
}

function rowPolicy(
  definition: ResolvedArkResourceDefinition,
  operation: ArkResourceOperation,
  accountability: ArkResourceAccountability,
) {
  const configured = definition.rowPolicy?.[operation]
  return typeof configured === 'function' ? configured(accountability) : configured
}

function zodErrors(error: { issues: Array<{ message: string, path: PropertyKey[] }> }) {
  return error.issues.map(issue => ({
    field: issue.path.length ? issue.path.join('.') : undefined,
    message: issue.message,
  }))
}

function coerceValue(column: any, value: unknown) {
  if (value === null || value === undefined)
    return value
  if (column.dataType === 'date' && !(value instanceof Date)) {
    const date = new Date(String(value))
    if (Number.isNaN(date.getTime()))
      throw resourceBadRequest(`Field "${column.name}" must be a date.`, 'INVALID_PAYLOAD')
    return date
  }
  if (column.dataType === 'number' && typeof value === 'string' && value.trim() !== '') {
    const number = Number(value)
    if (!Number.isFinite(number))
      throw resourceBadRequest(`Field "${column.name}" must be a number.`, 'INVALID_PAYLOAD')
    return number
  }
  return value
}

export class ArkResourceService {
  readonly accountability: ArkResourceAccountability
  readonly authorization: 'domain' | 'resource'
  readonly database: any
  readonly definition: ResolvedArkResourceDefinition
  readonly emitEvents: boolean
  readonly transaction?: any

  constructor(definition: ResolvedArkResourceDefinition, options: ArkResourceServiceOptions) {
    this.definition = definition
    this.accountability = options.accountability
    this.authorization = options.authorization ?? 'resource'
    this.database = options.database ?? useDatabase()
    this.emitEvents = options.emitEvents ?? true
    this.transaction = options.transaction
  }

  private assertOperation(operation: ArkResourceOperation) {
    if (this.authorization === 'domain')
      return
    if (!this.definition.operations[operation])
      throw resourceOperationDisabled(this.definition.name, operation)
    if (!this.accountability.system && !this.accountability.capabilities.includes(permission(this.definition.name, operation)))
      throw resourceForbidden(`Missing Resource permission: ${permission(this.definition.name, operation)}`)
  }

  private columns() {
    return getTableColumns(this.definition.table) as Record<string, any>
  }

  private hookContext(database: any, transaction?: any, definition = this.definition) {
    return hookContext(this.accountability, database, definition, this.authorization, transaction)
  }

  private allowedFields(operation: ArkResourceOperation) {
    const columns = Object.keys(this.columns())
    if (this.accountability.system)
      return columns
    const configured = this.definition.fields?.[operation]
    return configured ? [...configured] : columns
  }

  private selectedFields(requested?: string[], depth = 0): ResourceSelection {
    const allowed = this.allowedFields('read')
    const fields = requested ?? allowed
    const expanded: Record<string, string[]> = {}
    const direct = fields.filter(field => !field.includes('.'))
    const forbidden = direct.filter(field => !allowed.includes(field))
    for (const field of fields.filter(field => field.includes('.'))) {
      const [relationName, ...path] = field.split('.')
      const relation = this.definition.relations?.[relationName!]
      if (!relation || !allowed.includes(relation.field) || !path.length || path.includes('*') || depth >= 3) {
        forbidden.push(field)
        continue
      }
      ;(expanded[relationName!] ??= []).push(path.join('.'))
    }
    if (forbidden.length)
      throw resourceForbidden(`Fields are not readable: ${forbidden.join(', ')}`)
    const helpers = Object.keys(expanded).map(name => this.definition.relations![name]!.field)
    return { expanded, requested: direct, selected: [...new Set([...direct, ...helpers])] }
  }

  private async expandRows(rows: Record<string, unknown>[], selection: ResourceSelection, depth: number) {
    for (const [name, nestedFields] of Object.entries(selection.expanded)) {
      const relation = this.definition.relations?.[name]
      const target = relation ? getArkResource(relation.resource) : null
      if (!relation || !target)
        continue
      if (relation.targetField && relation.targetField !== target.primaryKey)
        throw resourceBadRequest(`Relation "${name}" does not reference the target Resource primary key.`)
      const targetService = new ArkResourceService(target, {
        accountability: this.accountability,
        authorization: this.authorization,
        database: this.database,
        emitEvents: false,
        transaction: this.transaction,
      })
      for (const row of rows) {
        const key = row[relation.field]
        if (key === null || key === undefined) {
          row[name] = null
          continue
        }
        try {
          row[name] = await targetService.readOne(key, nestedFields, depth + 1)
        }
        catch (error) {
          if (!(error instanceof ArkResourceError) || !['FORBIDDEN', 'RECORD_NOT_FOUND'].includes(error.code))
            throw error
        }
      }
    }
    for (const row of rows) {
      for (const field of selection.selected) {
        if (!selection.requested.includes(field))
          delete row[field]
      }
    }
    return rows
  }

  private sanitizePayload(operation: 'create' | 'update', payload: Record<string, unknown>) {
    const columns = this.columns()
    const allowed = this.allowedFields(operation)
    const forbidden = Object.keys(payload).filter(field => !allowed.includes(field) || !columns[field])
    if (operation === 'update' && this.definition.primaryKey in payload)
      forbidden.push(this.definition.primaryKey)
    if (forbidden.length)
      throw resourceForbidden(`Fields are not writable: ${[...new Set(forbidden)].join(', ')}`)

    return Object.fromEntries(
      Object.entries(payload).map(([field, value]) => [field, coerceValue(columns[field], value)]),
    )
  }

  private validatePayload(operation: 'create' | 'update', payload: Record<string, unknown>) {
    const validator = this.definition.schema?.[operation]
    if (!validator)
      return payload
    const result = validator.safeParse(payload)
    if (!result.success) {
      throw new ArkResourceError({
        code: 'FAILED_VALIDATION',
        detail: 'The Resource payload failed validation.',
        errors: zodErrors(result.error),
        status: 400,
        title: 'Validation failed',
      })
    }
    return result.data
  }

  private baseFilter(operation: ArkResourceOperation) {
    const filters: Array<ArkResourceFilter | undefined> = [rowPolicy(this.definition, operation, this.accountability)]
    if (this.definition.deletion === 'soft')
      filters.push({ [this.definition.softDeleteField]: { _null: true } })
    return combineArkResourceFilters(...filters)
  }

  private async inTransaction<T>(handler: (transaction: any, pending: PendingAction[]) => Promise<T>) {
    return runResourceTransaction(this.database, this.transaction, handler)
  }

  private selection(fields: string[]) {
    const columns = this.columns()
    return Object.fromEntries(fields.map(field => [field, columns[field]]))
  }

  private projectMutationResult(row: Record<string, unknown>) {
    const readable = new Set(this.allowedFields('read'))
    return Object.fromEntries(Object.entries(row).filter(([field]) => readable.has(field)))
  }

  async readMany(query: ArkResourceQuery): Promise<ArkResourceListResult> {
    this.assertOperation('read')
    const selection = this.selectedFields(query.fields)
    const columns = this.columns()
    const allowed = this.allowedFields('read')
    const policy = compileArkResourceFilter(this.baseFilter('read'), columns, Object.keys(columns))
    const clientFilter = compileArkResourceFilter(query.filter, columns, allowed)
    const where = and(policy.sql, clientFilter.sql)
    const orderBy = query.sort.length
      ? query.sort.map((sort) => {
          if (!allowed.includes(sort.field) || !columns[sort.field])
            throw resourceForbidden(`Sorting by field "${sort.field}" is not allowed.`)
          return sort.direction === 'desc' ? desc(columns[sort.field]) : asc(columns[sort.field])
        })
      : [asc(columns[this.definition.primaryKey])]

    const [rows, countRows] = await Promise.all([
      this.database.select(this.selection(selection.selected)).from(this.definition.table)
        .where(where)
        .orderBy(...orderBy)
        .limit(query.limit)
        .offset(query.offset),
      this.database.select({ count: sql<number>`count(*)` }).from(this.definition.table).where(where),
    ])

    return {
      data: await this.expandRows(rows as Record<string, unknown>[], selection, 0),
      meta: { filter_count: Number(countRows[0]?.count ?? 0) },
    }
  }

  async readOne(key: unknown, fields?: string[], depth = 0) {
    this.assertOperation('read')
    const selection = this.selectedFields(fields, depth)
    const columns = this.columns()
    const compiled = compileArkResourceFilter(this.baseFilter('read'), columns, Object.keys(columns))
    const where = and(eq(columns[this.definition.primaryKey], coerceValue(columns[this.definition.primaryKey], key)), compiled.sql)
    const [row] = await this.database.select(this.selection(selection.selected)).from(this.definition.table).where(where).limit(1)
    if (!row)
      throw resourceNotFound(this.definition.name)
    return (await this.expandRows([row as Record<string, unknown>], selection, depth))[0]!
  }

  async create(payload: Record<string, unknown>) {
    this.assertOperation('create')
    const event = `${this.definition.name}.items.create`
    return this.inTransaction(async (database, pending) => {
      const effective = this.emitEvents
        ? await arkResourceHooks.applyFilters(event, payload, { collection: this.definition.name }, this.hookContext(database, database))
        : payload
      const values = this.validatePayload('create', this.sanitizePayload('create', effective))
      const policy = compileArkResourceFilter(rowPolicy(this.definition, 'create', this.accountability), this.columns(), Object.keys(this.columns()))
      if (!policy.predicate(values))
        throw resourceForbidden('The created item does not satisfy the Resource Row Policy.')

      const [created] = await database.insert(this.definition.table).values(values).returning()
      if (!created)
        throw new ArkResourceError({ code: 'CREATE_FAILED', status: 500, title: 'Create failed' })
      const key = created[this.definition.primaryKey]
      const meta = { collection: this.definition.name, key, payload: values }
      if (this.emitEvents) {
        await arkResourceHooks.runRequiredActions(event, meta, this.hookContext(database, database))
        pending.push({ accountability: this.accountability, authorization: this.authorization, definition: this.definition, event, meta })
      }
      return this.projectMutationResult(created as Record<string, unknown>)
    })
  }

  async update(key: unknown, payload: Record<string, unknown>) {
    this.assertOperation('update')
    if (!Object.keys(payload).length)
      throw resourceBadRequest('Update payload cannot be empty.', 'INVALID_PAYLOAD')
    const event = `${this.definition.name}.items.update`
    return this.inTransaction(async (database, pending) => {
      const columns = this.columns()
      const policy = compileArkResourceFilter(this.baseFilter('update'), columns, Object.keys(columns))
      const where = and(eq(columns[this.definition.primaryKey], coerceValue(columns[this.definition.primaryKey], key)), policy.sql)
      const [existing] = await database.select().from(this.definition.table).where(where).limit(1)
      if (!existing)
        throw resourceNotFound(this.definition.name)

      const effective = this.emitEvents
        ? await arkResourceHooks.applyFilters(event, payload, { collection: this.definition.name, key }, this.hookContext(database, database))
        : payload
      const values = this.validatePayload('update', this.sanitizePayload('update', effective))
      const finalPolicy = compileArkResourceFilter(rowPolicy(this.definition, 'update', this.accountability), columns, Object.keys(columns))
      if (!finalPolicy.predicate({ ...existing, ...values }))
        throw resourceForbidden('The updated item does not satisfy the Resource Row Policy.')

      const [updated] = await database.update(this.definition.table).set(values).where(where).returning()
      if (!updated)
        throw resourceNotFound(this.definition.name)
      const meta = { collection: this.definition.name, key, payload: values }
      if (this.emitEvents) {
        await arkResourceHooks.runRequiredActions(event, meta, this.hookContext(database, database))
        pending.push({ accountability: this.accountability, authorization: this.authorization, definition: this.definition, event, meta })
      }
      return this.projectMutationResult(updated as Record<string, unknown>)
    })
  }

  async delete(key: unknown) {
    this.assertOperation('delete')
    const event = `${this.definition.name}.items.delete`
    return this.inTransaction(async (database, pending) => {
      const columns = this.columns()
      const policy = compileArkResourceFilter(this.baseFilter('delete'), columns, Object.keys(columns))
      const where = and(eq(columns[this.definition.primaryKey], coerceValue(columns[this.definition.primaryKey], key)), policy.sql)
      const [existing] = await database.select().from(this.definition.table).where(where).limit(1)
      if (!existing)
        throw resourceNotFound(this.definition.name)

      if (this.definition.deletion === 'soft') {
        await database.update(this.definition.table)
          .set({ [this.definition.softDeleteField]: new Date() })
          .where(where)
      }
      else if (this.definition.deletion === 'hard') {
        await database.delete(this.definition.table).where(where)
      }
      else {
        throw resourceOperationDisabled(this.definition.name, 'delete')
      }

      const meta = { collection: this.definition.name, key, payload: existing as Record<string, unknown> }
      if (this.emitEvents) {
        await arkResourceHooks.runRequiredActions(event, meta, this.hookContext(database, database))
        pending.push({ accountability: this.accountability, authorization: this.authorization, definition: this.definition, event, meta })
      }
      return existing as Record<string, unknown>
    })
  }
}

export function createArkResourceServices(options: ArkResourceServiceOptions): ArkResourceServices {
  return {
    resource(name, serviceOptions = {}) {
      const definition = getArkResource(name)
      if (!definition)
        throw resourceUnknown(name)
      return new ArkResourceService(definition, {
        ...options,
        emitEvents: serviceOptions.emitEvents ?? options.emitEvents,
      })
    },
  }
}

export async function withArkResourceTransaction<T>(
  options: Required<Pick<ArkResourceServiceOptions, 'accountability' | 'database'>> & Pick<ArkResourceServiceOptions, 'authorization' | 'emitEvents'>,
  handler: (context: { database: any, services: ArkResourceServices }) => Promise<T>,
) {
  return runResourceTransaction(options.database, undefined, async (database) => {
    const services = createArkResourceServices({
      accountability: options.accountability,
      authorization: options.authorization,
      database,
      emitEvents: options.emitEvents,
      transaction: database,
    })
    return handler({ database, services })
  })
}

export function systemArkResourceAccountability(): ArkResourceAccountability {
  return { arkUserId: null, capabilities: [], spaceId: null, system: true, userId: null }
}
