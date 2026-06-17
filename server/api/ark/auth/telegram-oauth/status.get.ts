import { defineEventHandler } from 'h3'
import { telegramOAuthConfigured } from '../../../../utils/telegram-oauth'

export default defineEventHandler(() => {
  return {
    configured: telegramOAuthConfigured(),
    providerId: 'telegram',
  }
})
