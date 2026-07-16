import type { ArkResourceDefinition, ArkResourceOperation, ResolvedArkResourceDefinition } from './types'
import { getTableColumns } from 'drizzle-orm'
import { registerArkCapabilities } from '../utils/app-extensions'

const resourceNamePattern = /^(?:ark\.[a-z][a-z0-9_]*|[a-z][a-z0-9_]*)$/
const operations: ArkResourceOperation[] = ['read', 'create', 'update', 'delete']
const registrations = new Map<string, ResolvedArkResourceDefinition>()

function resolveOperations(definition: ArkResourceDefinition): Record<ArkResourceOperation, boolean> {
  const adoptedDefaults = definition.source === 'adopted'
    ? { create: true, delete: false, read: true, update: true }
    : { create: false, delete: false, read: false, update: false }

  return {
    ...adoptedDefaults,
    ...definition.operations,
    delete: definition.deletion && definition.deletion !== 'disabled'
      ? (definition.operations?.delete ?? adoptedDefaults.delete)
      : false,
  }
}

function validateDefinition(definition: ArkResourceDefinition) {
  if (!resourceNamePattern.test(definition.name))
    throw new Error(`Invalid Ark Resource name "${definition.name}".`)
  if (definition.name.startsWith('ark.') && definition.source !== 'code')
    throw new Error(`Only code-owned Ark Resources may use the ark. prefix: "${definition.name}".`)

  const columns = getTableColumns(definition.table)
  const primaryKey = definition.primaryKey ?? 'id'
  if (!(primaryKey in columns))
    throw new Error(`Ark Resource "${definition.name}" primary key "${primaryKey}" is not a table field.`)

  for (const [operation, fields] of Object.entries(definition.fields ?? {})) {
    for (const field of fields ?? []) {
      if (!(field in columns))
        throw new Error(`Ark Resource "${definition.name}" ${operation} field "${field}" is not a table field.`)
    }
  }
  for (const [name, relation] of Object.entries(definition.relations ?? {})) {
    if (!name || name.includes('.') || !(relation.field in columns))
      throw new Error(`Ark Resource "${definition.name}" relation "${name}" has an invalid local field.`)
  }
  if ((definition.deletion ?? 'disabled') === 'soft' && !((definition.softDeleteField ?? 'deletedAt') in columns))
    throw new Error(`Ark Resource "${definition.name}" soft-delete field is not present on the table.`)
}

function resolveDefinition(definition: ArkResourceDefinition): ResolvedArkResourceDefinition {
  validateDefinition(definition)
  return {
    ...definition,
    deletion: definition.deletion ?? 'disabled',
    operations: resolveOperations(definition),
    primaryKey: definition.primaryKey ?? 'id',
    softDeleteField: definition.softDeleteField ?? 'deletedAt',
  }
}

function registerDefinition(definition: ArkResourceDefinition) {
  const resolved = resolveDefinition(definition)
  const existing = registrations.get(resolved.name)
  if (existing?.source === 'code' && resolved.source === 'adopted')
    return existing

  registrations.set(resolved.name, resolved)
  registerArkCapabilities(
    operations.filter(operation => resolved.operations[operation]).map(operation => `${resolved.name}.items.${operation}`),
  )
  return resolved
}

export function replaceAdoptedArkResources(definitions: Array<Omit<ArkResourceDefinition, 'source'>>) {
  const resolved = definitions.map(definition => resolveDefinition({ ...definition, source: 'adopted' }))
  for (const [name, registration] of registrations) {
    if (registration.source === 'adopted')
      registrations.delete(name)
  }
  for (const definition of resolved)
    registerDefinition(definition)
  return resolved
}

export function registerArkResource(definition: Omit<ArkResourceDefinition, 'source'>) {
  return registerDefinition({ ...definition, source: 'code' })
}

export function adoptArkResource(definition: Omit<ArkResourceDefinition, 'source'>) {
  return registerDefinition({ ...definition, source: 'adopted' })
}

export function getArkResource(name: string) {
  return registrations.get(name) ?? null
}

export function listArkResources() {
  return [...registrations.values()]
}

export function unregisterAdoptedArkResource(name: string) {
  if (registrations.get(name)?.source === 'adopted')
    registrations.delete(name)
}

export function resetArkResourcesForTests() {
  registrations.clear()
}
