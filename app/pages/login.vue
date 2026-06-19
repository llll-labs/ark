<script setup lang="ts">
definePageMeta({
  layout: false,
})

const route = useRoute()
const auth = useArkAuth()
const { $trpc } = useNuxtApp()

const { data: settings } = await useAsyncData('ark-login-settings', () => $trpc.ark.settings.public.query().catch(() => null))

function redirectTarget(target?: string) {
  return safeRedirect(target) || safeRedirect(route.query.redirect) || '/'
}

async function postAuthTarget(target?: string) {
  const me = await auth.check(true)
  const finalTarget = redirectTarget(target) === '/onboarding' ? '/app/jobs' : redirectTarget(target)
  return onboardingRedirectTarget(settings.value, me, finalTarget) || finalTarget
}

async function finishAuthenticated(target?: string) {
  const me = await auth.check(true)
  if (me?.authenticated)
    await navigateTo(await postAuthTarget(target), { replace: true })
}

onMounted(() => {
  void finishAuthenticated()
})
</script>

<template>
  <main class="grid min-h-dvh place-items-center bg-muted px-4 py-8 text-default">
    <section class="w-full max-w-[420px] overflow-hidden rounded-xl border border-default bg-default shadow-2xl ring-1 ring-default">
      <header class="flex justify-center border-b border-default px-6 pb-5 pt-6">
        <ArkLogo />
      </header>

      <div class="px-6 py-6">
        <ArkAuthPanel
          auto-telegram-mini-auth
          compact
          :oauth-redirect="route.query.redirect"
          show-back
          @authenticated="finishAuthenticated"
        />

        <ArkLocaleSelect class="mt-4" />
      </div>
    </section>
  </main>
</template>
