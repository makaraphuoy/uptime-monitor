<script setup lang="ts">
import { Globe, Lock, Monitor, Server } from 'lucide-vue-next'
import type { Monitor as MonitorType } from '~/stores/monitors'
import { useMonitorsStore } from '~/stores/monitors'

interface Props {
  open: boolean
  monitor?: MonitorType | null
}

const props = defineProps<Props>()
const emit = defineEmits<{
  'update:open': [boolean]
  saved: []
}>()

const store = useMonitorsStore()
const isEditing = computed(() => !!props.monitor)

const defaultForm = {
  name: '',
  url: '',
  type: 'http' as 'http' | 'tcp',
  intervalSeconds: 60,
  timeoutSeconds: 30,
  enabled: true,
  visibility: 'public' as 'public' | 'private',
  regions: ['asia'] as string[],
}

const form = ref({ ...defaultForm })
const errors = ref<Record<string, string>>({})
const submitting = ref(false)

// Reset/populate form when modal opens or monitor changes
watch(
  () => props.open,
  (open) => {
    if (!open) return
    if (props.monitor) {
      form.value = {
        name: props.monitor.name,
        url: props.monitor.url,
        type: props.monitor.type,
        intervalSeconds: props.monitor.intervalSeconds,
        timeoutSeconds: props.monitor.timeoutSeconds,
        enabled: props.monitor.enabled,
        visibility: props.monitor.visibility ?? 'public',
        regions: props.monitor.regions?.length ? [...props.monitor.regions] : ['north-america'],
      }
    } else {
      form.value = { ...defaultForm }
    }
    errors.value = {}
  },
  { immediate: true }
)

const intervalOptions = [
  { label: '30 seconds', value: 30 },
  { label: '1 minute', value: 60 },
  { label: '2 minutes', value: 120 },
  { label: '5 minutes', value: 300 },
  { label: '10 minutes', value: 600 },
  { label: '30 minutes', value: 1800 },
  { label: '1 hour', value: 3600 },
]

