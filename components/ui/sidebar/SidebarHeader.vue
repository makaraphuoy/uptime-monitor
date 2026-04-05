<script setup lang="ts">
import { cn } from '~/lib/utils'
interface Props { class?: string }
const props = defineProps<Props>()
</script>
<template>
  <div :class="cn('flex flex-col gap-2 p-3 border-b border-sidebar-border', props.class)">
    <slot />
  </div>
</template>
