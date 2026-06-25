import type { arkUsers } from '../../db/schema'
import type { useDatabase } from './db'

export interface ArkAuthUser {
  email: string
  id: string
  image?: null | string
  name: string
}

export type ArkUserRow = typeof arkUsers.$inferSelect
export type ArkUserInsert = typeof arkUsers.$inferInsert

export interface ArkHookContext {
  db: ReturnType<typeof useDatabase>
}

export interface ArkFilterEvents {
  'ark.users.creating': {
    authUser: ArkAuthUser
    values: ArkUserInsert
  }
}

export interface ArkActionEvents {
  'ark.users.created': {
    arkUser: ArkUserRow
    authUser: ArkAuthUser
  }
  'ark.users.completed': {
    arkUser: ArkUserRow
    authUser: ArkAuthUser
    created: boolean
  }
}

export type ArkFilterHandler<Name extends keyof ArkFilterEvents> = (
  payload: ArkFilterEvents[Name],
  ctx: ArkHookContext,
) => ArkFilterEvents[Name] | Promise<ArkFilterEvents[Name]>

export type ArkActionHandler<Name extends keyof ArkActionEvents> = (
  payload: ArkActionEvents[Name],
  ctx: ArkHookContext,
) => void | Promise<void>

export interface ArkHookRegistrationOptions {
  key?: string
}

export interface ArkActionRegistrationOptions extends ArkHookRegistrationOptions {
  required?: boolean
}

interface FilterRegistration<Name extends keyof ArkFilterEvents> {
  handler: ArkFilterHandler<Name>
  key?: string
}

interface ActionRegistration<Name extends keyof ArkActionEvents> {
  handler: ArkActionHandler<Name>
  key?: string
  required: boolean
}

function replaceOrAppend<T extends { key?: string }>(rows: T[], row: T) {
  if (row.key) {
    const index = rows.findIndex(existing => existing.key === row.key)
    if (index >= 0) {
      rows[index] = row
      return
    }
  }
  rows.push(row)
}

export function createArkHookRegistry() {
  const filters = new Map<keyof ArkFilterEvents, FilterRegistration<any>[]>()
  const actions = new Map<keyof ArkActionEvents, ActionRegistration<any>[]>()

  return {
    filter<Name extends keyof ArkFilterEvents>(
      name: Name,
      handler: ArkFilterHandler<Name>,
      options: ArkHookRegistrationOptions = {},
    ) {
      const rows = filters.get(name) ?? []
      replaceOrAppend(rows, { handler, key: options.key })
      filters.set(name, rows)
    },

    action<Name extends keyof ArkActionEvents>(
      name: Name,
      handler: ArkActionHandler<Name>,
      options: ArkActionRegistrationOptions = {},
    ) {
      const rows = actions.get(name) ?? []
      replaceOrAppend(rows, {
        handler,
        key: options.key,
        required: options.required ?? true,
      })
      actions.set(name, rows)
    },

    async applyFilter<Name extends keyof ArkFilterEvents>(
      name: Name,
      payload: ArkFilterEvents[Name],
      ctx: ArkHookContext,
    ) {
      let next = payload
      for (const row of filters.get(name) ?? [])
        next = await row.handler(next, ctx)
      return next
    },

    async runAction<Name extends keyof ArkActionEvents>(
      name: Name,
      payload: ArkActionEvents[Name],
      ctx: ArkHookContext,
    ) {
      for (const row of actions.get(name) ?? []) {
        try {
          await row.handler(payload, ctx)
        }
        catch (error) {
          if (row.required)
            throw error
          console.warn(`[ark] Optional hook ${String(name)}${row.key ? `:${row.key}` : ''} failed`, error)
        }
      }
    },
  }
}

export const arkHooks = createArkHookRegistry()
