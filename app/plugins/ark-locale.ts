/**
 * Applies the user's explicit language choice (stored in the `ark_locale` cookie
 * by the user settings modal) on app boot, on both server and client so there is
 * no locale flash or hydration mismatch.
 *
 * The app keeps its configured `defaultLocale` for visitors without the cookie —
 * we deliberately do NOT enable @nuxtjs/i18n browser auto-detection, so the
 * default (e.g. `ru`) is never overridden by the visitor's browser.
 */
export default defineNuxtPlugin(async (nuxtApp) => {
  const cookie = useCookie<string | null>('ark_locale', { path: '/', sameSite: 'lax' })
  if (!cookie.value)
    return

  const i18n = nuxtApp.$i18n as {
    locale: { value: string }
    locales: { value: Array<string | { code: string }> }
    setLocale: (code: string) => Promise<void>
  } | undefined
  if (!i18n?.setLocale)
    return

  const codes = (i18n.locales.value ?? []).map(item => (typeof item === 'string' ? item : item.code))
  if (codes.includes(cookie.value) && i18n.locale.value !== cookie.value)
    await i18n.setLocale(cookie.value)
})
