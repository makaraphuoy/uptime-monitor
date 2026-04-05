<script setup lang="ts">
import { cn } from '~/lib/utils'
interface Props { class?: string }
const props = defineProps<Props>()
</script>
<template>
  <div :class="cn('flex flex-1 flex-col gap-2 overflow-y-auto overflow-x-hidden p-2', props.class)">
    <slot />
  </div>
</template>
