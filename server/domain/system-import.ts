import type { ArkResourceServices } from '../resources/types'
import { registerCoreArkResources } from '../resources/core'
import { systemArkResourceAccountability, withArkResourceTransaction } from '../resources/service'

export async function runArkSystemImport<T>(
  options: { database: any, eventMode?: 'emit' | 'suppress', reason: string },
  handler: (context: { database: any, services: ArkResourceServices }) => Promise<T>,
) {
  const reason = options.reason.trim()
  if (!reason)
    throw new Error('Ark system imports require a non-empty reason.')
  registerCoreArkResources()
  return withArkResourceTransaction({
    accountability: systemArkResourceAccountability(),
    authorization: 'domain',
    database: options.database,
    emitEvents: options.eventMode !== 'suppress',
  }, handler)
}
