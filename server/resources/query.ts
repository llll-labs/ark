import type { ArkCompiledResourceFilter, ArkResourceFilter, ArkResourceQuery } from './types'
import {
  and,
  eq,
  gt,
  gte,
  ilike,
  inArray,
  isNotNull,
  isNull,
  like,
  lt,
  lte,
  ne,
  notInArray,
  or,
} from 'drizzle-orm'
import { resourceBadRequest } from './errors'

const comparisonOperators = new Set([
  '_contains',
  '_ends_with',
  '_eq',
  '_gt',
  '_gte',
  '_icontains',
  '_in',
  '_lt',
  '_lte',
  '_neq',
  '_nin',
  '_nnull',
  '_null',
  '_starts_with',
])

function scalar(value: unknown) {
  if (typeof value !== 'string')
    return value
  if (value === 'true')
    return true
  if (value === 'false')
    return false
  if (value === 'null')
    return null
  if (/^-?\d+(?:\.\d+)?$/.test(value))
    return Number(value)
  return value
}

function list(value: unknown) {
  if (Array.isArray(value))
    return value.map(scalar)
  if (typeof value === 'string')
    return value.split(',').map(entry => scalar(entry.trim()))
  return [scalar(value)]
}

function compare(actual: unknown, operator: string, expected: unknown) {
  const left = actual as any
  const right = scalar(expected) as any
  switch (operator) {
    case '_eq': return actual === right
    case '_neq': return actual !== right
    case '_gt': return actual != null && left > right
    case '_gte': return actual != null && left >= right
    case '_lt': return actual != null && left < right
    case '_lte': return actual != null && left <= right
    case '_in': return list(expected).includes(actual as never)
    case '_nin': return !list(expected).includes(actual as never)
    case '_null': return expected ? actual == null : actual != null
    case '_nnull': return expected ? actual != null : actual == null
    case '_contains': return String(actual ?? '').includes(String(expected))
    case '_icontains': return String(actual ?? '').toLowerCase().includes(String(expected).toLowerCase())
    case '_starts_with': return String(actual ?? '').startsWith(String(expected))
    case '_ends_with': return String(actual ?? '').endsWith(String(expected))
    default: return false
  }
}

function escapeLikePattern(value: unknown) {
  return String(value).replace(/[\\%_]/g, character => `\\${character}`)
}

function sqlComparison(column: any, operator: string, expected: unknown) {
  switch (operator) {
    case '_eq': return eq(column, scalar(expected))
    case '_neq': return ne(column, scalar(expected))
    case '_gt': return gt(column, scalar(expected))
    case '_gte': return gte(column, scalar(expected))
    case '_lt': return lt(column, scalar(expected))
    case '_lte': return lte(column, scalar(expected))
    case '_in': return inArray(column, list(expected))
    case '_nin': return notInArray(column, list(expected))
    case '_null': return expected ? isNull(column) : isNotNull(column)
    case '_nnull': return expected ? isNotNull(column) : isNull(column)
    case '_contains': return like(column, `%${escapeLikePattern(expected)}%`)
    case '_icontains': return ilike(column, `%${escapeLikePattern(expected)}%`)
    case '_starts_with': return like(column, `${escapeLikePattern(expected)}%`)
    case '_ends_with': return like(column, `%${escapeLikePattern(expected)}`)
    default: throw resourceBadRequest(`Unsupported filter operator: ${operator}`)
  }
}

