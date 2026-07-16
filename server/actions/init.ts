import type { H3Event } from 'h3'
import type { ArkResourceAccountability } from '../resources/types'
import type { z } from 'zod/v4'
import { createBoundRequestAuth } from '../utils/authorization'
import { useDatabase } from '../utils/db'

export type ArkActionErrorCode
  = | 'BAD_REQUEST'
    | 'CONFLICT'
    | 'FORBIDDEN'
    | 'INTERNAL_SERVER_ERROR'
    | 'METHOD_NOT_ALLOWED'
    | 'NOT_FOUND'
    | 'UNAUTHORIZED'

export class ArkActionError extends Error {
  code: ArkActionErrorCode

  constructor(options: { code: ArkActionErrorCode, message: string }) {
    super(options.message)
    this.name = 'ArkActionError'
    this.code = options.code
  }
}

export async function createArkActionContext(event: H3Event) {
  const db = useDatabase()
  const { auth, session } = await createBoundRequestAuth(event, db)
  return { auth, db, event, session }
}

export type ArkActionContext = Awaited<ReturnType<typeof createArkActionContext>> & { arkUser?: any }

export function arkActionResourceAccountability(
  ctx: ArkActionContext,
  options: {
    arkUserId?: null | string
    capabilities?: readonly string[]
    spaceId?: null | string
  } = {},
): ArkResourceAccountability {
  return {
    arkUserId: options.arkUserId ?? ctx.arkUser?.id ?? null,
    capabilities: options.capabilities ?? [],
    spaceId: options.spaceId ?? null,
    system: false,
    userId: ctx.session?.user?.id ?? null,
  }
}

type ArkActionAccess = 'ark-user' | 'base' | 'user'
type ArkActionKind = 'mutation' | 'query'

export interface ArkActionProcedure<TClientInput = unknown, TOutput = unknown, TKind extends ArkActionKind = ArkActionKind> {
  access: ArkActionAccess
  handler: (options: { ctx: ArkActionContext, input: any }) => TOutput | Promise<TOutput>
  inputSchema?: ArkInputSchema<any>
  kind: TKind
  parse: (input: unknown) => any
  type: 'ark-action'
}

interface ArkInputSchema<T> {
  parse: (input: unknown) => T
}

class ArkActionBuilder<TInput = undefined, TClientInput = TInput> {
  constructor(
    private readonly access: ArkActionAccess,
    private readonly schema?: ArkInputSchema<TInput>,
  ) {}

  input<Schema extends z.ZodType>(schema: Schema) {
    return new ArkActionBuilder<z.output<Schema>, z.input<Schema>>(this.access, schema)
  }

  mutation<TOutput>(handler: (options: { ctx: ArkActionContext, input: TInput }) => TOutput | Promise<TOutput>): ArkActionProcedure<TClientInput, Awaited<TOutput>, 'mutation'> {
    return this.procedure('mutation', handler)
  }

  query<TOutput>(handler: (options: { ctx: ArkActionContext, input: TInput }) => TOutput | Promise<TOutput>): ArkActionProcedure<TClientInput, Awaited<TOutput>, 'query'> {
    return this.procedure('query', handler)
  }

  private procedure<TOutput, TKind extends ArkActionKind>(kind: TKind, handler: (options: { ctx: ArkActionContext, input: TInput }) => TOutput | Promise<TOutput>): ArkActionProcedure<TClientInput, Awaited<TOutput>, TKind> {
    return {
      access: this.access,
      handler: handler as any,
      inputSchema: this.schema,
      kind,
      parse: input => this.schema ? this.schema.parse(input) : input,
      type: 'ark-action',
    }
  }
}

export const baseAction = new ArkActionBuilder('base')
export const protectedAction = new ArkActionBuilder('user')
export const arkUserAction = new ArkActionBuilder('ark-user')

export function createArkActionRouter<T extends Record<string, any>>(router: T): T {
  return router
}

export function isArkActionProcedure(value: unknown): value is ArkActionProcedure<any, any, any> {
  return Boolean(value && typeof value === 'object' && (value as ArkActionProcedure).type === 'ark-action')
}

export async function executeArkAction(procedure: ArkActionProcedure, event: H3Event, rawInput: unknown) {
  const ctx: ArkActionContext = await createArkActionContext(event)
  if (procedure.access !== 'base' && !ctx.session?.user)
    throw new ArkActionError({ code: 'UNAUTHORIZED', message: 'Authentication required' })
  if (procedure.access === 'ark-user') {
    const arkUser = await ctx.auth.arkUser()
    if (!arkUser)
      throw new ArkActionError({ code: 'CONFLICT', message: 'Ark profile is not provisioned.' })
    ctx.arkUser = arkUser
  }
  const input = procedure.parse(rawInput)
  return procedure.handler({ ctx, input })
}
