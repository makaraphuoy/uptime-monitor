<script setup lang="ts">
import { Sun, Moon, Monitor } from 'lucide-vue-next'

const colorMode = useColorMode()

const options = [
  { value: 'light', icon: Sun, label: 'Light' },
  { value: 'dark', icon: Moon, label: 'Dark' },
  { value: 'auto', icon: Monitor, label: 'System' },
] as const
</script>

<template>
  <div class="flex items-center rounded-md border border-border bg-muted/40 p-0.5 gap-0.5">
    <button
      v-for="opt in options"
      :key="opt.value"
      :title="opt.label"
      :class="[
        'flex items-center justify-center size-6 rounded transition-colors',
        colorMode === opt.value
          ? 'bg-background text-foreground shadow-sm'
          : 'text-muted-foreground hover:text-foreground',
      ]"
      @click="colorMode = opt.value"
    >
      <component :is="opt.icon" class="size-3.5" />
    </button>
  </div>
</template>
