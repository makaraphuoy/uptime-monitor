<script setup lang="ts">
import { cn } from '~/lib/utils'
interface Props { class?: string }
const props = defineProps<Props>()
</script>
<template>
  <div :class="cn('relative flex flex-1 flex-col overflow-hidden', props.class)">
    <slot />
  </div>
</template>
