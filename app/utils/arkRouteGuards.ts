function isArkAppRoute(path: string) {
  return path === '/app' || path.startsWith('/app/')
}

function isPublicArkRoute(path: string) {
  return !isArkAppRoute(path)
    || path === '/'
    || path === '/login'
    || path === '/onboarding'
}

function settingsObject(value: unknown) {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, any>
    : {}
}

function onboardingState(profile: unknown) {
  const profileJson = settingsObject(settingsObject(profile).profileJson)
  return {
    completed: Boolean(
      profileJson.onboarding_completed
      || profileJson.onboardingComplete
      || settingsObject(profileJson.onboarding).completed,
    ),
    dismissed: Boolean(
      profileJson.onboarding_dismissed
      || settingsObject(profileJson.onboarding).dismissed,
    ),
    reviewPending: Boolean(
      profileJson.onboarding_pending_review
      || settingsObject(profileJson.onboarding).reviewStatus === 'pending_review',
    ),
  }
}

function onboardingBypassed(subject: unknown) {
  const value = settingsObject(subject)
  const arkUser = settingsObject(value.arkUser ?? subject)
  const profileJson = settingsObject(arkUser.profileJson)
  const systemRole = String(profileJson.systemRole ?? '').toLowerCase()
  if (['admin', 'operator', 'owner'].includes(systemRole))
    return true

  const capabilities = Array.isArray(value.capabilities) ? value.capabilities : []
  return capabilities.some(capability => [
    'market.jobs.manage',
    'members.manage',
    'roles.manage',
    'settings.manage',
  ].includes(String(capability)))
}

function hasArkUser(subject: unknown) {
  return Boolean(settingsObject(subject).arkUser)
}

function redirectWithContext(nuxtApp: ReturnType<typeof useNuxtApp>, target: any) {
  return nuxtApp.runWithContext(() => navigateTo(target, { replace: true }))
}

async function completeArkProfileIfNeeded(auth: ReturnType<typeof useArkAuth>, me: any) {
  if (!me?.authenticated)
    return me
  const profile = await auth.loadProfile().catch(() => ({ arkUser: null, arkUserExtension: null }))
  const subject = { ...me, ...profile }
  if (hasArkUser(subject))
    return subject
  const refreshed = await auth.completeProfile()
  return {
    ...refreshed,
    arkUser: auth.profile.value,
    arkUserExtension: auth.profileExtension.value,
  }
}

async function withArkAccess(auth: ReturnType<typeof useArkAuth>, me: any) {
  if (!me?.authenticated)
    return me
  const access = await auth.loadAccess().catch(() => ({ capabilities: [], memberships: [] }))
  return { ...me, ...access }
}

function onboardingPolicy(settings: unknown) {
  const onboardingJson = settingsObject(settingsObject(settings).onboardingJson)
  const enabled = onboardingJson.enabled !== false
  const configured = enabled && (
    onboardingJson.enabled === true
    || Array.isArray(onboardingJson.onboarding_fields)
    || Array.isArray(onboardingJson.fields)
    || Boolean(onboardingJson.onboarding_method)
  )
  const reviewRequired = enabled && Boolean(onboardingJson.review_required ?? onboardingJson.reviewRequired)
  const required = enabled && Boolean(onboardingJson.required ?? onboardingJson.onboarding_required ?? reviewRequired)
  return {
    enabled,
    optional: configured && !required && !reviewRequired,
    required,
    reviewRequired,
  }
}

export function onboardingRedirectTarget(settings: unknown, subject: unknown, target: unknown) {
  const policy = onboardingPolicy(settings)
  if (!policy.enabled || onboardingBypassed(subject))
    return ''

  const state = onboardingState(settingsObject(subject).arkUser ?? subject)
  if (policy.reviewRequired && state.reviewPending) {
    return {
      path: '/onboarding',
      query: { redirect: safeRedirect(target, '/') },
    }
  }
  if (policy.required && !state.completed) {
    return {
      path: '/onboarding',
      query: { redirect: safeRedirect(target, '/') },
    }
  }
  if (policy.optional && !state.completed && !state.dismissed) {
    return {
      path: '/onboarding',
      query: { redirect: safeRedirect(target, '/') },
    }
  }
  return ''
}

export async function runTelegramMiniAuthGuard(to: any) {
  if (to.path.startsWith('/api') || isTelegramMiniAutoAuthSuppressed() || !hasTelegramMiniLaunchParams())
    return

  const nuxtApp = useNuxtApp()
  const pending = useState('ark-telegram-mini-auth-pending', () => false)
  if (pending.value)
    return
  pending.value = true

  try {
    const auth = useArkAuth()
    await auth.ready()
    const me = auth.me.value
    if (me?.authenticated)
      return

    const settings = await nuxtApp.$arkApi.query('settings.public').catch(() => null)
    const authJson = settingsObject(settings?.authJson)
    if (!authJson.telegram_enabled)
      return

    const target = await authenticateTelegramMiniLaunch(to.query.redirect, to.path)
    const subject = await withArkAccess(auth, auth.me.value)
    const nextTarget = onboardingRedirectTarget(settings, subject, target) || target
    if (nextTarget && nextTarget !== to.fullPath)
      return redirectWithContext(nuxtApp, nextTarget)
  }
  catch (error) {
    console.warn('[ark] Telegram Mini auto-auth failed', error)
  }
  finally {
    pending.value = false
  }
}

export async function runArkAuthGuard(to: any) {
  if (to.path.startsWith('/api'))
    return

  const nuxtApp = useNuxtApp()
  const auth = useArkAuth()
  await auth.ready()

  if (to.path === '/login') {
    const me = await completeArkProfileIfNeeded(auth, auth.me.value)
    if (me?.authenticated && hasArkUser(me))
      return redirectWithContext(nuxtApp, telegramMiniPostAuthTarget('/login', to.query.redirect))
    return
  }

  if (isPublicArkRoute(to.path))
    return

  const me = await completeArkProfileIfNeeded(auth, auth.me.value)
  if (!me?.authenticated) {
    return redirectWithContext(nuxtApp, {
      path: '/login',
      query: { redirect: to.fullPath },
    })
  }
  if (!hasArkUser(me)) {
    return redirectWithContext(nuxtApp, {
      path: '/login',
      query: { redirect: to.fullPath },
    })
  }
}

export async function runArkOnboardingGuard(to: any) {
  if (to.path.startsWith('/api') || to.path === '/login')
    return

  if (!isArkAppRoute(to.path) && to.path !== '/onboarding')
    return

  const nuxtApp = useNuxtApp()
  const auth = useArkAuth()
  await auth.ready()
  const me = await completeArkProfileIfNeeded(auth, auth.me.value)
  if (!me?.authenticated)
    return
  if (!hasArkUser(me))
    return

  const settings = await nuxtApp.$arkApi.query('settings.public').catch(() => null)
  if (to.path === '/onboarding')
    return

  const subject = await withArkAccess(auth, me)
  const target = onboardingRedirectTarget(settings, subject, to.fullPath)
  if (target)
    return redirectWithContext(nuxtApp, target)
}
