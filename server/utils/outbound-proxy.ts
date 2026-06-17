import { ProxyAgent } from 'undici'
import type { Dispatcher } from 'undici'

const stateKey = Symbol.for('@kurark/ark.outbound-proxy.fetch')

export const outboundProxyEnvKeys = {
  hosts: 'OUTBOUND_PROXY_HOSTS',
  url: 'OUTBOUND_PROXY_URL',
} as const

export interface OutboundProxyConfig {
  hosts: Set<string>
  proxyUrl: string
  redactedProxyUrl: string
}

export interface OutboundProxyResolveResult {
  config: OutboundProxyConfig | null
  warnings: string[]
}

interface FetchInitWithDispatcher extends RequestInit {
  dispatcher?: Dispatcher
}

interface OutboundProxyState {
  installed: true
  hosts: string[]
  redactedProxyUrl: string
}

function outboundProxyGlobal() {
  return globalThis as typeof globalThis & { [stateKey]?: OutboundProxyState }
}

function envValue(env: NodeJS.ProcessEnv, key: string) {
  return String(env[key] ?? '').trim()
}

export function redactProxyUrl(value: string): string {
  try {
    const url = new URL(value)
    if (url.username)
      url.username = `${decodeURIComponent(url.username).slice(0, 5)}...`
    if (url.password)
      url.password = '***'
    return url.toString().replace(/\/$/, '')
  }
  catch {
    return '<invalid proxy url>'
  }
}

export function parseOutboundProxyHosts(raw: string): Set<string> {
  const hosts = new Set<string>()

  for (const part of raw.split(',')) {
    const value = part.trim()
    if (!value)
      continue

    let host = value
    try {
      host = value.includes('://') ? new URL(value).hostname : value
    }
    catch {
      host = value
    }

    host = host.toLowerCase().replace(/\.$/, '')
    if (/^[a-z0-9.-]+$/.test(host) && host.includes('.'))
      hosts.add(host)
  }

  return hosts
}

export function resolveOutboundProxyConfig(env: NodeJS.ProcessEnv = process.env): OutboundProxyResolveResult {
  const warnings: string[] = []
  const proxyUrl = envValue(env, outboundProxyEnvKeys.url)
  const hosts = parseOutboundProxyHosts(envValue(env, outboundProxyEnvKeys.hosts))

  if (hosts.size > 0 && !proxyUrl) {
    warnings.push(`${outboundProxyEnvKeys.hosts} is configured but ${outboundProxyEnvKeys.url} is missing; restricted server fetches will use direct egress.`)
    return { config: null, warnings }
  }

  if (proxyUrl && hosts.size === 0) {
    warnings.push(`${outboundProxyEnvKeys.url} is configured but ${outboundProxyEnvKeys.hosts} has no valid hostnames; outbound proxy is disabled.`)
    return { config: null, warnings }
  }

  if (!proxyUrl)
    return { config: null, warnings }

  try {
    void new URL(proxyUrl)
  }
  catch {
    warnings.push(`${outboundProxyEnvKeys.url} must be a valid URL; outbound proxy is disabled.`)
    return { config: null, warnings }
  }

  return {
    config: {
      hosts,
      proxyUrl,
      redactedProxyUrl: redactProxyUrl(proxyUrl),
    },
    warnings,
  }
}

function requestUrl(input: RequestInfo | URL): URL | null {
  try {
    if (typeof input === 'string')
      return new URL(input)
    if (input instanceof URL)
      return input
    if (typeof Request !== 'undefined' && input instanceof Request)
      return new URL(input.url)

    const url = (input as { url?: unknown }).url
    if (typeof url === 'string')
      return new URL(url)
  }
  catch {
    return null
  }

  return null
}

export function shouldProxyFetchInput(input: RequestInfo | URL, hosts: ReadonlySet<string>): boolean {
  const url = requestUrl(input)
  return Boolean(url && hosts.has(url.hostname.toLowerCase()))
}

export function createOutboundProxyFetch(
  originalFetch: typeof fetch,
  dispatcher: Dispatcher,
  hosts: ReadonlySet<string>,
): typeof fetch {
  return ((input: RequestInfo | URL, init?: RequestInit) => {
    if (!shouldProxyFetchInput(input, hosts))
      return originalFetch(input, init)

    return originalFetch(input, {
      ...(init ?? {}),
      dispatcher,
    } as FetchInitWithDispatcher)
  }) as typeof fetch
}

export function installOutboundProxyFetch(env: NodeJS.ProcessEnv = process.env): OutboundProxyState | null {
  const { config, warnings } = resolveOutboundProxyConfig(env)

  for (const warning of warnings)
    console.warn(`[ark] outbound proxy: ${warning}`)

  if (!config)
    return null

  const global = outboundProxyGlobal()
  if (global[stateKey])
    return global[stateKey]

  const originalFetch = globalThis.fetch.bind(globalThis) as typeof fetch
  const agent = new ProxyAgent(config.proxyUrl)
  const hosts = [...config.hosts].sort()

  globalThis.fetch = createOutboundProxyFetch(originalFetch, agent, config.hosts)
  global[stateKey] = {
    installed: true,
    hosts,
    redactedProxyUrl: config.redactedProxyUrl,
  }

  console.info(`[ark] outbound proxy: enabled for ${hosts.join(', ')} via ${config.redactedProxyUrl}`)

  return global[stateKey]
}
