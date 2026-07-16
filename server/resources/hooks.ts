import type {
  ArkResourceActionHandler,
  ArkResourceFilterHandler,
  ArkResourceHookContext,
  ArkResourceHookMeta,
} from './types'

interface HookOptions { key?: string }
interface ActionOptions extends HookOptions { bestEffort?: boolean }
interface FilterRegistration { handler: ArkResourceFilterHandler, key?: string }
interface ActionRegistration { bestEffort: boolean, handler: ArkResourceActionHandler, key?: string }

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

export function createArkResourceHookRegistry() {
  const filters = new Map<string, FilterRegistration[]>()
  const actions = new Map<string, ActionRegistration[]>()

  return {
    action(event: string, handler: ArkResourceActionHandler, options: ActionOptions = {}) {
      const rows = actions.get(event) ?? []
      replaceOrAppend(rows, { bestEffort: options.bestEffort ?? false, handler, key: options.key })
      actions.set(event, rows)
    },

    async applyFilters(
      event: string,
      payload: Record<string, unknown>,
      meta: Omit<ArkResourceHookMeta, 'event'>,
      context: ArkResourceHookContext,
    ) {
      let next = payload
      for (const row of filters.get(event) ?? [])
        next = (await row.handler(next, { ...meta, event }, context)) ?? next
      return next
    },

    dispatchBestEffort(
      event: string,
      meta: Omit<ArkResourceHookMeta, 'event'>,
      context: ArkResourceHookContext,
    ) {
      for (const row of actions.get(event) ?? []) {
        if (!row.bestEffort)
          continue
        void Promise.resolve()
          .then(() => row.handler({ ...meta, event }, context))
          .catch(error => console.warn(`[ark] Best-effort Resource Action ${event}${row.key ? `:${row.key}` : ''} failed`, error))
      }
    },

    filter(event: string, handler: ArkResourceFilterHandler, options: HookOptions = {}) {
      const rows = filters.get(event) ?? []
      replaceOrAppend(rows, { handler, key: options.key })
      filters.set(event, rows)
    },

    async runRequiredActions(
      event: string,
      meta: Omit<ArkResourceHookMeta, 'event'>,
      context: ArkResourceHookContext,
    ) {
      for (const row of actions.get(event) ?? []) {
        if (!row.bestEffort)
          await row.handler({ ...meta, event }, context)
      }
    },

    resetForTests() {
      actions.clear()
      filters.clear()
    },
  }
}

export const arkResourceHooks = createArkResourceHookRegistry()

export function resetArkResourceHooksForTests() {
  arkResourceHooks.resetForTests()
}
