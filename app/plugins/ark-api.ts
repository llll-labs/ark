import type { ArkActionProcedure } from '../../server/actions/init'
import type { ArkRouter } from '../../server/actions/routers/ark'
import { arkActionPath } from '../../server/actions/routes'

type ActionPaths<T, Kind extends 'mutation' | 'query', Prefix extends string = ''> = {
  [Key in keyof T & string]: T[Key] extends ArkActionProcedure<any, any, infer ProcedureKind>
    ? ProcedureKind extends Kind ? `${Prefix}${Key}` : never
    : T[Key] extends Record<string, any> ? ActionPaths<T[Key], Kind, `${Prefix}${Key}.`> : never
}[keyof T & string]

type ProcedureAt<T, Path extends string> = Path extends `${infer Head}.${infer Tail}`
  ? Head extends keyof T ? ProcedureAt<T[Head], Tail> : never
  : Path extends keyof T ? T[Path] : never

type ProcedureInput<T> = T extends ArkActionProcedure<infer Input, any, any> ? Input : never
type ProcedureOutput<T> = T extends ArkActionProcedure<any, infer Output, any> ? Output : never
export type QueryPath = ActionPaths<ArkRouter, 'query'>
export type MutationPath = ActionPaths<ArkRouter, 'mutation'>
export type ArkMutationInput<Path extends MutationPath> = ProcedureInput<ProcedureAt<ArkRouter, Path>>
export type ArkQueryInput<Path extends QueryPath> = ProcedureInput<ProcedureAt<ArkRouter, Path>>

function actionUrl(path: string, mutation: boolean) {
  return arkActionPath(path.split('.'), mutation ? 'mutation' : 'query')
}

export interface ArkApiClient {
  mutate: <Path extends MutationPath>(path: Path, input?: ArkMutationInput<Path>) => Promise<ProcedureOutput<ProcedureAt<ArkRouter, Path>>>
  query: <Path extends QueryPath>(path: Path, input?: ArkQueryInput<Path>) => Promise<ProcedureOutput<ProcedureAt<ArkRouter, Path>>>
}

export default defineNuxtPlugin({
  name: 'ark-api',
  setup() {
    const requestFetch = useRequestFetch()
    const api = {
      async mutate(path: string, input: unknown = {}) {
        const response = await requestFetch<{ data: any }>(actionUrl(path, true), {
          body: input as any,
          method: 'POST',
        })
        return response.data
      },
      async query(path: string, input: unknown = {}) {
        const response = await requestFetch<{ data: any }>(actionUrl(path, false), {
          query: { input: JSON.stringify(input) },
        })
        return response.data
      },
    }
    return { provide: { arkApi: api as ArkApiClient } }
  },
})
