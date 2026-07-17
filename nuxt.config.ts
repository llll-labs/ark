import { fileURLToPath } from 'node:url'
import { defineNuxtConfig } from 'nuxt/config'
import arkAppModule from './modules/ark-app'
import { defaultArkAppConfig } from './types/ark-app'

function devHostFromValue(raw: string) {
  const value = raw.trim()
  if (!value)
    return ''

  let host = ''
  try {
    host = new URL(value).hostname
  }
  catch {
    host = value.replace(/^https?:\/\//, '').split(/[:/]/)[0] ?? ''
  }

  if (host.startsWith('*.'))
    return `.${host.slice(2)}`
  return host
}

function devAllowedHosts() {
  const hosts = new Set(['localhost', '127.0.0.1'])
  const sources = [
    process.env.BETTER_AUTH_URL ?? '',
    ...(process.env.BETTER_AUTH_TRUSTED_ORIGINS ?? '').split(','),
    ...(process.env.VITE_ALLOWED_HOSTS ?? '').split(','),
  ]
  for (const raw of sources) {
    const value = raw.trim()
    if (!value)
      continue
    const host = devHostFromValue(value)
    if (host)
      hosts.add(host)
  }
  return [...hosts].filter(Boolean)
}

function devPort(raw: string | undefined) {
  if (raw) {
    const parsed = Number.parseInt(raw, 10)
    if (Number.isFinite(parsed) && parsed > 0 && parsed < 65536)
      return parsed
  }
  return undefined
}

function devPublicUrl() {
  const raw = process.env.VITE_HMR_ORIGIN || process.env.BETTER_AUTH_URL
  if (!raw)
    return undefined

  try {
    return new URL(raw)
  }
  catch {
    return undefined
  }
}

function devHmrConfig() {
  const publicUrl = devPublicUrl()
  const hmrHost = process.env.VITE_HMR_HOST || process.env.NUXT_HMR_HOST
  const hmrProtocol = process.env.VITE_HMR_PROTOCOL || process.env.NUXT_HMR_PROTOCOL
  const serverPort = devPort(process.env.VITE_HMR_PORT || process.env.NUXT_HMR_PORT)
  const clientPort = devPort(process.env.VITE_HMR_CLIENT_PORT || process.env.NUXT_HMR_CLIENT_PORT)

  return {
    ...(hmrProtocol ? { protocol: hmrProtocol } : publicUrl?.protocol === 'https:' ? { protocol: 'wss' } : {}),
    ...(hmrHost && !hmrHost.includes('*') ? { host: hmrHost } : {}),
    ...(serverPort ? { port: serverPort } : {}),
    ...(clientPort ? { clientPort } : publicUrl?.protocol === 'https:' ? { clientPort: 443 } : {}),
  }
}

function devCssModuleImportQueryPlugin() {
  return {
    name: 'ark-dev-css-module-import-query',
    apply: 'serve' as const,
    enforce: 'post' as const,
    transform(code: string, id: string) {
      if (!id.includes('css.mjs') || !code.includes('.css'))
        return null

      const next = code.replace(/(import\s+["'])([^"']+\.css)(["'];?)/g, (_match, prefix: string, specifier: string, suffix: string) => {
        if (specifier.includes('?'))
          return `${prefix}${specifier}${suffix}`
        return `${prefix}${specifier}?import${suffix}`
      })

      return next === code ? null : { code: next, map: null }
    },
  }
}

export default defineNuxtConfig({
  ark: {
    app: defaultArkAppConfig,
  },
  compatibilityDate: '2026-05-19',
  modules: [arkAppModule, '@nuxt/ui', '@pinia/nuxt', '@nuxtjs/i18n'],
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
  vite: {
    plugins: [devCssModuleImportQueryPlugin()],
    server: {
      allowedHosts: devAllowedHosts(),
      hmr: devHmrConfig(),
    },
  },
  hooks: {
    'vite:extendConfig'(config, { isServer }) {
      if (!isServer)
        return

      config.server ||= {}
      config.server.hmr = devHmrConfig()
    },
  },
  devtools: {
    enabled: false,
  },
})
