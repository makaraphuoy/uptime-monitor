import { useAuthStore } from '~/stores/auth'

export default defineNuxtRouteMiddleware(async (to) => {
  const auth = useAuthStore()

  // Always resolve the auth check on first navigation so auth.checked becomes
  // true and the loading overlay in app.vue clears — even on public pages.
  if (!auth.checked) {
    await auth.checkAuth()
  }

  // Public pages — no redirect needed
  if (to.path === '/login' || to.path === '/status') return

  if (!auth.user) {
    return navigateTo('/login')
  }
})
