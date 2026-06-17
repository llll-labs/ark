import { defineEventHandler } from 'h3'
import { discordOAuthConfigured } from '../../../../utils/discord-oauth'

export default defineEventHandler(() => {
  return {
    configured: discordOAuthConfigured(),
    providerId: 'discord',
  }
})
