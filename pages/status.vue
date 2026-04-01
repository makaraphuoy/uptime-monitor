<script setup lang="ts">
import {
  Activity,
  AlertCircle,
  CheckCircle2,
  Clock,
  ExternalLink,
  XCircle,
} from 'lucide-vue-next'
import { formatResponseTime, formatUptime } from '~/composables/useMonitorStats'
import type { Heartbeat } from '~/stores/monitors'

definePageMeta({ layout: false })

interface PublicMonitor {
  id: number
  name: string
  url: string
  type: string
  enabled: boolean
  latestHeartbeat: Heartbeat | null
  uptime24h: number | null
  uptime7d: number | null
  uptime30d: number | null
  recentHeartbeats: Heartbeat[]
}

const monitors = ref<PublicMonitor[]>([])
const loading = ref(true)
const error = ref<string | null>(null)
const lastUpdated = ref<Date | null>(null)

async function fetchMonitors() {
  try {
    monitors.value = await $fetch<PublicMonitor[]>('/api/public/monitors')
    lastUpdated.value = new Date()
    error.value = null
  } catch (e: any) {
    error.value = e.message || 'Failed to load status'
  } finally {
    loading.value = false
  }
}

onMounted(fetchMonitors)
const { pause } = useIntervalFn(fetchMonitors, 60_000)
onUnmounted(pause)

const overallStatus = computed(() => {
  if (!monitors.value.length) return 'none'
  if (monitors.value.some(m => m.latestHeartbeat?.status === 'down')) return 'degraded'
  if (monitors.value.every(m => !m.latestHeartbeat || m.latestHeartbeat.status === 'pending')) return 'pending'
  return 'operational'
})

const uptimeColor = (val: number | null) => {
  if (val === null) return 'text-muted-foreground'
  if (val >= 99) return 'text-green-400'
  if (val >= 95) return 'text-yellow-400'
  return 'text-red-400'
}

// Show only hostname for public URLs to avoid leaking full paths
function displayHost(url: string) {
  try { return new URL(url).hostname }
  catch { return url }
}
</script>

