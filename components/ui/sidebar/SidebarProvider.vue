<script setup lang="ts">
import { cn } from '~/lib/utils'
interface Props { class?: string }
const props = defineProps<Props>()
</script>
<template>
  <div :class="cn('flex min-h-screen w-full', props.class)">
    <slot />
  </div>
</template>
