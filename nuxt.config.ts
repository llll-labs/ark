import { fileURLToPath } from 'node:url'
import { defineNuxtConfig } from 'nuxt/config'

export default defineNuxtConfig({
  compatibilityDate: '2026-05-19',
  modules: ['@nuxt/ui', '@pinia/nuxt', '@nuxtjs/i18n'],
  // Auto-import layer components by bare filename (no path-prefix) so they can be
  // grouped into feature folders later without changing component names.
  components: [
    { path: fileURLToPath(new URL('./app/components', import.meta.url)), pathPrefix: false },
  ],
  css: [fileURLToPath(new URL('./app/assets/css/core.css', import.meta.url))],
  i18n: {
    defaultLocale: 'en',
    strategy: 'no_prefix',
    detectBrowserLanguage: false,
    locales: [
      { code: 'ru', name: 'Русский', file: 'ru.json' },
      { code: 'en', name: 'English', file: 'en.json' },
    ],
  },
  runtimeConfig: {
    databaseUrl: process.env.DATABASE_URL ?? '',
    public: {
      appName: process.env.NUXT_PUBLIC_APP_NAME ?? 'Ark Layer',
    },
  },
  nitro: {
    experimental: {
      websocket: true,
    },
  },
  imports: {
    dirs: ['stores'],
  },
  typescript: {
    strict: true,
  },
  devtools: {
    enabled: true,
  },
})
