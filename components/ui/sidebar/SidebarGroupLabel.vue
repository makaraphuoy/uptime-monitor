<script setup lang="ts">
import { cn } from '~/lib/utils'
interface Props { class?: string }
const props = defineProps<Props>()
const { isOpen } = useSidebar()
</script>
<template>
  <p
    :class="cn(
      'px-2 py-1.5 text-xs font-semibold uppercase tracking-wider text-sidebar-foreground/50 truncate transition-opacity duration-200',
      !isOpen && 'opacity-0 pointer-events-none',
      props.class
    )"
  >
    <slot />
  </p>
</template>
