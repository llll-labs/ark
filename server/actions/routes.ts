export type ArkActionKind = 'mutation' | 'query'

function kebabCase(value: string) {
  return value.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase()
}

export function arkActionPath(segments: string[], kind: ArkActionKind) {
  const parts = [...segments]
  const operation = parts.pop()
  if (!operation)
    throw new Error('Ark Action path requires an operation.')

  const parents = parts.map(kebabCase)
  const route = kind === 'mutation'
    ? [...parents, 'actions', kebabCase(operation)]
    : [...parents, ...(operation === 'list' ? [] : [kebabCase(operation)])]
  return `/api/ark/${route.join('/')}`
}
