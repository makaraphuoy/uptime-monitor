<script setup lang="ts">
import {
  DialogContent,
  DialogOverlay,
  DialogPortal,
  DialogRoot,
} from 'radix-vue'
import { cn } from '~/lib/utils'

interface Props {
  open?: boolean
  side?: 'left' | 'right' | 'top' | 'bottom'
  class?: string
}
const props = withDefaults(defineProps<Props>(), { side: 'left' })
const emit = defineEmits<{ 'update:open': [boolean] }>()
</script>

<template>
  <DialogRoot :open="open" @update:open="emit('update:open', $event)">
    <DialogPortal>
      <DialogOverlay
        class="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0"
      />
      <DialogContent
        :class="cn(
          'fixed z-50 flex flex-col bg-sidebar border-sidebar-border shadow-xl transition ease-in-out',
          'data-[state=open]:animate-in data-[state=closed]:animate-out duration-300',
          side === 'left' && 'inset-y-0 left-0 h-full w-[var(--sidebar-width)] border-r data-[state=closed]:slide-out-to-left data-[state=open]:slide-in-from-left',
          side === 'right' && 'inset-y-0 right-0 h-full w-[var(--sidebar-width)] border-l data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right',
          props.class
        )"
      >
        <slot />
      </DialogContent>
    </DialogPortal>
  </DialogRoot>
</template>