<template>
  <div class="min-h-screen bg-background">
    <!-- Header -->
    <header class="border-b border-border bg-background/95 backdrop-blur sticky top-0 z-10">
      <div class="max-w-4xl mx-auto px-6 py-4 flex items-center justify-between gap-4">
        <div class="flex items-center gap-3">
          <div class="flex size-8 items-center justify-center rounded-lg bg-primary/20">
            <Activity class="size-4 text-primary" />
          </div>
          <div>
            <h1 class="text-sm font-bold text-foreground">System Status</h1>
            <p class="text-[11px] text-muted-foreground">Real-time service monitoring</p>
          </div>
        </div>
        <NuxtLink
          to="/login"
          class="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          <ExternalLink class="size-3" />
          Dashboard
        </NuxtLink>
      </div>
    </header>
    <main class="max-w-4xl mx-auto px-6 py-8 space-y-6 min-h-[80vh]">

      <!-- Loading -->
      <div v-if="loading" class="space-y-3">
        <div v-for="i in 3" :key="i" class="rounded-lg border border-border p-4 space-y-3">
          <div class="flex items-center gap-3">
            <Skeleton class="size-3 rounded-full" />
            <Skeleton class="h-4 w-1/3" />
          </div>
          <Skeleton class="h-8 w-full rounded" />
        </div>
      </div>

      <template v-else>
        <!-- Error -->
        <div
          v-if="error"
          class="flex items-center gap-2 rounded-lg bg-destructive/10 border border-destructive/20 px-4 py-3 text-sm text-destructive"
        >
          <AlertCircle class="size-4 shrink-0" />{{ error }}
        </div>

        <!-- Overall status banner -->
        <div
          :class="[
            'flex items-center gap-3 rounded-xl border px-5 py-4 text-sm font-semibold',
            overallStatus === 'operational' ? 'bg-green-500/10 border-green-500/20 text-green-400'
            : overallStatus === 'degraded'    ? 'bg-red-500/10 border-red-500/20 text-red-400'
            : 'bg-yellow-500/10 border-yellow-500/20 text-yellow-400',
          ]"
        >
          <CheckCircle2 v-if="overallStatus === 'operational'" class="size-5 shrink-0" />
          <XCircle v-else-if="overallStatus === 'degraded'" class="size-5 shrink-0" />
          <AlertCircle v-else class="size-5 shrink-0" />

          <span v-if="overallStatus === 'operational'">All Systems Operational</span>
          <span v-else-if="overallStatus === 'degraded'">
            Partial Outage — {{ monitors.filter(m => m.latestHeartbeat?.status === 'down').length }}
            service{{ monitors.filter(m => m.latestHeartbeat?.status === 'down').length !== 1 ? 's' : '' }} down
          </span>
          <span v-else>Checking Services…</span>

          <span class="ml-auto text-xs opacity-60 font-normal tabular-nums">
            {{ monitors.filter(m => m.latestHeartbeat?.status === 'up').length }} / {{ monitors.length }} up
          </span>
        </div>

        <!-- Empty state -->
        <div
          v-if="!monitors.length && !error"
          class="flex flex-col items-center justify-center py-20 text-center"
        >
          <div class="mb-4 flex size-14 items-center justify-center rounded-2xl bg-card border border-border">
            <Activity class="size-6 text-muted-foreground" />
          </div>
          <p class="text-sm text-muted-foreground">No public monitors configured</p>
        </div>

        <!-- Monitor list -->
        <div v-else class="space-y-3">
          <Card
            v-for="monitor in monitors"
            :key="monitor.id"
            class="p-4"
          >
            <!-- Top row -->
            <div class="flex items-start gap-3">
              <div class="pt-0.5 shrink-0">
                <StatusBadge :status="monitor.latestHeartbeat?.status ?? 'pending'" :show-label="false" size="lg" />
              </div>
              <div class="min-w-0 flex-1">
                <div class="flex items-center gap-2 flex-wrap">
                  <span class="font-semibold text-foreground">{{ monitor.name }}</span>
                  <StatusBadge :status="monitor.latestHeartbeat?.status ?? 'pending'" size="sm" :show-label="true" />
                </div>
                <p class="text-xs text-muted-foreground font-mono mt-0.5">{{ displayHost(monitor.url) }}</p>
              </div>
              <div class="shrink-0 text-right">
                <p class="text-sm font-semibold text-foreground tabular-nums">
                  {{ formatResponseTime(monitor.latestHeartbeat?.responseTimeMs) }}
                </p>
                <p class="text-[10px] text-muted-foreground mt-0.5">response</p>
              </div>
            </div>

            <!-- Uptime bar -->
            <div class="mt-3">
              <UptimeBar :heartbeats="monitor.recentHeartbeats" :blocks="90" />
            </div>

            <!-- Uptime stats -->
            <div class="flex items-center gap-4 mt-2.5 text-xs text-muted-foreground">
              <span>
                24h: <span :class="['font-medium tabular-nums', uptimeColor(monitor.uptime24h)]">{{ formatUptime(monitor.uptime24h) }}</span>
              </span>
              <span>
                7d: <span :class="['font-medium tabular-nums', uptimeColor(monitor.uptime7d)]">{{ formatUptime(monitor.uptime7d) }}</span>
              </span>
              <span>
                30d: <span :class="['font-medium tabular-nums', uptimeColor(monitor.uptime30d)]">{{ formatUptime(monitor.uptime30d) }}</span>
              </span>
            </div>
          </Card>
        </div>
      </template>
    </main>

    <!-- Footer -->
    <footer class="border-t border-border mt-12">
      <div class="max-w-4xl mx-auto px-6 py-5 flex items-center justify-between text-xs text-muted-foreground/50">
        <span class="flex items-center gap-1.5">
          <Activity class="size-3" />
          Uptime Monitor
        </span>
        <span v-if="lastUpdated" class="flex items-center gap-1">
          <Clock class="size-3" />
          Updated {{ lastUpdated.toLocaleTimeString() }}
        </span>
      </div>
    </footer>
  </div>
</template>
