import { createTransport } from 'nodemailer'

export interface EmailInput {
  html?: string
  subject: string
  text: string
  to: string
}

function val(name: string) {
  return String(process.env[name] ?? '').trim()
}

function bool(name: string, fallback = false) {
  const value = val(name).toLowerCase()
  if (!value)
    return fallback
  return ['1', 'true', 'yes', 'on'].includes(value)
}

export function emailConfigured() {
  return Boolean(val('EMAIL_FROM') && val('EMAIL_SMTP_HOST') && val('EMAIL_SMTP_USER') && val('EMAIL_SMTP_PASSWORD'))
}

export async function sendEmail(input: EmailInput) {
  const from = val('EMAIL_FROM')
  const host = val('EMAIL_SMTP_HOST')
  const user = val('EMAIL_SMTP_USER')
  const pass = val('EMAIL_SMTP_PASSWORD')
  const port = Number.parseInt(val('EMAIL_SMTP_PORT') || '465', 10)

  if (!from || !host || !user || !pass)
    throw new Error('Email transport is not configured.')
  if (!Number.isFinite(port))
    throw new Error('EMAIL_SMTP_PORT must be a number.')

  const transport = createTransport({
    auth: { pass, user },
    host,
    port,
    secure: bool('EMAIL_SMTP_SECURE', port === 465),
  })

  await transport.sendMail({
    from,
    html: input.html,
    subject: input.subject,
    text: input.text,
    to: input.to,
  })
}
