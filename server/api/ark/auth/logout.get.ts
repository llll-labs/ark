import { getCookies } from 'better-auth/cookies'
import { serializeCookie } from 'better-call'
import { appendHeader, defineEventHandler, sendRedirect } from 'h3'
import { auth } from '../../../utils/auth'

function appendExpiredCookie(event: any, name: string, attributes: Record<string, any>, partitioned = false) {
  appendHeader(event, 'Set-Cookie', serializeCookie(name, '', {
    ...attributes,
    expires: new Date(0),
    httpOnly: true,
    maxAge: 0,
    path: '/',
    partitioned,
    sameSite: partitioned ? 'none' : attributes.sameSite,
    secure: partitioned ? true : attributes.secure || name.startsWith('__Secure-'),
  }))
}

export default defineEventHandler(async (event) => {
  await auth.api.signOut({ headers: event.headers }).catch(() => null)

  const authCookies = getCookies(auth.options)
  const cookieConfigs = [
    authCookies.sessionToken,
    authCookies.sessionData,
    authCookies.dontRememberToken,
    authCookies.accountData,
  ]

  for (const cookie of cookieConfigs) {
    const names = new Set([cookie.name, cookie.name.replace(/^__Secure-/, '')])
    for (const name of names) {
      appendExpiredCookie(event, name, cookie.attributes, true)
      appendExpiredCookie(event, name, cookie.attributes)
    }
  }

  return sendRedirect(event, '/login', 302)
})
