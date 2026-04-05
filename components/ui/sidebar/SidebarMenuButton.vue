<script setup lang="ts">
import { Primitive } from 'radix-vue'
import { cn } from '~/lib/utils'

interface Props {
  asChild?: boolean
  isActive?: boolean
  size?: 'default' | 'sm' | 'lg'
  class?: string
}
const props = withDefaults(defineProps<Props>(), { size: 'default' })
const { isOpen } = useSidebar()
</script>

<template>
  <Primitive
    :as="asChild ? 'template' : 'button'"
    :as-child="asChild"
    :data-active="isActive || undefined"
    :class="cn(
      'flex w-full items-center gap-2 overflow-hidden rounded-md text-sm font-medium',
      'text-sidebar-foreground/80 outline-none ring-sidebar-ring transition-colors',
      'hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
      'focus-visible:ring-2 disabled:pointer-events-none disabled:opacity-50',
      'data-[active]:bg-sidebar-accent data-[active]:text-sidebar-accent-foreground',
      '[&>svg]:size-4 [&>svg]:shrink-0 [&>svg]:text-sidebar-foreground/60',
      '[&[data-active]>svg]:text-sidebar-accent-foreground',
      size === 'default' && 'h-9 px-2',
      size === 'sm' && 'h-7 px-2 text-xs',
      size === 'lg' && 'h-11 px-2',
      !isOpen && 'justify-center px-0',
      props.class
    )"
  >
    <slot />
  </Primitive>
</template>
