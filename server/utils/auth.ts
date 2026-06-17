import { drizzleAdapter } from '@better-auth/drizzle-adapter'
import { betterAuth } from 'better-auth'
import { emailOTP, genericOAuth } from 'better-auth/plugins'
import * as schema from '../../db/schema'
import { useDatabase } from './db'
import {
  discordOAuthClientId,
  discordOAuthClientSecret,
  discordOAuthConfigured,
  discordOAuthUserInfo,
} from './discord-oauth'
import { resolveAppSecret } from './secret'
import { telegramAuthPlugin } from './telegram-auth'
import {
  telegramOAuthClientId,
  telegramOAuthClientSecret,
  telegramOAuthConfigured,
  telegramOAuthDiscoveryUrl,
  telegramOAuthUserInfo,
} from './telegram-oauth'
import { sendEmail } from './email'
import { emailOtpCopy, requestEmailLocale, type EmailOtpPurpose } from './email-otp'
import { uuidv7 } from './uuid'

const appPort = process.env.PORT ?? '5400'
const configuredBaseUrl = process.env.BETTER_AUTH_URL ?? `http://127.0.0.1:${appPort}`
const configuredBaseOrigin = (() => {
  try {
    return new URL(configuredBaseUrl).origin
  }
  catch {
    return ''
  }
})()
const defaultTrustedOrigins = (
  process.env.BETTER_AUTH_TRUSTED_ORIGINS
  ?? [
    configuredBaseOrigin,
    `http://localhost:${appPort}`,
    `http://127.0.0.1:${appPort}`,
    'http://localhost:*',
    'http://127.0.0.1:*',
  ].filter(Boolean).join(',')
)
  .split(',')
  .map(origin => origin.trim())
  .filter(Boolean)

const authPlugins = [
  telegramAuthPlugin(),
  ...(() => {
    const config = [
      ...(telegramOAuthConfigured()
        ? [{
            authentication: 'basic' as const,
            clientId: telegramOAuthClientId(),
            clientSecret: telegramOAuthClientSecret(),
            discoveryUrl: telegramOAuthDiscoveryUrl,
            getUserInfo: telegramOAuthUserInfo,
            overrideUserInfo: true,
            pkce: true,
            providerId: 'telegram',
            scopes: ['openid', 'profile'],
          }]
        : []),
      ...(discordOAuthConfigured()
        ? [{
            authentication: 'post' as const,
            authorizationUrl: 'https://discord.com/oauth2/authorize',
            clientId: discordOAuthClientId(),
            clientSecret: discordOAuthClientSecret(),
            getUserInfo: discordOAuthUserInfo,
            overrideUserInfo: true,
            pkce: true,
            providerId: 'discord',
            scopes: ['identify', 'email'],
            tokenUrl: 'https://discord.com/api/oauth2/token',
          }]
        : []),
    ]

    return config.length ? [genericOAuth({ config })] : []
  })(),
]

function trustedOrigins(request?: Request) {
  const origins = [...defaultTrustedOrigins]
  const origin = request?.headers.get('origin') ?? ''
  if (/^http:\/\/(?:localhost|127\.0\.0\.1):\d+$/.test(origin))
    origins.push(origin)
  return origins
}

export const auth = betterAuth({
  advanced: {
    database: {
      generateId: () => uuidv7(),
    },
  },
  baseURL: configuredBaseUrl,
  database: drizzleAdapter(useDatabase(), {
    provider: 'pg',
    schema,
  }),
  emailVerification: {
    autoSignInAfterVerification: true,
    sendOnSignIn: false,
    sendOnSignUp: false,
  },
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: true,
  },
  plugins: [
    emailOTP({
      allowedAttempts: 3,
      expiresIn: 300,
      otpLength: 6,
      overrideDefaultEmailVerification: true,
      sendVerificationOTP: async ({ email, otp, type }, ctx) => {
        const purpose: EmailOtpPurpose = type === 'sign-in'
          ? 'sign-in'
          : type === 'forget-password'
            ? 'forget-password'
            : 'email-verification'
        const copy = emailOtpCopy(requestEmailLocale(ctx), purpose, otp)
        await sendEmail({
          to: email,
          ...copy,
        })
      },
      storeOTP: 'hashed',
    }),
    ...authPlugins,
  ],
  secret: resolveAppSecret(),
  trustedOrigins,
})
