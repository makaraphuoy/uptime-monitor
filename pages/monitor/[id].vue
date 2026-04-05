<script setup lang="ts">
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  Clock,
  Pause,
  Pencil,
  Play,
  Trash2,
  XCircle,
} from 'lucide-vue-next'
import { useMonitorsStore } from '~/stores/monitors'
import type { Monitor, Heartbeat } from '~/stores/monitors'
import { formatResponseTime, formatUptime } from '~/composables/useMonitorStats'

definePageMeta({ layout: 'default' })

const route = useRoute()
const router = useRouter()
const store = useMonitorsStore()
const monitorId = computed(() => parseInt(route.params.id as string, 10))

interface MonitorDetail extends Monitor {
  incidents: Array<{ id: number; from: string; to: string; at: string; message: string }>
}
interface HeartbeatStats {
  heartbeats: Heartbeat[]
  stats: {
    upCount: number; downCount: number
    uptimePercent: number | null; avgResponseTime: number | null
    minResponseTime: number | null; maxResponseTime: number | null; period: string
  }
  recentChecks: {
    data: Heartbeat[]
    total: number
    page: number
    pageSize: number
    totalPages: number
  }
}

const monitor = ref<MonitorDetail | null>(null)
const heartbeatData = ref<HeartbeatStats | null>(null)
const loading = ref(true)
const error = ref<string | null>(null)
const selectedPeriod = ref<'24h' | '7d' | '30d'>('24h')
const showEditForm = ref(false)
const showDeleteConfirm = ref(false)
const recentPage = ref(1)
const recentPageSize = ref(20)
const PAGE_SIZE_OPTIONS = [20, 50, 100] as const

async function fetchDetail() {
  try { monitor.value = await $fetch<MonitorDetail>(`/api/monitors/${monitorId.value}`) }
  catch (e: any) { error.value = e.message || 'Failed to load monitor' }
}
async function fetchHeartbeats() {
  try {
    heartbeatData.value = await $fetch<HeartbeatStats>(`/api/monitors/${monitorId.value}/heartbeats`, {
      query: {
        period: selectedPeriod.value,
        page: recentPage.value,
        pageSize: recentPageSize.value,
      },
    })
  } catch {}
}
async function loadAll() {
  loading.value = true
  error.value = null
  await Promise.all([fetchDetail(), fetchHeartbeats()])
  loading.value = false
}

watch(selectedPeriod, () => { recentPage.value = 1; fetchHeartbeats() })
watch([recentPage, recentPageSize], fetchHeartbeats)
onMounted(loadAll)
const { pause } = useIntervalFn(loadAll, 30000)
onUnmounted(pause)

async function handleToggle() {
  if (!monitor.value) return
  const updated = await store.toggleMonitor(monitor.value.id)
  monitor.value = { ...monitor.value, ...updated }
}
async function confirmDelete() {
  if (!monitor.value) return
  await store.deleteMonitor(monitor.value.id)
  router.push('/')
}

const currentStatus = computed(() => monitor.value?.latestHeartbeat?.status ?? 'pending')
const formatDate = (ts?: string | null) => ts ? new Date(ts).toLocaleString() : 'N/A'

const uptimeColor = (val: number | null) => {
  if (!val) return 'text-muted-foreground'
  return val >= 99 ? 'text-green-400' : val >= 95 ? 'text-yellow-400' : 'text-red-400'
}
</script>

