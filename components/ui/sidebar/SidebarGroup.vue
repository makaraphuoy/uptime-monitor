<script setup lang="ts">
import { cn } from '~/lib/utils'
interface Props { class?: string }
const props = defineProps<Props>()
</script>
<template>
  <div :class="cn('relative flex w-full min-w-0 flex-col', props.class)">
    <slot />
  </div>
</template>
