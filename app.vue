<script setup lang="ts">
import { Activity } from 'lucide-vue-next'
import { useAuthStore } from '~/stores/auth'

const auth = useAuthStore()
</script>

<template>
  <div>
    <!-- Full-page loading overlay while the initial auth check runs.
         Prevents a flash of protected content before the redirect fires. -->
    <Transition name="auth-fade">
      <div
        v-if="!auth.checked"
        class="fixed inset-0 z-50 flex items-center justify-center bg-background"
      >
        <Activity class="size-8 text-primary animate-pulse" />
      </div>
    </Transition>

    <NuxtLayout>
      <NuxtPage />
    </NuxtLayout>
  </div>
</template>

<style>
.auth-fade-leave-active { transition: opacity 0.2s ease; }
.auth-fade-leave-to { opacity: 0; }
</style>
