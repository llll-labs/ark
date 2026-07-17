<script setup lang="ts">
definePageMeta({
  layout: 'app',
})

const auth = useArkAuth()
const appConfig = useArkAppConfig()
let me = auth.checked.value ? auth.me.value : await auth.check()
if (me?.authenticated && !me.arkUser)
  me = await auth.completeProfile().catch(() => me)

if (me?.authenticated && me.arkUser)
  await navigateTo(appConfig.value.home, { replace: true })
</script>

<template>
  <main class="min-h-full bg-default text-default">
    <section class="mx-auto grid min-h-[calc(100vh-4rem)] max-w-2xl content-center gap-8 px-5 py-16">
      <div>
        <ArkLogo size="md" />
        <h1 class="mt-8 text-4xl font-semibold leading-tight text-highlighted sm:text-5xl">
          {{ $t('landing.title') }}
        </h1>
        <p class="mt-5 text-base leading-7 text-toned">
          {{ $t('landing.subtitle') }}
        </p>
        <div class="mt-8">
          <UButton to="/login" color="primary" size="lg" icon="i-lucide-log-in">
            {{ $t('landing.login') }}
          </UButton>
        </div>
      </div>
    </section>
  </main>
</template>
