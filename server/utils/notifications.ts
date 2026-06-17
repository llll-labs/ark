import { and, eq } from 'drizzle-orm'
import { arkUsers, arkAuthAccounts, arkAuthUsers, arkNotifications } from '../../db/schema'
import { useDatabase } from './db'

export type NotifyTransport = 'email' | 'telegram'

export interface NotifyMessage {
  /** Pre-rendered, already-localized body. The calling app owns wording and i18n. */
  text: string
  /** Optional subject line, used by transports that need one (email). */
  subject?: string
}

export interface NotifyUserInput {
  /** `ark.users.id` of the recipient. */
  arkUserId: string
  /**
   * Semantic event kind, defined by the caller (e.g. `market_job_response`).
   * Stored on the outbox row; core does not interpret it.
   */
  kind: string
  message: NotifyMessage
  /** Preferred transport order; the first reachable one is used. Defaults to telegram then email. */
  prefer?: NotifyTransport[]
  /** Optional link to a domain object, for auditing the outbox. */
  target?: { id?: string, type?: string }
}

export interface NotifyResult {
  id: string
  status: 'failed' | 'queued' | 'sent' | 'skipped'
  transport: NotifyTransport | null
}

interface RecipientContacts {
  email: null | string
  telegramChatId: null | string
}

function notifyBotToken(env: NodeJS.ProcessEnv = process.env) {
  return env.TELEGRAM_BOT_TOKEN ?? ''
}

async function resolveRecipient(arkUserId: string): Promise<RecipientContacts> {
  const db = useDatabase()
  const [arkUser] = await db
    .select({ authUserId: arkUsers.authUserId })
    .from(arkUsers)
    .where(eq(arkUsers.id, arkUserId))
    .limit(1)

  if (!arkUser?.authUserId)
    return { email: null, telegramChatId: null }

  const [[authUser], [telegram]] = await Promise.all([
    db.select({ email: arkAuthUsers.email })
      .from(arkAuthUsers)
      .where(eq(arkAuthUsers.id, arkUser.authUserId))
      .limit(1),
    db.select({ accountId: arkAuthAccounts.accountId })
      .from(arkAuthAccounts)
      .where(and(eq(arkAuthAccounts.userId, arkUser.authUserId), eq(arkAuthAccounts.providerId, 'telegram')))
      .limit(1),
  ])

  return {
    email: authUser?.email ?? null,
    telegramChatId: telegram?.accountId ?? null,
  }
}

async function deliverTelegram(token: string, chatId: string, message: NotifyMessage) {
  const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    body: JSON.stringify({ chat_id: chatId, text: message.text }),
    headers: { 'Content-Type': 'application/json' },
    method: 'POST',
  })
  const result = await response.json().catch(() => ({})) as Record<string, unknown>
  return { ok: response.ok, reason: response.ok ? null : JSON.stringify(result), result }
}

/**
 * Notify a single Ark user over whichever transport core can reach them on.
 *
 * Core owns this because core owns the auth identities — Telegram accounts and
 * email. Callers (including tenant apps) supply only the recipient, an event
 * kind, and a pre-localized message, then let core choose the transport. Every
 * attempt is recorded to the `ark.notifications` outbox.
 *
 * Telegram delivery is live; email is queued to the outbox until a mail
 * transport is wired into core.
 */
export async function notifyUser(input: NotifyUserInput): Promise<NotifyResult> {
  const db = useDatabase()
  const prefer = input.prefer ?? ['telegram', 'email']
  const contacts = await resolveRecipient(input.arkUserId)
  const token = notifyBotToken()
  const base = {
    kind: input.kind,
    payloadJson: { subject: input.message.subject, text: input.message.text },
    targetId: input.target?.id,
    targetType: input.target?.type,
  }

  for (const transport of prefer) {
    if (transport === 'telegram' && contacts.telegramChatId && token) {
      const sent = await deliverTelegram(token, contacts.telegramChatId, input.message)
      const [row] = await db.insert(arkNotifications).values({
        ...base,
        channel: 'telegram',
        error: sent.reason,
        recipientJson: { arkUserId: input.arkUserId, chatId: contacts.telegramChatId },
        resultJson: sent.result,
        sentAt: sent.ok ? new Date() : null,
        status: sent.ok ? 'sent' : 'failed',
      }).returning()
      return { id: row!.id, status: row!.status, transport: 'telegram' }
    }

    if (transport === 'email' && contacts.email) {
      // No mail transport in core yet — queue so a future mailer can pick it up.
      const [row] = await db.insert(arkNotifications).values({
        ...base,
        channel: 'email',
        recipientJson: { arkUserId: input.arkUserId, email: contacts.email },
        status: 'queued',
      }).returning()
      return { id: row!.id, status: row!.status, transport: 'email' }
    }
  }

  const [row] = await db.insert(arkNotifications).values({
    ...base,
    channel: prefer[0] ?? 'telegram',
    error: 'no reachable transport for recipient',
    recipientJson: { arkUserId: input.arkUserId },
    status: 'skipped',
  }).returning()
  return { id: row!.id, status: row!.status, transport: null }
}