export function compileArkResourceFilter(
  filter: ArkResourceFilter | undefined,
  columns: Record<string, any>,
  allowedFields: readonly string[],
): ArkCompiledResourceFilter {
  if (!filter)
    return { predicate: () => true }

  const predicates: Array<(row: Record<string, unknown>) => boolean> = []
  const sqlParts: any[] = []

  for (const [field, condition] of Object.entries(filter)) {
    if (field === '_and' || field === '_or') {
      if (!Array.isArray(condition))
        throw resourceBadRequest(`${field} must be an array.`)
      const nested = condition.map(entry => compileArkResourceFilter(entry as ArkResourceFilter, columns, allowedFields))
      predicates.push(row => field === '_and'
        ? nested.every(part => part.predicate(row))
        : nested.some(part => part.predicate(row)))
      const nestedSql = nested.map(part => part.sql).filter(Boolean)
      if (nestedSql.length)
        sqlParts.push(field === '_and' ? and(...nestedSql) : or(...nestedSql))
      continue
    }

    if (!allowedFields.includes(field) || !columns[field])
      throw resourceBadRequest(`Filtering by field "${field}" is not allowed.`, 'FORBIDDEN_FIELD')
    if (!condition || typeof condition !== 'object' || Array.isArray(condition))
      throw resourceBadRequest(`Filter for field "${field}" must contain an operator.`)

    for (const [operator, expected] of Object.entries(condition)) {
      if (!comparisonOperators.has(operator))
        throw resourceBadRequest(`Unsupported filter operator: ${operator}`)
      predicates.push(row => compare(row[field], operator, expected))
      sqlParts.push(sqlComparison(columns[field], operator, expected))
    }
  }

  return {
    predicate: row => predicates.every(predicate => predicate(row)),
    sql: sqlParts.length ? and(...sqlParts) : undefined,
  }
}

function split(value: unknown): string[] {
  if (Array.isArray(value))
    return value.flatMap(split)
  return typeof value === 'string'
    ? value.split(',').map(entry => entry.trim()).filter(Boolean)
    : []
}

function integer(value: unknown, fallback: number, min: number, max: number) {
  if (value === undefined)
    return fallback
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed < min || parsed > max)
    throw resourceBadRequest(`Expected an integer between ${min} and ${max}.`)
  return parsed
}

function setNested(target: Record<string, any>, path: string[], value: unknown) {
  let cursor: any = target
  for (let index = 0; index < path.length; index++) {
    const segment = path[index]!
    const nextSegment = path[index + 1]
    const last = index === path.length - 1
    if (last) {
      cursor[segment] = value
      return
    }
    const wantsArray = nextSegment !== undefined && /^\d+$/.test(nextSegment)
    cursor[segment] ??= wantsArray ? [] : {}
    cursor = cursor[segment]
  }
}

function parseFilter(query: Record<string, unknown>): ArkResourceFilter | undefined {
  let filter: Record<string, any> = {}
  const raw = query.filter
  if (typeof raw === 'string' && raw.trim()) {
    try {
      const parsed = JSON.parse(raw)
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
        throw new Error('not an object')
      filter = parsed
    }
    catch {
      throw resourceBadRequest('filter must be valid JSON or use filter[field][_operator] query parameters.')
    }
  }

  for (const [key, value] of Object.entries(query)) {
    if (!key.startsWith('filter['))
      continue
    const path = [...key.matchAll(/\[([^\]]+)\]/g)].map(match => match[1]!)
    if (path.length < 2)
      throw resourceBadRequest(`Invalid filter parameter: ${key}`)
    setNested(filter, path, value)
  }

  return Object.keys(filter).length ? filter as ArkResourceFilter : undefined
}

export function parseArkResourceQuery(query: Record<string, unknown>): ArkResourceQuery {
  const fields = split(query.fields)
  const sort = split(query.sort).map((entry) => {
    const direction = entry.startsWith('-') ? 'desc' as const : 'asc' as const
    const field = entry.replace(/^[-+]/, '')
    if (!field || field.includes('.'))
      throw resourceBadRequest(`Invalid sort field: ${entry}`)
    return { direction, field }
  })

  return {
    fields: fields.length && !fields.includes('*') ? fields : undefined,
    filter: parseFilter(query),
    limit: integer(query.limit, 100, 1, 1000),
    offset: integer(query.offset, 0, 0, Number.MAX_SAFE_INTEGER),
    sort,
  }
}

export function combineArkResourceFilters(...filters: Array<ArkResourceFilter | undefined>) {
  const present = filters.filter((filter): filter is ArkResourceFilter => Boolean(filter))
  if (!present.length)
    return undefined
  if (present.length === 1)
    return present[0]
  return { _and: present } as ArkResourceFilter
}
