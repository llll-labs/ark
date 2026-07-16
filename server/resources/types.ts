import type { SQL } from 'drizzle-orm'
import type { z } from 'zod/v4'
import type { ArkResourceService } from './service'

export type ArkResourceOperation = 'create' | 'delete' | 'read' | 'update'
export type ArkResourceMutationOperation = Exclude<ArkResourceOperation, 'read'>
export type ArkResourceDeletionPolicy = 'disabled' | 'hard' | 'soft'

export type ArkResourceScalar = boolean | Date | null | number | string

export interface ArkResourceFilter {
  _and?: ArkResourceFilter[]
  _or?: ArkResourceFilter[]
  [field: string]: ArkResourceFilter | Record<string, unknown> | ArkResourceFilter[] | undefined
}

export interface ArkResourceAccountability {
  arkUserId: null | string
  capabilities: readonly string[]
  spaceId: null | string
  system: boolean
  userId: null | string
}

export interface ArkResourceHookContext {
  accountability: ArkResourceAccountability
  database: any
  schema: ArkResourceDefinition
  services: ArkResourceServices
}

export interface ArkResourceServices {
  resource: (name: string, options?: { emitEvents?: boolean }) => ArkResourceService
}

export interface ArkResourceHookMeta {
  collection: string
  event: string
  key?: unknown
  keys?: unknown[]
  payload?: Record<string, unknown>
}

export type ArkResourceFilterHandler = (
  payload: Record<string, unknown>,
  meta: ArkResourceHookMeta,
  context: ArkResourceHookContext,
) => Promise<Record<string, unknown> | void> | Record<string, unknown> | void

export type ArkResourceActionHandler = (
  meta: ArkResourceHookMeta,
  context: ArkResourceHookContext,
) => Promise<void> | void

export type ArkResourceRowPolicy = ArkResourceFilter | ((accountability: ArkResourceAccountability) => ArkResourceFilter | undefined)

export interface ArkResourceRelation {
  field: string
  resource: string
  targetField?: string
}

export interface ArkResourceDefinition {
  deletion?: ArkResourceDeletionPolicy
  fields?: Partial<Record<ArkResourceOperation, readonly string[]>>
  name: string
  operations?: Partial<Record<ArkResourceOperation, boolean>>
  primaryKey?: string
  relations?: Record<string, ArkResourceRelation>
  rowPolicy?: Partial<Record<ArkResourceOperation, ArkResourceRowPolicy>>
  schema?: {
    create?: z.ZodType<Record<string, unknown>>
    update?: z.ZodType<Record<string, unknown>>
  }
  softDeleteField?: string
  source: 'adopted' | 'code'
  table: any
}

export interface ResolvedArkResourceDefinition extends ArkResourceDefinition {
  deletion: ArkResourceDeletionPolicy
  operations: Record<ArkResourceOperation, boolean>
  primaryKey: string
  softDeleteField: string
}

export interface ArkResourceQuery {
  fields?: string[]
  filter?: ArkResourceFilter
  limit: number
  offset: number
  sort: Array<{ direction: 'asc' | 'desc', field: string }>
}

export interface ArkResourceListResult {
  data: Record<string, unknown>[]
  meta: {
    filter_count: number
  }
}

export interface ArkResourceServiceOptions {
  accountability: ArkResourceAccountability
  authorization?: 'domain' | 'resource'
  database?: any
  emitEvents?: boolean
  transaction?: any
}

export interface ArkCompiledResourceFilter {
  predicate: (row: Record<string, unknown>) => boolean
  sql?: SQL
}