<template>
  <div class="p-6 space-y-5 max-w-5xl mx-auto">

    <!-- Back -->
    <NuxtLink
      to="/"
      class="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
    >
      <ArrowLeft class="size-4" />
      Dashboard
    </NuxtLink>

    <!-- Loading -->
    <div v-if="loading" class="space-y-4">
      <div class="flex items-center gap-3">
        <Skeleton class="size-10 rounded-full" />
        <div class="space-y-2">
          <Skeleton class="h-5 w-48" />
          <Skeleton class="h-3 w-32" />
        </div>
      </div>
      <div class="grid grid-cols-6 gap-3">
        <Skeleton v-for="i in 6" :key="i" class="h-16 rounded-lg" />
      </div>
      <Skeleton class="h-40 rounded-lg" />
    </div>

    <!-- Error -->
    <div v-else-if="error" class="flex items-center gap-2 rounded-lg bg-destructive/10 border border-destructive/20 px-4 py-3 text-sm text-destructive">
      <AlertCircle class="size-4 shrink-0" />{{ error }}
    </div>

    <template v-else-if="monitor">
      <!-- Monitor header -->
      <div class="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
        <div class="flex items-start gap-3">
          <div class="pt-0.5">
            <StatusBadge :status="currentStatus" size="lg" />
          </div>
          <div>
            <div class="flex items-center gap-2 flex-wrap">
              <h1 class="text-xl font-bold text-foreground">{{ monitor.name }}</h1>
              <Badge
                variant="outline"
                :class="monitor.type === 'http'
                  ? 'bg-blue-500/10 text-blue-400 border-blue-500/20 text-[10px] font-mono uppercase'
                  : 'bg-violet-500/10 text-violet-400 border-violet-500/20 text-[10px] font-mono uppercase'"
              >{{ monitor.type }}</Badge>
              <Badge v-if="!monitor.enabled" variant="secondary" class="text-[10px]">Paused</Badge>
            </div>
            <a
              v-if="monitor.type === 'http'"
              :href="monitor.url"
              target="_blank"
              rel="noopener noreferrer"
              class="text-xs text-muted-foreground hover:text-primary transition-colors font-mono mt-0.5 block"
            >{{ monitor.url }}</a>
            <span v-else class="text-xs text-muted-foreground font-mono mt-0.5 block">{{ monitor.url }}</span>
          </div>
        </div>

        <div class="flex items-center gap-2 shrink-0">
          <Button
            variant="outline"
            size="sm"
            class="gap-1.5"
            :class="monitor.enabled
              ? 'border-yellow-500/30 text-yellow-400 hover:bg-yellow-500/10'
              : 'border-green-500/30 text-green-400 hover:bg-green-500/10'"
            @click="handleToggle"
          >
            <Pause v-if="monitor.enabled" class="size-3.5" />
            <Play v-else class="size-3.5" />
            {{ monitor.enabled ? 'Pause' : 'Resume' }}
          </Button>
          <Button variant="outline" size="sm" class="gap-1.5" @click="showEditForm = true">
            <Pencil class="size-3.5" />Edit
          </Button>
          <Button
            variant="outline"
            size="sm"
            class="gap-1.5 border-destructive/30 text-destructive hover:bg-destructive/10"
            @click="showDeleteConfirm = true"
          >
            <Trash2 class="size-3.5" />Delete
          </Button>
        </div>
      </div>

      <!-- Stats row -->
      <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <Card class="p-3">
          <p class="text-[11px] text-muted-foreground">Response</p>
          <p class="text-lg font-bold text-foreground mt-0.5">{{ formatResponseTime(monitor.latestHeartbeat?.responseTimeMs) }}</p>
        </Card>
        <Card class="p-3">
          <p class="text-[11px] text-muted-foreground">Uptime 24h</p>
          <p :class="['text-lg font-bold mt-0.5', uptimeColor(monitor.uptime24h)]">{{ formatUptime(monitor.uptime24h) }}</p>
        </Card>
        <Card class="p-3">
          <p class="text-[11px] text-muted-foreground">Uptime 7d</p>
          <p :class="['text-lg font-bold mt-0.5', uptimeColor(monitor.uptime7d)]">{{ formatUptime(monitor.uptime7d) }}</p>
        </Card>
        <Card class="p-3">
          <p class="text-[11px] text-muted-foreground">Uptime 30d</p>
          <p :class="['text-lg font-bold mt-0.5', uptimeColor(monitor.uptime30d)]">{{ formatUptime(monitor.uptime30d) }}</p>
        </Card>
        <Card class="p-3">
          <p class="text-[11px] text-muted-foreground">Interval</p>
          <p class="text-lg font-bold text-foreground mt-0.5 flex items-center gap-1">
            <Clock class="size-3.5 text-muted-foreground" />{{ monitor.intervalSeconds }}s
          </p>
        </Card>
        <Card class="p-3">
          <p class="text-[11px] text-muted-foreground">Last Check</p>
          <p class="text-sm font-medium text-foreground mt-0.5">
            {{ monitor.latestHeartbeat?.checkedAt ? new Date(monitor.latestHeartbeat.checkedAt).toLocaleTimeString() : 'Never' }}
          </p>
        </Card>
      </div>

      <!-- Status bar -->
      <Card class="p-4">
        <h2 class="text-sm font-semibold text-foreground mb-3">Last 90 Checks</h2>
        <UptimeBar :heartbeats="monitor.recentHeartbeats" :blocks="90" />
      </Card>

      <!-- Response time chart -->
      <Card class="p-4">
        <div class="flex items-center justify-between mb-4">
          <h2 class="text-sm font-semibold text-foreground">Response Time</h2>
          <div class="flex gap-1">
            <Button
              v-for="p in ['24h', '7d', '30d']"
              :key="p"
              :variant="selectedPeriod === p ? 'default' : 'ghost'"
              size="sm"
              class="h-7 px-2.5 text-xs"
              @click="selectedPeriod = p as any"
            >{{ p }}</Button>
          </div>
        </div>

        <template v-if="heartbeatData">
          <div class="grid grid-cols-3 gap-3 text-center mb-4">
            <div class="rounded-lg bg-muted/30 py-2.5">
              <p class="text-[10px] text-muted-foreground uppercase tracking-wide">Avg</p>
              <p class="text-sm font-semibold text-foreground mt-0.5">{{ formatResponseTime(heartbeatData.stats.avgResponseTime) }}</p>
            </div>
            <div class="rounded-lg bg-green-500/5 py-2.5">
              <p class="text-[10px] text-muted-foreground uppercase tracking-wide">Min</p>
              <p class="text-sm font-semibold text-green-400 mt-0.5">{{ formatResponseTime(heartbeatData.stats.minResponseTime) }}</p>
            </div>
            <div class="rounded-lg bg-red-500/5 py-2.5">
              <p class="text-[10px] text-muted-foreground uppercase tracking-wide">Max</p>
              <p class="text-sm font-semibold text-red-400 mt-0.5">{{ formatResponseTime(heartbeatData.stats.maxResponseTime) }}</p>
            </div>
          </div>
          <ResponseTimeChart :heartbeats="heartbeatData.heartbeats" :height="150" />
        </template>
        <div v-else class="h-32 flex items-center justify-center text-sm text-muted-foreground">
          Loading…
        </div>
      </Card>

      <!-- Incident log -->
      <Card class="p-4">
        <h2 class="text-sm font-semibold text-foreground mb-3">
          Incident Log
          <span class="text-muted-foreground font-normal text-xs ml-1">(last 20 status changes)</span>
        </h2>
        <div v-if="monitor.incidents?.length" class="divide-y divide-border/50">
          <div
            v-for="incident in monitor.incidents"
            :key="incident.id"
            class="flex items-start gap-3 py-2.5"
          >
            <div :class="['mt-1.5 size-2 rounded-full shrink-0', incident.to === 'down' ? 'bg-red-500' : 'bg-green-500']" />
            <div class="flex-1 min-w-0">
              <div class="flex items-center gap-2 flex-wrap">
                <span :class="['text-sm font-medium', incident.to === 'down' ? 'text-red-400' : 'text-green-400']">
                  {{ incident.to === 'down' ? 'Went down' : 'Recovered' }}
                </span>
                <span class="text-xs text-muted-foreground">{{ formatDate(incident.at) }}</span>
              </div>
              <p v-if="incident.message" class="text-xs text-muted-foreground mt-0.5 truncate">{{ incident.message }}</p>
            </div>
          </div>
        </div>
        <p v-else class="text-sm text-muted-foreground py-3 text-center">No incidents recorded</p>
      </Card>

      <!-- Recent checks table -->
      <Card class="overflow-hidden">
        <div class="flex items-center justify-between px-4 py-3 border-b border-border gap-4">
          <div class="flex items-center gap-3">
            <h2 class="text-sm font-semibold text-foreground">Recent Checks</h2>
            <span v-if="heartbeatData" class="text-xs text-muted-foreground">
              {{ heartbeatData.stats.upCount }} up · {{ heartbeatData.stats.downCount }} down
              <span class="text-muted-foreground/60 ml-1">in {{ selectedPeriod }}</span>
            </span>
          </div>
          <div class="flex items-center gap-1.5 shrink-0">
            <span class="text-xs text-muted-foreground hidden sm:inline">Per page</span>
            <div class="flex gap-1">
              <button
                v-for="n in PAGE_SIZE_OPTIONS"
                :key="n"
                :class="[
                  'px-2 py-0.5 rounded text-xs font-medium transition-colors',
                  recentPageSize === n
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:text-foreground hover:bg-accent',
                ]"
                @click="recentPageSize = n; recentPage = 1"
              >{{ n }}</button>
            </div>
          </div>
        </div>
        <div v-if="heartbeatData?.recentChecks.data.length" class="overflow-x-auto">
          <table class="w-full text-xs">
            <thead>
              <tr class="border-b border-border bg-muted/20">
                <th class="text-left font-medium text-muted-foreground px-4 py-2.5">Status</th>
                <th class="text-left font-medium text-muted-foreground px-4 py-2.5">Response</th>
                <th class="text-left font-medium text-muted-foreground px-4 py-2.5">Checked At</th>
                <th class="text-left font-medium text-muted-foreground px-4 py-2.5">Message</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="hb in heartbeatData.recentChecks.data"
                :key="hb.id"
                class="border-b border-border/30 hover:bg-accent/20 transition-colors"
              >
                <td class="px-4 py-2.5">
                  <StatusBadge :status="hb.status" size="sm" />
                </td>
                <td class="px-4 py-2.5 text-foreground tabular-nums">{{ formatResponseTime(hb.responseTimeMs) }}</td>
                <td class="px-4 py-2.5 text-muted-foreground">{{ formatDate(hb.checkedAt) }}</td>
                <td class="px-4 py-2.5 text-muted-foreground/70 truncate max-w-xs">{{ hb.message || '—' }}</td>
              </tr>
            </tbody>
          </table>
          <!-- Pagination controls -->
          <div class="flex items-center justify-between px-4 py-3 border-t border-border/50">
            <span class="text-xs text-muted-foreground">
              {{ (heartbeatData.recentChecks.page - 1) * heartbeatData.recentChecks.pageSize + 1 }}–{{ Math.min(heartbeatData.recentChecks.page * heartbeatData.recentChecks.pageSize, heartbeatData.recentChecks.total) }}
              of {{ heartbeatData.recentChecks.total }}
            </span>
            <div class="flex items-center gap-1">
              <button
                :disabled="recentPage <= 1"
                class="px-2.5 py-1 rounded text-xs font-medium transition-colors disabled:opacity-30 disabled:cursor-not-allowed hover:bg-accent text-muted-foreground hover:text-foreground"
                @click="recentPage--"
              >Prev</button>
              <span class="px-2 text-xs text-muted-foreground">{{ heartbeatData.recentChecks.page }} / {{ heartbeatData.recentChecks.totalPages }}</span>
              <button
                :disabled="recentPage >= heartbeatData.recentChecks.totalPages"
                class="px-2.5 py-1 rounded text-xs font-medium transition-colors disabled:opacity-30 disabled:cursor-not-allowed hover:bg-accent text-muted-foreground hover:text-foreground"
                @click="recentPage++"
              >Next</button>
            </div>
          </div>
        </div>
        <p v-else class="px-4 py-8 text-center text-sm text-muted-foreground">No checks in this period</p>
      </Card>
    </template>

    <!-- Edit modal -->
    <MonitorFormModal
      :open="showEditForm"
      :monitor="monitor"
      @update:open="showEditForm = $event"
      @saved="loadAll"
    />

    <!-- Delete confirm -->
    <Dialog :open="showDeleteConfirm" @update:open="showDeleteConfirm = $event">
      <template #title>
        <div class="flex items-center gap-3">
          <div class="flex size-9 items-center justify-center rounded-full bg-destructive/15 shrink-0">
            <AlertCircle class="size-4 text-destructive" />
          </div>
          <span>Delete "{{ monitor?.name }}"?</span>
        </div>
      </template>
      <p class="text-sm text-muted-foreground mb-5">
        All heartbeat history will be permanently removed. This cannot be undone.
      </p>
      <div class="flex gap-3">
        <Button variant="outline" class="flex-1" @click="showDeleteConfirm = false">Cancel</Button>
        <Button variant="destructive" class="flex-1" @click="confirmDelete">Delete</Button>
      </div>
    </Dialog>
  </div>
</template>
