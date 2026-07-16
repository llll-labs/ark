import type { H3Event } from 'h3'
import type { ArkResourceAccountability } from './types'
import { getHeader } from 'h3'
import { createBoundRequestAuth } from '../utils/authorization'
import { ArkResourceError, resourceUnknown } from './errors'
import { getArkResource } from './registry'
import { ArkResourceService, createArkResourceServices } from './service'

export async function createArkResourceRequestScope(event: H3Event) {
  const { auth, db, session } = await createBoundRequestAuth(event)
  const root = await auth.publicSpace()
  const requestedSpaceId = getHeader(event, 'x-ark-space-id')?.trim()
  const spaceId = requestedSpaceId || root?.id || null
  const access = spaceId ? await auth.capabilitiesFor(spaceId) : null
  if (requestedSpaceId && !access?.spaces.some(space => space.id === requestedSpaceId)) {
    throw new ArkResourceError({
      code: 'UNKNOWN_SPACE',
      detail: `Space "${requestedSpaceId}" does not exist or is not available.`,
      status: 404,
      title: 'Space not found',
    })
  }

  const accountability: ArkResourceAccountability = {
    arkUserId: access?.arkUser?.id ?? null,
    capabilities: access?.capabilities ?? [],
    spaceId,
    system: false,
    userId: session?.user?.id ?? null,
  }
  return {
    accountability,
    auth,
    database: db,
    services: createArkResourceServices({ accountability, database: db }),
    session,
  }
}

export async function useArkResourceService(
  event: H3Event,
  name: string,
  options: { emitEvents?: boolean } = {},
) {
  const definition = getArkResource(name)
  if (!definition)
    throw resourceUnknown(name)
  const scope = await createArkResourceRequestScope(event)
  return new ArkResourceService(definition, {
    accountability: scope.accountability,
    database: scope.database,
    emitEvents: options.emitEvents,
  })
}
