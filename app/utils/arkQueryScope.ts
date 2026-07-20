export type ArkViewerScope = 'public' | `viewer:${string}`

export function arkViewerScope(publicRead: boolean, userId?: null | string): ArkViewerScope {
  return publicRead ? 'public' : `viewer:${userId || 'anonymous'}`
}
