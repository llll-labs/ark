/**
 * Derive up-to-two uppercase initials from a display name, ignoring `@`/`#`
 * handle prefixes and non-alphanumeric characters. Returns `fallback` when no
 * usable characters remain.
 */
export function nameInitials(name: string | null | undefined, fallback = '?'): string {
  const letters = Array.from((name ?? '').replace(/[@#]/g, '').trim())
    .filter(character => /[\p{L}\p{N}]/u.test(character))
    .slice(0, 2)
    .join('')
  return letters ? letters.toUpperCase() : fallback
}
