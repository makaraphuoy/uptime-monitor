<script setup lang="ts">
import { Activity, AlertCircle, Eye, EyeOff, Loader2, Lock } from 'lucide-vue-next'
import { useAuthStore } from '~/stores/auth'

definePageMeta({ layout: false })

const auth = useAuthStore()
const router = useRouter()

const form = ref({ username: 'admin', password: 'admin' })
const error = ref<string | null>(null)
const submitting = ref(false)
const showPassword = ref(false)

// Redirect immediately if already authenticated
onMounted(async () => {
  if (!auth.checked) await auth.checkAuth()
  if (auth.user) router.replace('/')
})

async function handleLogin() {
  error.value = null
  submitting.value = true
  try {
    await auth.login(form.value.username, form.value.password)
    router.replace('/')
  } catch (err: any) {
    error.value = err?.data?.statusMessage || 'Invalid username or password'
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <div class="min-h-screen flex items-center justify-center bg-background p-4">
    <!-- Background subtle grid -->
    <div class="fixed inset-0 bg-[linear-gradient(to_right,hsl(var(--border))_1px,transparent_1px),linear-gradient(to_bottom,hsl(var(--border))_1px,transparent_1px)] bg-[size:4rem_4rem] opacity-20 pointer-events-none" />

    <div class="relative w-full max-w-sm">
      <!-- Logo + heading -->
      <div class="flex flex-col items-center mb-8 text-center">
        <div class="flex size-12 items-center justify-center rounded-2xl bg-primary/20 mb-4">
          <Activity class="size-6 text-primary" />
        </div>
        <h1 class="text-xl font-bold text-foreground">Uptime Monitor</h1>
        <p class="text-sm text-muted-foreground mt-1">Sign in to your dashboard</p>
      </div>

      <!-- Card -->
      <Card class="p-6 shadow-xl">
        <form class="space-y-4" @submit.prevent="handleLogin">
          <!-- Error -->
          <Transition name="fade">
            <div
              v-if="error"
              class="flex items-center gap-2 rounded-lg bg-destructive/10 border border-destructive/20 px-3 py-2.5 text-sm text-destructive"
            >
              <AlertCircle class="size-4 shrink-0" />
              {{ error }}
            </div>
          </Transition>

          <!-- Username -->
          <div class="space-y-1.5">
            <Label for="username">Username</Label>
            <Input
              id="username"
              v-model="form.username"
              placeholder="admin"
              autocomplete="username"
              autofocus
              :disabled="submitting"
            />
          </div>

          <!-- Password -->
          <div class="space-y-1.5">
            <Label for="password">Password</Label>
            <div class="relative">
              <Input
                id="password"
                v-model="form.password"
                :type="showPassword ? 'text' : 'password'"
                placeholder="••••••••"
                autocomplete="current-password"
                class="pr-9"
                :disabled="submitting"
              />
              <button
                type="button"
                class="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                @click="showPassword = !showPassword"
              >
                <EyeOff v-if="showPassword" class="size-3.5" />
                <Eye v-else class="size-3.5" />
              </button>
            </div>
          </div>

          <!-- Submit -->
          <Button type="submit" class="w-full gap-2" :disabled="submitting || !form.username || !form.password">
            <Loader2 v-if="submitting" class="size-4 animate-spin" />
            <Lock v-else class="size-4" />
            {{ submitting ? 'Signing in…' : 'Sign In' }}
          </Button>
        </form>
      </Card>

      <!-- Footer hint -->
      <p class="text-center text-xs text-muted-foreground/50 mt-6">
        Single-admin instance — default credentials in server logs on first boot
      </p>
    </div>
  </div>
</template>

<style scoped>
.fade-enter-active, .fade-leave-active { transition: opacity 0.2s }
.fade-enter-from, .fade-leave-to { opacity: 0 }
</style>
