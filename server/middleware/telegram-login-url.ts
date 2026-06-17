import { defineEventHandler, getQuery, getRequestURL, sendRedirect } from 'h3'
import { telegramLoginFields } from '../utils/telegram-login'

function stringQueryValue(value: unknown) {
  return typeof value === 'string' ? value : undefined
}

export default defineEventHandler(async (event) => {
  if (event.method !== 'GET')
    return

  const url = getRequestURL(event)
  if (url.pathname === '/api/auth/telegram-login')
    return

  const query = getQuery(event)
  if (!stringQueryValue(query.id) || !stringQueryValue(query.auth_date) || !stringQueryValue(query.hash))
    return

  const authUrl = new URL('/api/auth/telegram-login', url.origin)
  for (const key of telegramLoginFields) {
    const value = stringQueryValue(query[key])
    if (value)
      authUrl.searchParams.set(key, value)
  }
  const hash = stringQueryValue(query.hash)
  if (hash)
    authUrl.searchParams.set('hash', hash)

  for (const key of telegramLoginFields)
    url.searchParams.delete(key)
  url.searchParams.delete('hash')
  authUrl.searchParams.set('redirect', `${url.pathname}${url.search}${url.hash}`)

  return sendRedirect(event, `${authUrl.pathname}${authUrl.search}`, 302)
})
