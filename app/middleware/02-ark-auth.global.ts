import { runArkAuthGuard } from '../utils/arkRouteGuards'

export default defineNuxtRouteMiddleware(runArkAuthGuard)
