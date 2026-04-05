<script setup lang="ts">
import { cn } from '~/lib/utils'
interface Props { class?: string }
const props = defineProps<Props>()
</script>
<template>
  <div :class="cn('mx-2 my-1 h-px bg-sidebar-border', props.class)" />
</template>
