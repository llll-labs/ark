import { init, retrieveRawInitData } from '@tma.js/sdk-vue'

const autoAuthSuppressedKey = 'ark:telegram-mini:auto-auth-suppressed'
let sdkInitialized = false

function telegramMiniSessionStorage() {
  if (import.meta.server)
    return null
  try {
    return window.sessionStorage
  }
  catch {
    return null
  }
}

function initTelegramMiniSdk() {
  if (import.meta.server)
    return false
  if (sdkInitialized)
    return true
  init()
  sdkInitialized = true
  return true
}

function rawInitData() {
  try {
    if (import.meta.server)
      return ''
    const initData = retrieveRawInitData() ?? ''
    if (initData) {
      try {
        initTelegramMiniSdk()
      }
      catch {}
    }
    return initData
  }
  catch {
    return ''
  }
}

export function hasTelegramMiniLaunchParams() {
  return Boolean(rawInitData())
}

export function suppressTelegramMiniAutoAuth() {
  telegramMiniSessionStorage()?.setItem(autoAuthSuppressedKey, '1')
}

export function clearTelegramMiniAutoAuthSuppression() {
  telegramMiniSessionStorage()?.removeItem(autoAuthSuppressedKey)
}

export function isTelegramMiniAutoAuthSuppressed() {
  return telegramMiniSessionStorage()?.getItem(autoAuthSuppressedKey) === '1'
}

export async function waitForTelegramMiniInitData(timeoutMs = 1800) {
  const immediate = rawInitData()
  if (immediate)
    return immediate

  const startedAt = Date.now()
  while (Date.now() - startedAt < timeoutMs) {
    const initData = rawInitData()
    if (initData)
      return initData
    await new Promise(resolve => setTimeout(resolve, 100))
  }
  return ''
}

export function telegramMiniPostAuthTarget(path = '/', redirect?: unknown) {
  return safeRedirect(redirect) || (path === '/login' || path === '/' ? '/app/jobs' : path)
}

export async function authenticateTelegramMiniLaunch(redirect?: unknown, path = '/') {
  const initData = await waitForTelegramMiniInitData()
  if (!initData)
    throw new Error('Telegram init data was not found')

  const auth = useArkAuth()
  await auth.loginWithTelegramMini(initData)
  clearTelegramMiniAutoAuthSuppression()
  return telegramMiniPostAuthTarget(path, redirect)
}

export function useTelegramMiniAuth() {
  const pending = ref(false)
  const error = ref('')
  const route = useRoute()

  async function authenticate(redirect?: unknown) {
    pending.value = true
    error.value = ''
    try {
      return await authenticateTelegramMiniLaunch(redirect, route.path)
    }
    catch (cause) {
      error.value = cause instanceof Error ? cause.message : 'Telegram login failed'
      throw cause
    }
    finally {
      pending.value = false
    }
  }

  return {
    authenticate,
    error,
    hasLaunchParams: hasTelegramMiniLaunchParams,
    pending,
  }
}
