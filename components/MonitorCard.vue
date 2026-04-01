<script setup lang="ts">
import { Clock, Lock, Pause, Pencil, Play, Trash2, TrendingDown, TrendingUp } from 'lucide-vue-next'
import type { Monitor } from '~/stores/monitors'
import { formatResponseTime, formatUptime } from '~/composables/useMonitorStats'
import { useMonitorsStore } from '~/stores/monitors'

interface Props { monitor: Monitor }

const props = defineProps<Props>()
const emit = defineEmits<{
  edit: [monitor: Monitor]
  delete: [id: number]
}>()

const store = useMonitorsStore()
const router = useRouter()

const currentStatus = computed(() => props.monitor.latestHeartbeat?.status ?? 'pending')

async function handleToggle() {
  try {
    await store.toggleMonitor(props.monitor.id)
  } catch (err) {
    console.error('Failed to toggle monitor:', err)
  }
}

const borderColor = computed(() => ({
  up: 'border-l-green-500',
  down: 'border-l-red-500',
  pending: 'border-l-yellow-500',
}[currentStatus.value] ?? 'border-l-yellow-500'))

const glowClass = computed(() => ({
  up: 'hover:shadow-green-500/5',
  down: 'hover:shadow-red-500/10',
  pending: '',
}[currentStatus.value] ?? ''))

const uptimeColor = (val: number | null) => {
  if (val === null) return 'text-muted-foreground'
  if (val >= 99) return 'text-green-400'
  if (val >= 95) return 'text-yellow-400'
  return 'text-red-400'
}

// Response-time trend: compare avg of last 5 vs previous 5 successful checks
const trend = computed(() => {
  const ups = props.monitor.recentHeartbeats
    .filter(h => h.status === 'up' && h.responseTimeMs !== null)
  if (ups.length < 6) return null

  const recent = ups.slice(-5).map(h => h.responseTimeMs as number)
  const previous = ups.slice(-10, -5).map(h => h.responseTimeMs as number)
  if (previous.length < 5) return null

  const recentAvg = recent.reduce((a, b) => a + b, 0) / recent.length
  const prevAvg = previous.reduce((a, b) => a + b, 0) / previous.length
  const diffPct = ((recentAvg - prevAvg) / prevAvg) * 100

  if (Math.abs(diffPct) < 8) return null // ignore trivial noise
  return diffPct > 0 ? 'slower' : 'faster'
})
</script>

<template>
  <Card
    :class="[
      'border-l-4 p-4 transition-all cursor-pointer group hover:shadow-lg',
      borderColor,
      glowClass,
      !monitor.enabled && 'opacity-60',
    ]"
    @click="router.push(`/monitor/${monitor.id}`)"
  >
    <!-- Top row -->
    <div class="flex items-start justify-between gap-3">
      <!-- Status + Info -->
      <div class="flex items-start gap-3 min-w-0 flex-1">
        <div class="pt-0.5 shrink-0">
          <StatusBadge :status="currentStatus" :show-label="false" size="lg" />
        </div>
        <div class="min-w-0 flex-1">
          <div class="flex items-center gap-2 flex-wrap">
            <h3 class="font-semibold text-foreground truncate">{{ monitor.name }}</h3>
            <Badge
              variant="outline"
              :class="monitor.type === 'http'
                ? 'bg-blue-500/10 text-blue-400 border-blue-500/20 text-[10px] font-mono uppercase'
                : 'bg-violet-500/10 text-violet-400 border-violet-500/20 text-[10px] font-mono uppercase'"
            >
              {{ monitor.type }}
            </Badge>
            <Badge v-if="!monitor.enabled" variant="secondary" class="text-[10px]">
              Paused
            </Badge>
            <Badge
              v-if="monitor.visibility === 'private'"
              variant="outline"
              class="bg-gray-500/10 text-gray-400 border-gray-500/20 text-[10px] flex items-center gap-0.5"
            >
              <Lock class="size-2.5" />Private
            </Badge>
          </div>
          <p class="text-xs text-muted-foreground truncate mt-0.5 font-mono">{{ monitor.url }}</p>
        </div>
      </div>

      <!-- Right side: trend + action buttons -->
      <div class="flex items-center gap-1.5 shrink-0">
        <!-- Trend badge (visible when not hovering, hidden when hovering) -->
        <div
          v-if="trend"
          :class="[
            'flex items-center gap-0.5 text-[10px] font-medium px-1.5 py-0.5 rounded transition-opacity group-hover:opacity-0',
            trend === 'faster' ? 'text-green-400 bg-green-500/10' : 'text-orange-400 bg-orange-500/10',
          ]"
        >
          <TrendingDown v-if="trend === 'faster'" class="size-3" />
          <TrendingUp v-else class="size-3" />
          {{ trend === 'faster' ? 'Faster' : 'Slower' }}
        </div>

        <!-- Action buttons — visible on hover -->
        <div
          class="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
          @click.stop
        >
          <Button
            variant="ghost"
            size="icon"
            class="size-7"
            :title="monitor.enabled ? 'Pause' : 'Resume'"
            @click="handleToggle"
          >
            <Pause v-if="monitor.enabled" class="size-3.5" />
            <Play v-else class="size-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            class="size-7"
            title="Edit"
            @click="emit('edit', monitor)"
          >
            <Pencil class="size-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            class="size-7 hover:bg-red-500/10 hover:text-red-400"
            title="Delete"
            @click="emit('delete', monitor.id)"
          >
            <Trash2 class="size-3.5" />
          </Button>
        </div>
      </div>
    </div>

    <!-- Uptime bar -->
    <div class="mt-3">
      <UptimeBar :heartbeats="monitor.recentHeartbeats" :blocks="90" />
    </div>

    <!-- Stats row -->
    <div class="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2.5 text-xs">
      <span class="text-muted-foreground">
        Response:
        <span class="text-foreground font-medium tabular-nums">
          {{ formatResponseTime(monitor.latestHeartbeat?.responseTimeMs) }}
        </span>
      </span>
      <span class="text-muted-foreground">
        24h: <span :class="['font-medium tabular-nums', uptimeColor(monitor.uptime24h)]">{{ formatUptime(monitor.uptime24h) }}</span>
      </span>
      <span class="text-muted-foreground">
        7d: <span :class="['font-medium tabular-nums', uptimeColor(monitor.uptime7d)]">{{ formatUptime(monitor.uptime7d) }}</span>
      </span>
      <span class="text-muted-foreground">
        30d: <span :class="['font-medium tabular-nums', uptimeColor(monitor.uptime30d)]">{{ formatUptime(monitor.uptime30d) }}</span>
      </span>
      <span class="ml-auto flex items-center gap-1 text-muted-foreground">
        <Clock class="size-3" />
        Every {{ monitor.intervalSeconds }}s
      </span>
    </div>
  </Card>
</template>
