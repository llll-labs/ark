import { runTelegramMiniAuthGuard } from '../utils/arkRouteGuards'

export default defineNuxtRouteMiddleware(runTelegramMiniAuthGuard)
