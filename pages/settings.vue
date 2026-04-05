<script setup lang="ts">
import {
  Bell,
  CheckCircle2,
  Database,
  Eye,
  EyeOff,
  Loader2,
  Send,
  XCircle,
  Zap,
} from 'lucide-vue-next'

definePageMeta({ layout: 'default' })

interface AppSettings {
  defaultIntervalSeconds: number
  webhookType: 'discord' | 'slack' | 'telegram' | 'generic'
  webhookUrl: string
  telegramBotToken: string
  telegramChatId: string
}

const settings = ref<AppSettings>({
  defaultIntervalSeconds: 60,
  webhookType: 'discord',
  webhookUrl: '',
  telegramBotToken: '',
  telegramChatId: '',
})

const saving = ref(false)
const saved = ref(false)
const testing = ref(false)
const testResult = ref<{ ok: boolean; message: string } | null>(null)
const showToken = ref(false)

const intervalOptions = [
  { label: '30 seconds', value: 30 },
  { label: '1 minute', value: 60 },
  { label: '2 minutes', value: 120 },
  { label: '5 minutes', value: 300 },
  { label: '10 minutes', value: 600 },
  { label: '30 minutes', value: 1800 },
  { label: '1 hour', value: 3600 },
]

const webhookTypes = [
  { label: 'Telegram', value: 'telegram' },
  { label: 'Discord', value: 'discord' },
  { label: 'Slack', value: 'slack' },
  { label: 'Generic', value: 'generic' },
] as const

onMounted(async () => {
  try {
    const data = await $fetch<AppSettings>('/api/settings')
    settings.value = data
  } catch {}
})

async function saveSettings() {
  saving.value = true
  try {
    await $fetch('/api/settings', { method: 'PUT', body: settings.value })
    saved.value = true
    setTimeout(() => { saved.value = false }, 3000)
  } finally {
    saving.value = false
  }
}

async function testNotification() {
  testing.value = true
  testResult.value = null
  try {
    await $fetch('/api/settings', { method: 'PUT', body: settings.value })
    await $fetch('/api/settings/test-webhook', { method: 'POST' })
    testResult.value = { ok: true, message: 'Test notification sent! Check your app.' }
  } catch (err: any) {
    testResult.value = { ok: false, message: err?.data?.message || 'Failed to send test notification.' }
  } finally {
    testing.value = false
    setTimeout(() => { testResult.value = null }, 8000)
  }
}

const isConfigured = computed(() => {
  if (settings.value.webhookType === 'telegram') {
    return !!(settings.value.telegramBotToken && settings.value.telegramChatId)
  }
  return !!settings.value.webhookUrl
})
</script>

