import {
  arkChannels,
  arkFiles,
  arkMarketJobs,
  arkMarketStores,
  arkMessages,
  arkPages,
  arkSpaces,
  arkUsers,
} from '../../db/schema'
import type { ArkResourceAccountability } from './types'
import { registerArkResource } from './registry'

const disabledOperations = {
  create: false,
  delete: false,
  read: false,
  update: false,
} as const

function actorFieldPolicy(field: string) {
  return {
    create: (accountability: { spaceId: null | string }) => ({ [field]: { _eq: accountability.spaceId } }),
    delete: (accountability: { spaceId: null | string }) => ({ [field]: { _eq: accountability.spaceId } }),
    read: (accountability: { spaceId: null | string }) => ({ [field]: { _eq: accountability.spaceId } }),
    update: (accountability: { spaceId: null | string }) => ({ [field]: { _eq: accountability.spaceId } }),
  }
}

export function registerCoreArkResources() {
  for (const definition of [
    { name: 'ark.channels', rowPolicy: actorFieldPolicy('spaceId'), table: arkChannels },
    {
      name: 'ark.files',
      rowPolicy: {
        create: (accountability: ArkResourceAccountability) => accountability.system
          ? undefined
          : { ownerArkUserId: { _eq: accountability.arkUserId } },
      },
      table: arkFiles,
    },
    { name: 'ark.market_jobs', rowPolicy: actorFieldPolicy('spaceId'), table: arkMarketJobs },
    { name: 'ark.market_stores', rowPolicy: actorFieldPolicy('ownerSpaceId'), table: arkMarketStores },
    { name: 'ark.messages', rowPolicy: actorFieldPolicy('spaceId'), table: arkMessages },
    { name: 'ark.pages', rowPolicy: actorFieldPolicy('spaceId'), table: arkPages },
    {
      name: 'ark.spaces',
      rowPolicy: {
        create: (accountability: ArkResourceAccountability) => accountability.system
          ? undefined
          : {
              _and: [
                { parentSpaceId: { _eq: accountability.spaceId } },
                { ownerArkUserId: { _eq: accountability.arkUserId } },
              ],
            },
      },
      table: arkSpaces,
    },
    {
      fields: {
        update: ['avatarFileId', 'bio', 'displayName', 'handle', 'profileJson', 'updatedAt'],
      },
      name: 'ark.users',
      rowPolicy: {
        create: (accountability: ArkResourceAccountability) => accountability.system
          ? undefined
          : { authUserId: { _eq: accountability.userId } },
      },
      table: arkUsers,
    },
  ]) {
    registerArkResource({
      deletion: 'disabled',
      ...definition,
      operations: disabledOperations,
    })
  }
}
