import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

export interface Heartbeat {
  id: number
  monitorId: number
  status: 'up' | 'down' | 'pending'
  responseTimeMs: number | null
  checkedAt: string | null
  message: string | null
}

export interface Monitor {
  id: number
  name: string
  url: string
  type: 'http' | 'tcp'
  intervalSeconds: number
  timeoutSeconds: number
  enabled: boolean
  visibility: 'public' | 'private'
  userId: number | null
  createdAt: string | null
  updatedAt: string | null
  latestHeartbeat: Heartbeat | null
  uptime24h: number | null
  uptime7d: number | null
  uptime30d: number | null
  recentHeartbeats: Heartbeat[]
}

export interface NewMonitorPayload {
  name: string
  url: string
  type: 'http' | 'tcp'
  intervalSeconds: number
  timeoutSeconds: number
  enabled: boolean
  visibility: 'public' | 'private'
}

export const useMonitorsStore = defineStore('monitors', () => {
  const monitors = ref<Monitor[]>([])
  const loading = ref(false)
  const error = ref<string | null>(null)
  const lastFetched = ref<Date | null>(null)

  const totalMonitors = computed(() => monitors.value.length)
  const upMonitors = computed(() =>
    monitors.value.filter(m => m.latestHeartbeat?.status === 'up').length
  )
  const downMonitors = computed(() =>
    monitors.value.filter(m => m.latestHeartbeat?.status === 'down').length
  )
  const pendingMonitors = computed(() =>
    monitors.value.filter(m => !m.latestHeartbeat || m.latestHeartbeat.status === 'pending').length
  )

  async function fetchMonitors() {
    loading.value = true
    error.value = null
    try {
      const data = await $fetch<Monitor[]>('/api/monitors')
      monitors.value = data
      lastFetched.value = new Date()
    } catch (err: any) {
      error.value = err.message || 'Failed to fetch monitors'
    } finally {
      loading.value = false
    }
  }

  async function createMonitor(payload: NewMonitorPayload) {
    const data = await $fetch<Monitor>('/api/monitors', {
      method: 'POST',
      body: payload
    })
    monitors.value.push({
      ...data,
      latestHeartbeat: null,
      uptime24h: null,
      uptime7d: null,
      uptime30d: null,
      recentHeartbeats: []
    })
    return data
  }

  async function updateMonitor(id: number, payload: Partial<NewMonitorPayload>) {
    const data = await $fetch<Monitor>(`/api/monitors/${id}`, {
      method: 'PUT',
      body: payload
    })
    const index = monitors.value.findIndex(m => m.id === id)
    if (index !== -1) {
      monitors.value[index] = { ...monitors.value[index], ...data }
    }
    return data
  }

  async function deleteMonitor(id: number) {
    await $fetch(`/api/monitors/${id}`, { method: 'DELETE' })
    monitors.value = monitors.value.filter(m => m.id !== id)
  }

  async function toggleMonitor(id: number) {
    const data = await $fetch<Monitor>(`/api/monitors/${id}/toggle`, {
      method: 'POST'
    })
    const index = monitors.value.findIndex(m => m.id === id)
    if (index !== -1) {
      monitors.value[index] = { ...monitors.value[index], ...data }
    }
    return data
  }

  function getMonitor(id: number): Monitor | undefined {
    return monitors.value.find(m => m.id === id)
  }

  return {
    monitors,
    loading,
    error,
    lastFetched,
    totalMonitors,
    upMonitors,
    downMonitors,
    pendingMonitors,
    fetchMonitors,
    createMonitor,
    updateMonitor,
    deleteMonitor,
    toggleMonitor,
    getMonitor
  }
})