<template>
  <div class="p-6 space-y-6 max-w-2xl mx-auto">
    <div>
      <h1 class="text-xl font-bold text-foreground">Settings</h1>
      <p class="text-sm text-muted-foreground">Configure global monitoring preferences</p>
    </div>

    <!-- General -->
    <Card class="overflow-hidden">
      <div class="flex items-center gap-2 px-5 py-3.5 border-b border-border">
        <Zap class="size-4 text-muted-foreground" />
        <h2 class="text-sm font-semibold text-foreground">General</h2>
      </div>
      <div class="p-5 space-y-4">
        <div class="space-y-1.5">
          <Label>Default Check Interval</Label>
          <p class="text-xs text-muted-foreground">Applied when creating new monitors</p>
          <div class="w-full">
            <Select v-model="settings.defaultIntervalSeconds" :options="intervalOptions" class="w-full" />
          </div>
        </div>
      </div>
    </Card>

    <!-- Notifications -->
    <Card class="overflow-hidden">
      <div class="flex items-center gap-2 px-5 py-3.5 border-b border-border">
        <Bell class="size-4 text-muted-foreground" />
        <h2 class="text-sm font-semibold text-foreground">Notifications</h2>
      </div>
      <div class="p-5 space-y-5">

        <!-- Service type selector -->
        <div class="space-y-1.5">
          <Label>Service</Label>
          <div class="flex flex-wrap gap-2">
            <button
              v-for="t in webhookTypes"
              :key="t.value"
              :class="[
                'px-3 py-1.5 rounded-md text-xs font-medium border transition-colors',
                settings.webhookType === t.value
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'border-border text-muted-foreground hover:text-foreground hover:border-foreground/30',
              ]"
              @click="settings.webhookType = t.value"
            >{{ t.label }}</button>
          </div>
        </div>

        <!-- Telegram fields -->
        <template v-if="settings.webhookType === 'telegram'">
          <!-- Bot Token -->
          <div class="space-y-1.5">
            <Label>Bot Token</Label>
            <div class="flex gap-2">
              <div class="relative flex-1">
                <Input
                  v-model="settings.telegramBotToken"
                  :type="showToken ? 'text' : 'password'"
                  placeholder="1234567890:ABCdefGHIjklMNOpqrsTUVwxyz"
                  class="pr-9 font-mono text-xs"
                />
                <button
                  class="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                  @click="showToken = !showToken"
                >
                  <EyeOff v-if="showToken" class="size-3.5" />
                  <Eye v-else class="size-3.5" />
                </button>
              </div>
            </div>
            <p class="text-xs text-muted-foreground">
              Talk to
              <a href="https://t.me/BotFather" target="_blank" class="text-primary hover:underline">@BotFather</a>
              → /newbot → copy the token
            </p>
          </div>

          <!-- Chat ID -->
          <div class="space-y-1.5">
            <Label>Chat ID</Label>
            <Input
              v-model="settings.telegramChatId"
              placeholder="-1001234567890"
              class="max-w-xs font-mono text-xs"
            />
            <p class="text-xs text-muted-foreground leading-relaxed">
              For a <span class="text-foreground">group/channel</span>: add your bot as admin, then send a message and check
              <code class="bg-muted/60 px-1 rounded">api.telegram.org/bot&lt;TOKEN&gt;/getUpdates</code>
              for the <code class="bg-muted/60 px-1 rounded">chat.id</code>.<br>
              For a <span class="text-foreground">private chat</span>: talk to
              <a href="https://t.me/userinfobot" target="_blank" class="text-primary hover:underline">@userinfobot</a>
              to get your ID.
            </p>
          </div>
        </template>

        <!-- Webhook URL (Discord / Slack / Generic) -->
        <template v-else>
          <div class="space-y-1.5">
            <Label>Webhook URL</Label>
            <Input
              v-model="settings.webhookUrl"
              type="url"
              :placeholder="
                settings.webhookType === 'discord' ? 'https://discord.com/api/webhooks/…'
                : settings.webhookType === 'slack'  ? 'https://hooks.slack.com/services/…'
                : 'https://your-server.com/webhook'
              "
              class="font-mono text-xs"
            />
            <p class="text-xs text-muted-foreground">
              <template v-if="settings.webhookType === 'discord'">
                Server Settings → Integrations → Webhooks → Copy Webhook URL
              </template>
              <template v-else-if="settings.webhookType === 'slack'">
                Slack App → Incoming Webhooks → Add New Webhook → Copy URL
              </template>
              <template v-else>
                Must accept a POST request with a JSON body
              </template>
            </p>
          </div>
        </template>

        <!-- Test button + result -->
        <div class="flex items-center gap-3">
          <Button
            variant="outline"
            size="sm"
            class="gap-1.5"
            :disabled="!isConfigured || testing"
            @click="testNotification"
          >
            <Loader2 v-if="testing" class="size-3.5 animate-spin" />
            <Send v-else class="size-3.5" />
            Send Test Notification
          </Button>

          <Transition name="fade">
            <div
              v-if="testResult"
              :class="[
                'flex items-center gap-1.5 text-xs',
                testResult.ok ? 'text-green-400' : 'text-red-400',
              ]"
            >
              <CheckCircle2 v-if="testResult.ok" class="size-3.5 shrink-0" />
              <XCircle v-else class="size-3.5 shrink-0" />
              {{ testResult.message }}
            </div>
          </Transition>
        </div>

        <p class="text-xs text-muted-foreground border-t border-border pt-4 leading-relaxed">
          A notification is sent once when a monitor goes <strong class="text-red-400">down</strong>,
          and again when it recovers (<strong class="text-green-400">up</strong>).
          No repeated alerts while the status stays the same.
        </p>
      </div>
    </Card>

    <!-- Data Management -->
    <Card class="overflow-hidden">
      <div class="flex items-center gap-2 px-5 py-3.5 border-b border-border">
        <Database class="size-4 text-muted-foreground" />
        <h2 class="text-sm font-semibold text-foreground">Data Management</h2>
      </div>
      <div class="divide-y divide-border">
        <div class="flex items-start justify-between gap-4 px-5 py-4">
          <div>
            <p class="text-sm font-medium text-foreground">Backup Database</p>
            <p class="text-xs text-muted-foreground mt-0.5">
              Creates a timestamped copy in <code class="font-mono text-primary">data/backups/</code>
            </p>
          </div>
          <Button variant="secondary" size="sm" as="a" href="/api/health" target="_blank" class="shrink-0 text-xs">
            <code>yarn db:backup</code>
          </Button>
        </div>
        <div class="flex items-start justify-between gap-4 px-5 py-4">
          <div>
            <p class="text-sm font-medium text-foreground">Heartbeat Retention</p>
            <p class="text-xs text-muted-foreground mt-0.5">
              Automatically keeps the latest 10000 heartbeats per monitor
            </p>
          </div>
          <span class="text-xs text-muted-foreground shrink-0">10000 records</span>
        </div>
      </div>
    </Card>

    <!-- Save -->
    <div class="flex items-center justify-end gap-3">
      <Transition name="fade">
        <span v-if="saved" class="flex items-center gap-1.5 text-sm text-green-400">
          <CheckCircle2 class="size-4" />Saved!
        </span>
      </Transition>
      <Button :disabled="saving" class="gap-2" @click="saveSettings">
        <Loader2 v-if="saving" class="size-3.5 animate-spin" />
        Save Settings
      </Button>
    </div>
  </div>
</template>

<style scoped>
.fade-enter-active, .fade-leave-active { transition: opacity 0.3s }
.fade-enter-from, .fade-leave-to { opacity: 0 }
</style>
