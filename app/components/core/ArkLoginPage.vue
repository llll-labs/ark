<script setup lang="ts">
import { storeToRefs } from 'pinia'

const route = useRoute()
const auth = useArkAuth()
const appConfig = useArkAppConfig()
const authRuntime = useArkAuthRuntimeStore()
const { publicSettings: settings } = storeToRefs(authRuntime)

function redirectTarget(target?: string) {
  return safeRedirect(target) || safeRedirect(route.query.redirect) || '/'
}

async function postAuthTarget(me: any, target?: string) {
  if (!authRuntime.authUiLoaded)
    await authRuntime.loadAuthUi()
  const requested = redirectTarget(target)
  const finalTarget = requested === '/onboarding' ? appConfig.value.home : requested
  return onboardingRedirectTarget(settings.value, me, finalTarget) || finalTarget
}

async function finishAuthenticated(target?: string) {
  await auth.ready()
  let me = auth.me.value
  let profile = me?.authenticated
    ? await auth.loadProfile().catch(() => null)
    : null
  if (me?.authenticated && !profile?.arkUser) {
    me = await auth.completeProfile().catch(() => me)
    profile = auth.profile.value ? { arkUser: auth.profile.value, arkUserExtension: auth.profileExtension.value } : null
  }
  if (me?.authenticated && profile?.arkUser) {
    const access = await auth.loadAccess().catch(() => ({ capabilities: [], memberships: [] }))
    await navigateTo(await postAuthTarget({ ...me, ...profile, ...access }, target), { replace: true })
  }
}

onMounted(() => {
  void authRuntime.loadAuthUi()
  void finishAuthenticated()
})
</script>

<template>
  <main class="grid min-h-dvh place-items-center bg-muted px-4 py-8 text-default">
    <section class="w-full max-w-[420px] overflow-hidden rounded-xl border border-default bg-default shadow-2xl ring-1 ring-default">
      <header class="flex justify-center border-b border-default px-6 pb-5 pt-6">
        <slot name="logo">
          <ArkLogo />
        </slot>
      </header>

      <div class="px-6 py-6">
        <ArkAuthPanel
          auto-telegram-mini-auth
          compact
          :oauth-redirect="route.query.redirect"
          show-back
          @authenticated="finishAuthenticated"
        >
          <template v-if="$slots['auth-legal']" #auth-legal="slotProps">
            <slot name="auth-legal" v-bind="slotProps" />
          </template>
        </ArkAuthPanel>

        <ArkLocaleSelect class="mt-4" />
      </div>
    </section>
  </main>
</template>
