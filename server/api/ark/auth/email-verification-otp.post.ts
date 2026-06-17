import { eq } from 'drizzle-orm'
import { createError, defineEventHandler, readBody, toWebRequest } from 'h3'
import { arkAuthUsers, arkAuthVerifications } from '../../../../db/schema'
import { emailOtpCopy, emailOtpIdentifier, generateEmailOtp, hashEmailOtp, requestEmailLocale } from '../../../utils/email-otp'
import { useDatabase } from '../../../utils/db'
import { sendEmail } from '../../../utils/email'

function normalizeEmail(value: unknown) {
  return String(value ?? '').trim().toLowerCase()
}

export default defineEventHandler(async (event) => {
  const body = await readBody<{ email?: unknown }>(event)
  const email = normalizeEmail(body.email)
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw createError({ statusCode: 400, statusMessage: 'Valid email is required.' })
  }

  const db = useDatabase()
  const [user] = await db.select({
    emailVerified: arkAuthUsers.emailVerified,
  }).from(arkAuthUsers).where(eq(arkAuthUsers.email, email)).limit(1)

  if (!user || user.emailVerified)
    return { sent: true }

  const otp = generateEmailOtp()
  const identifier = emailOtpIdentifier('email-verification', email)
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000)

  await db.delete(arkAuthVerifications).where(eq(arkAuthVerifications.identifier, identifier))
  await db.insert(arkAuthVerifications).values({
    expiresAt,
    identifier,
    value: `${hashEmailOtp(otp)}:0`,
  })

  try {
    await sendEmail({
      to: email,
      ...emailOtpCopy(requestEmailLocale({ request: toWebRequest(event) }), 'email-verification', otp),
    })
  }
  catch {
    await db.delete(arkAuthVerifications).where(eq(arkAuthVerifications.identifier, identifier))
    throw createError({
      statusCode: 502,
      statusMessage: 'Verification code email could not be sent.',
    })
  }

  return { sent: true }
})
