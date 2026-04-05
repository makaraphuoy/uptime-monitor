<script setup lang="ts">
import { PanelLeftClose, PanelLeftOpen } from 'lucide-vue-next'
import { cn } from '~/lib/utils'

interface Props { class?: string }
const props = defineProps<Props>()
const { isOpen, toggle } = useSidebar()
</script>

<template>
  <button
    :class="cn(
      'inline-flex items-center justify-center rounded-md p-2 text-muted-foreground',
      'hover:bg-accent hover:text-foreground transition-colors',
      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
      props.class
    )"
    :title="isOpen ? 'Collapse sidebar' : 'Expand sidebar'"
    @click="toggle"
  >
    <PanelLeftClose v-if="isOpen" class="size-4" />
    <PanelLeftOpen v-else class="size-4" />
  </button>
</template>
