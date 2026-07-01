import { createHash, randomInt } from 'node:crypto'

export type EmailLocale = 'en' | 'ru'
export type EmailOtpPurpose = 'email-verification' | 'forget-password' | 'sign-in'

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function supportedEmailLocale(value: unknown): EmailLocale | null {
  const normalized = String(value ?? '').trim().toLowerCase()
  if (normalized.startsWith('ru'))
    return 'ru'
  if (normalized.startsWith('en'))
    return 'en'
  return null
}

function cookieValue(cookie: string, name: string) {
  const prefix = `${name}=`
  return cookie.split(';')
    .map(part => part.trim())
    .find(part => part.startsWith(prefix))
    ?.slice(prefix.length)
}

export function requestEmailLocale(ctx?: { request?: Request }): EmailLocale {
  const headers = ctx?.request?.headers
  return supportedEmailLocale(headers?.get('x-ark-locale'))
    ?? supportedEmailLocale(cookieValue(headers?.get('cookie') ?? '', 'ark_locale'))
    ?? supportedEmailLocale(headers?.get('accept-language'))
    ?? 'en'
}

export function emailOtpCopy(locale: EmailLocale, purpose: EmailOtpPurpose, otp: string) {
  const safeOtp = escapeHtml(otp)
  if (locale === 'ru') {
    const labels: Record<EmailOtpPurpose, string> = {
      'email-verification': 'подтверждения email',
      'forget-password': 'сброса пароля',
      'sign-in': 'входа',
    }
    const label = labels[purpose]
    return {
      html: [
        `<p>Ваш код ${label}: <strong>${safeOtp}</strong>.</p>`,
        '<p>Код действует 5 минут.</p>',
        '<p>Если вы не запрашивали этот код, просто проигнорируйте письмо.</p>',
      ].join(''),
      subject: `Ваш код ${label}`,
      text: [
        `Ваш код ${label}: ${otp}.`,
        '',
        'Код действует 5 минут.',
        'Если вы не запрашивали этот код, просто проигнорируйте письмо.',
      ].join('\n'),
    }
  }

  const labels: Record<EmailOtpPurpose, string> = {
    'email-verification': 'email verification',
    'forget-password': 'password reset',
    'sign-in': 'sign-in',
  }
  const label = labels[purpose]
  return {
    html: [
      `<p>Your ${label} code is <strong>${safeOtp}</strong>.</p>`,
      '<p>The code expires in 5 minutes.</p>',
      '<p>If you did not request this, you can ignore this email.</p>',
    ].join(''),
    subject: `Your ${label} code`,
    text: [
      `Your ${label} code is ${otp}.`,
      '',
      'The code expires in 5 minutes.',
      'If you did not request this, you can ignore this email.',
    ].join('\n'),
  }
}

export function passwordResetLinkCopy(locale: EmailLocale, url: string) {
  const safeUrl = escapeHtml(url)
  if (locale === 'ru') {
    return {
      html: [
        '<p>Мы получили запрос на сброс пароля.</p>',
        `<p><a href="${safeUrl}">Задайте новый пароль</a>.</p>`,
        '<p>Ссылка действует 1 час. Если вы не запрашивали сброс пароля, просто проигнорируйте письмо.</p>',
      ].join(''),
      subject: 'Сброс пароля',
      text: [
        'Мы получили запрос на сброс пароля.',
        '',
        `Задайте новый пароль: ${url}`,
        '',
        'Ссылка действует 1 час. Если вы не запрашивали сброс пароля, просто проигнорируйте письмо.',
      ].join('\n'),
    }
  }

  return {
    html: [
      '<p>We received a request to reset your password.</p>',
      `<p><a href="${safeUrl}">Set a new password</a>.</p>`,
      '<p>This link expires in 1 hour. If you did not request this, you can ignore this email.</p>',
    ].join(''),
    subject: 'Reset your password',
    text: [
      'We received a request to reset your password.',
      '',
      `Set a new password: ${url}`,
      '',
      'This link expires in 1 hour. If you did not request this, you can ignore this email.',
    ].join('\n'),
  }
}

export function generateEmailOtp() {
  return randomInt(0, 1_000_000).toString().padStart(6, '0')
}

export function hashEmailOtp(otp: string) {
  return createHash('sha256').update(otp).digest('base64url')
}

export function emailOtpIdentifier(type: EmailOtpPurpose, email: string) {
  return `${type}-otp-${email}`
}
