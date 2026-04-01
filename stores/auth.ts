import { defineStore } from 'pinia'
import { ref } from 'vue'

export interface AuthUser {
  id: number
  username: string
}

export const useAuthStore = defineStore('auth', () => {
  const user = ref<AuthUser | null>(null)
  // True after the first /api/auth/me call completes (success or fail).
  // Prevents repeated auth checks on every navigation.
  const checked = ref(false)
  const loading = ref(false)

  async function checkAuth() {
    if (checked.value) return
    loading.value = true
    try {
      const data = await $fetch<AuthUser>('/api/auth/me')
      user.value = data
    } catch {
      user.value = null
    } finally {
      checked.value = true
      loading.value = false
    }
  }

  async function login(username: string, password: string) {
    const data = await $fetch<AuthUser>('/api/auth/login', {
      method: 'POST',
      body: { username, password },
    })
    user.value = data
    checked.value = true
  }

  async function logout() {
    try {
      await $fetch('/api/auth/logout', { method: 'POST' })
    } finally {
      user.value = null
      checked.value = false
    }
  }

  return { user, checked, loading, checkAuth, login, logout }
})