function validate() {
  errors.value = {}
  if (!form.value.name.trim()) errors.value.name = 'Name is required'
  if (!form.value.url.trim()) errors.value.url = 'URL is required'
  if (form.value.type === 'http' && !form.value.url.match(/^https?:\/\//i)) {
    errors.value.url = 'Must start with http:// or https://'
  }
  if (form.value.type === 'tcp') {
    const cleaned = form.value.url.replace(/^tcp:\/\//i, '')
    const parts = cleaned.split(':')
    if (parts.length !== 2 || isNaN(parseInt(parts[1]))) {
      errors.value.url = 'Required format: host:port or tcp://host:port'
    }
  }
  return Object.keys(errors.value).length === 0
}

async function handleSubmit() {
  if (!validate()) return
  submitting.value = true
  try {
    if (isEditing.value && props.monitor) {
      await store.updateMonitor(props.monitor.id, form.value)
    } else {
      await store.createMonitor(form.value)
    }
    emit('saved')
    emit('update:open', false)
  } catch (err: any) {
    errors.value.general = err.message || `Failed to ${isEditing.value ? 'update' : 'create'} monitor`
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <Dialog
    :open="open"
    :title="isEditing ? 'Edit Monitor' : 'Add Monitor'"
    @update:open="emit('update:open', $event)"
  >
    <form class="space-y-5" @submit.prevent="handleSubmit">
      <!-- General error -->
      <div
        v-if="errors.general"
        class="flex items-center gap-2 rounded-lg bg-destructive/10 border border-destructive/30 px-3 py-2.5 text-sm text-destructive"
      >
        {{ errors.general }}
      </div>

      <!-- Name -->
      <div class="space-y-1.5">
        <Label for="monitor-name">Display Name</Label>
        <Input
          id="monitor-name"
          v-model="form.name"
          placeholder="e.g. My Website"
          :class="errors.name ? 'border-destructive focus-visible:ring-destructive' : ''"
          autofocus
        />
        <p v-if="errors.name" class="text-xs text-destructive">{{ errors.name }}</p>
      </div>

      <!-- Type Toggle -->
      <div class="space-y-1.5">
        <Label>Monitor Type</Label>
        <div class="grid grid-cols-2 gap-2">
          <button
            type="button"
            :class="[
              'flex items-center justify-center gap-2 rounded-lg border py-2.5 text-sm font-medium transition-all',
              form.type === 'http'
                ? 'bg-primary/10 border-primary/50 text-primary'
                : 'border-input bg-background text-muted-foreground hover:border-border hover:text-foreground'
            ]"
            @click="form.type = 'http'"
          >
            <Globe class="size-4" />
            HTTP / HTTPS
          </button>
          <button
            type="button"
            :class="[
              'flex items-center justify-center gap-2 rounded-lg border py-2.5 text-sm font-medium transition-all',
              form.type === 'tcp'
                ? 'bg-primary/10 border-primary/50 text-primary'
                : 'border-input bg-background text-muted-foreground hover:border-border hover:text-foreground'
            ]"
            @click="form.type = 'tcp'"
          >
            <Server class="size-4" />
            TCP Port
          </button>
        </div>
      </div>

      <!-- URL / Host:Port -->
      <div class="space-y-1.5">
        <Label for="monitor-url">{{ form.type === 'http' ? 'URL' : 'Host : Port' }}</Label>
        <Input
          id="monitor-url"
          v-model="form.url"
          :placeholder="form.type === 'http' ? 'https://example.com' : 'example.com:443'"
          class="font-mono text-[13px]"
          :class="errors.url ? 'border-destructive focus-visible:ring-destructive' : ''"
        />
        <p v-if="errors.url" class="text-xs text-destructive">{{ errors.url }}</p>
      </div>

      <!-- Interval + Timeout -->
      <div class="grid grid-cols-2 gap-3">
        <div class="space-y-1.5">
          <Label>Check Interval</Label>
          <Select v-model="form.intervalSeconds" :options="intervalOptions" />
        </div>
        <div class="space-y-1.5">
          <Label for="monitor-timeout">Timeout (s)</Label>
          <Input
            id="monitor-timeout"
            v-model.number="form.timeoutSeconds"
            type="number"
            min="5"
            max="60"
          />
        </div>
      </div>

      <!-- Enable toggle -->
      <div class="flex items-center justify-between rounded-lg border border-border bg-background/50 px-4 py-3">
        <div>
          <p class="text-sm font-medium">Enable monitoring</p>
          <p class="text-xs text-muted-foreground">Start checking immediately after saving</p>
        </div>
        <Switch :checked="form.enabled" @update:checked="form.enabled = $event" />
      </div>

      <!-- Visibility -->
      <div class="flex items-center justify-between rounded-lg border border-border bg-background/50 px-4 py-3">
        <div>
          <p class="text-sm font-medium flex items-center gap-1.5">
            <Globe v-if="form.visibility === 'public'" class="size-3.5 text-blue-400" />
            <Lock v-else class="size-3.5 text-muted-foreground" />
            {{ form.visibility === 'public' ? 'Public' : 'Private' }}
          </p>
          <p class="text-xs text-muted-foreground">
            {{ form.visibility === 'public' ? 'Appears on the public /status page' : 'Only visible in your dashboard' }}
          </p>
        </div>
        <Switch :checked="form.visibility === 'public'" @update:checked="form.visibility = $event ? 'public' : 'private'" />
      </div>

      <!-- Actions -->
      <div class="flex gap-3 pt-1">
        <Button type="button" variant="outline" class="flex-1" @click="emit('update:open', false)">
          Cancel
        </Button>
        <Button type="submit" class="flex-1 gap-2" :disabled="submitting">
          <svg v-if="submitting" class="size-4 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
          {{ submitting ? (isEditing ? 'Saving…' : 'Creating…') : (isEditing ? 'Save Changes' : 'Create Monitor') }}
        </Button>
      </div>
    </form>
  </Dialog>
</template>
