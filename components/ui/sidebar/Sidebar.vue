<script setup lang="ts">
import { cn } from '~/lib/utils'

interface Props {
  collapsible?: 'icon' | 'none'
  class?: string
}
const props = withDefaults(defineProps<Props>(), { collapsible: 'icon' })
const { isOpen } = useSidebar()
</script>

<template>
  <aside
    data-sidebar="sidebar"
    :data-collapsible="collapsible"
    :data-state="isOpen ? 'expanded' : 'collapsed'"
    :class="cn(
      'group/sidebar hidden lg:flex flex-col',
      'bg-sidebar text-sidebar-foreground border-r border-sidebar-border',
      'transition-[width] duration-300 ease-in-out overflow-hidden flex-shrink-0',
      collapsible === 'icon'
        ? (isOpen ? 'w-[var(--sidebar-width)]' : 'w-[var(--sidebar-width-icon)]')
        : (isOpen ? 'w-[var(--sidebar-width)]' : 'w-0'),
      props.class
    )"
  >
    <slot />
  </aside>
</template>
