export interface DiscordDigestJob {
  budgetAmount?: null | string
  budgetCurrency?: null | string
  description?: null | string
  id?: string
  kind?: null | string
  source?: null | string
  sourceUrl?: null | string
  summary?: null | string
  title: string
  url?: null | string
}

export interface DiscordWebhookDigestInput {
  fetcher?: typeof fetch
  jobs: DiscordDigestJob[]
  title?: string
  webhookUrl: string
}

export interface DiscordWebhookDigestResult {
  chunks: number
  ok: boolean
  results: Array<{
    body: unknown
    ok: boolean
    status: number
  }>
}

const maxEmbedsPerMessage = 10
const maxDescriptionLength = 380
const maxTitleLength = 240

function trimText(value: null | string | undefined, max: number) {
  const normalized = String(value ?? '').replace(/\s+/g, ' ').trim()
  if (normalized.length <= max)
    return normalized
  return `${normalized.slice(0, Math.max(0, max - 1)).trimEnd()}...`
}

function jobDescription(job: DiscordDigestJob) {
  return trimText(job.summary ?? job.description ?? '', maxDescriptionLength)
}

function jobFields(job: DiscordDigestJob) {
  const fields: Array<{ inline: boolean, name: string, value: string }> = []
  if (job.budgetAmount) {
    fields.push({
      inline: true,
      name: 'Budget',
      value: `${job.budgetAmount}${job.budgetCurrency ? ` ${job.budgetCurrency}` : ''}`,
    })
  }
  if (job.kind) {
    fields.push({
      inline: true,
      name: 'Kind',
      value: job.kind,
    })
  }
  if (job.source) {
    fields.push({
      inline: true,
      name: 'Source',
      value: job.source,
    })
  }
  return fields
}

export function buildDiscordWebhookDigestPayload(input: { jobs: DiscordDigestJob[], title?: string }) {
  return {
    allowed_mentions: { parse: [] },
    content: input.title ?? `New jobs: ${input.jobs.length}`,
    embeds: input.jobs.map(job => ({
      description: jobDescription(job),
      fields: jobFields(job),
      title: trimText(job.title, maxTitleLength),
      url: job.url || job.sourceUrl || undefined,
    })),
  }
}

export async function sendDiscordWebhookDigest(input: DiscordWebhookDigestInput): Promise<DiscordWebhookDigestResult> {
  const webhookUrl = input.webhookUrl.trim()
  if (!webhookUrl)
    throw new Error('Discord webhook URL is required.')
  if (!input.jobs.length)
    return { chunks: 0, ok: true, results: [] }

  const fetcher = input.fetcher ?? globalThis.fetch
  const results: DiscordWebhookDigestResult['results'] = []
  for (let offset = 0; offset < input.jobs.length; offset += maxEmbedsPerMessage) {
    const jobs = input.jobs.slice(offset, offset + maxEmbedsPerMessage)
    const payload = buildDiscordWebhookDigestPayload({
      jobs,
      title: input.title ?? `New jobs: ${input.jobs.length}`,
    })
    const response = await fetcher(webhookUrl, {
      body: JSON.stringify(payload),
      headers: { 'Content-Type': 'application/json' },
      method: 'POST',
    })
    const rawBody = await response.text().catch(() => '')
    const body = rawBody
      ? (() => {
          try {
            return JSON.parse(rawBody)
          }
          catch {
            return rawBody
          }
        })()
      : null
    results.push({
      body,
      ok: response.ok,
      status: response.status,
    })
  }

  return {
    chunks: Math.ceil(input.jobs.length / maxEmbedsPerMessage),
    ok: results.every(result => result.ok),
    results,
  }
}
