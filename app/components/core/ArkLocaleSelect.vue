<script setup lang="ts">
const { locale, locales, setLocale } = useI18n()

const localeCookie = useCookie<string | null>('ark_locale', { maxAge: 60 * 60 * 24 * 365, path: '/', sameSite: 'lax' })
const supportedLocales = ['en', 'ru'] as const

const localeItems = computed(() => {
  const available = new Set((locales.value as Array<string | { code: string }>).map(item => typeof item === 'string' ? item : item.code))
  return supportedLocales
    .filter(code => available.has(code))
    .map(code => ({ label: code.toUpperCase(), value: code }))
})

async function selectLocale(code: typeof supportedLocales[number]) {
  if (code === locale.value)
    return
  localeCookie.value = code
  await setLocale(code as typeof locale.value)
}
</script>

<template>
  <div class="flex justify-center">
    <div class="inline-grid grid-cols-2 gap-1 rounded-md border border-default bg-muted p-0.5" role="group" aria-label="Language">
      <button
        v-for="item in localeItems"
        :key="item.value"
        type="button"
        class="h-7 min-w-10 rounded px-2 text-[11px] font-semibold tracking-normal transition"
        :class="locale === item.value ? 'bg-accented text-highlighted shadow-sm' : 'text-muted hover:bg-accented/60 hover:text-default'"
        :aria-pressed="locale === item.value"
        @click="selectLocale(item.value)"
      >
        {{ item.label }}
      </button>
    </div>
  </div>
</template>
