import type { ArkResourceAccountability } from '../resources/types'
import type { arkFiles } from '../../db/schema'
import { arkFiles as arkFilesTable } from '../../db/schema'
import { and, eq, isNull } from 'drizzle-orm'
import { registerCoreArkResources } from '../resources/core'
import { withArkResourceTransaction } from '../resources/service'

type ArkFileRow = typeof arkFiles.$inferSelect

export interface ArkFileService {
  softDeleteOwned: (input: { fileId: string, ownerArkUserId: string }) => Promise<ArkFileRow>
  updateOwned: (input: {
    fileId: string
    metadata?: Record<string, unknown>
    metadataNamespace?: string
    originalFilename?: null | string
    ownerArkUserId: string
  }) => Promise<ArkFileRow>
}

export function createArkFileService(options: { accountability: ArkResourceAccountability, database: any }): ArkFileService {
  registerCoreArkResources()

  async function ownedFile(database: any, fileId: string, ownerArkUserId: string) {
    const [file] = await database.select().from(arkFilesTable).where(and(
      eq(arkFilesTable.id, fileId),
      eq(arkFilesTable.ownerArkUserId, ownerArkUserId),
      isNull(arkFilesTable.deletedAt),
    )).limit(1)
    if (!file)
      throw new Error('Ark file was not found for this owner.')
    return file as ArkFileRow
  }

  return {
    async softDeleteOwned(input) {
      return withArkResourceTransaction({
        accountability: options.accountability,
        authorization: 'domain',
        database: options.database,
      }, async ({ database, services }) => {
        await ownedFile(database, input.fileId, input.ownerArkUserId)
        return services.resource('ark.files').update(input.fileId, {
          deletedAt: new Date(),
          updatedAt: new Date(),
        }) as Promise<ArkFileRow>
      })
    },
    async updateOwned(input) {
      return withArkResourceTransaction({
        accountability: options.accountability,
        authorization: 'domain',
        database: options.database,
      }, async ({ database, services }) => {
        const file = await ownedFile(database, input.fileId, input.ownerArkUserId)
        const currentMetadata = file.metadataJson && typeof file.metadataJson === 'object' && !Array.isArray(file.metadataJson)
          ? file.metadataJson
          : {}
        const currentNamespace = input.metadataNamespace
          && currentMetadata[input.metadataNamespace]
          && typeof currentMetadata[input.metadataNamespace] === 'object'
          && !Array.isArray(currentMetadata[input.metadataNamespace])
          ? currentMetadata[input.metadataNamespace] as Record<string, unknown>
          : {}
        const metadataJson = input.metadataNamespace
          ? { ...currentMetadata, [input.metadataNamespace]: { ...currentNamespace, ...input.metadata } }
          : input.metadata ? { ...currentMetadata, ...input.metadata } : currentMetadata
        return services.resource('ark.files').update(input.fileId, {
          metadataJson,
          ...(input.originalFilename !== undefined ? { originalFilename: input.originalFilename } : {}),
          updatedAt: new Date(),
        }) as Promise<ArkFileRow>
      })
    },
  }
}
