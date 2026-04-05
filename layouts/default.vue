<script setup lang="ts">
import {
  Activity,
  ExternalLink,
  LayoutDashboard,
  LogOut,
  Menu,
  Settings2,
  User,
  X,
} from 'lucide-vue-next'
import { useMonitorsStore } from '~/stores/monitors'
import { useAuthStore } from '~/stores/auth'

const store = useMonitorsStore()
const auth = useAuthStore()
const route = useRoute()
const router = useRouter()
const { isOpen, isMobileOpen, openMobile, closeMobile } = useSidebar()

const showLogoutConfirm = ref(false)
const loggingOut = ref(false)

async function confirmLogout() {
  loggingOut.value = true
  try {
    await auth.logout()
    router.replace('/login')
  } finally {
    loggingOut.value = false
    showLogoutConfirm.value = false
  }
}

function isActive(path: string) {
  if (path === '/') return route.path === '/'
  return route.path.startsWith(path)
}

const statusDotClass = (status: string | undefined) => ({
  'bg-green-500': status === 'up',
  'bg-red-500': status === 'down',
  'bg-yellow-500': !status || status === 'pending',
})
</script>

<template>
  <SidebarProvider class="h-dvh overflow-hidden">
    <!--  Desktop Sidebar  -->
    <Sidebar collapsible="icon">
      <!-- Header: logo -->
      <SidebarHeader>
        <div
          :class="[
            'flex items-center gap-2.5 px-1 transition-all duration-300',
            !isOpen && 'justify-center',
          ]"
        >
          <div class="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/20">
            <Activity class="size-4 text-primary" />
          </div>
          <div
            :class="[
              'overflow-hidden transition-all duration-300',
              isOpen ? 'opacity-100 w-auto' : 'opacity-0 w-0 pointer-events-none',
            ]"
          >
            <p class="text-sm font-bold text-sidebar-foreground whitespace-nowrap leading-tight">Uptime Monitor</p>
            <p class="text-[10px] text-sidebar-foreground/50 whitespace-nowrap">Status Dashboard</p>
          </div>
        </div>
      </SidebarHeader>

      <!-- Content -->
      <SidebarContent>
        <!-- Navigation -->
        <SidebarGroup>
          <SidebarGroupLabel>Navigation</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton as-child :is-active="isActive('/')">
                  <NuxtLink to="/">
                    <LayoutDashboard />
                    <span
                      :class="[
                        'truncate transition-all duration-300',
                        !isOpen && 'opacity-0 w-0 overflow-hidden',
                      ]"
                    >Dashboard</span>
                  </NuxtLink>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton as-child :is-active="isActive('/settings')">
                  <NuxtLink to="/settings">
                    <Settings2 />
                    <span
                      :class="[
                        'truncate transition-all duration-300',
                        !isOpen && 'opacity-0 w-0 overflow-hidden',
                      ]"
                    >Settings</span>
                  </NuxtLink>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarSeparator />

        <!-- Quick stats chips (expanded only) -->
        <Transition name="fade-collapse">
          <div v-if="isOpen" class="grid grid-cols-3 gap-1.5 px-2 py-1">
            <div class="flex flex-col items-center rounded-md bg-green-500/10 py-1.5">
              <span class="text-base font-bold text-green-400 leading-none">{{ store.upMonitors }}</span>
              <span class="text-[10px] text-muted-foreground mt-0.5">Up</span>
            </div>
            <div class="flex flex-col items-center rounded-md bg-red-500/10 py-1.5">
              <span class="text-base font-bold text-red-400 leading-none">{{ store.downMonitors }}</span>
              <span class="text-[10px] text-muted-foreground mt-0.5">Down</span>
            </div>
            <div class="flex flex-col items-center rounded-md bg-yellow-500/10 py-1.5">
              <span class="text-base font-bold text-yellow-400 leading-none">{{ store.pendingMonitors }}</span>
              <span class="text-[10px] text-muted-foreground mt-0.5">Pending</span>
            </div>
          </div>
        </Transition>

        <SidebarSeparator v-if="isOpen" />

        <!-- Monitor list -->
        <SidebarGroup v-if="store.monitors.length > 0" class="overflow-x-auto">
          <SidebarGroupLabel>Monitors</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem
                v-for="monitor in store.monitors.slice(0, 10)"
                :key="monitor.id"
              >
                <SidebarMenuButton
                  as-child
                  size="sm"
                  :is-active="route.path === `/monitor/${monitor.id}`"
                >
                  <NuxtLink :to="`/monitor/${monitor.id}`">
                    <span
                      :class="['size-2 rounded-full shrink-0', statusDotClass(monitor.latestHeartbeat?.status)]"
                    />
                    <span
                      :class="[
                        'truncate transition-all duration-300',
                        !isOpen && 'opacity-0 w-0 overflow-hidden',
                      ]"
                    >{{ monitor.name }}</span>
                  </NuxtLink>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
            <p
              v-if="store.monitors.length > 10 && isOpen"
              class="mt-1 px-2 text-[11px] text-sidebar-foreground/40"
            >
              +{{ store.monitors.length - 10 }} more
            </p>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <!-- Footer -->
      <SidebarFooter>
        <!-- Expanded: username + logout -->
        <div v-if="isOpen" class="flex items-center justify-between gap-2 px-1 py-1">
          <div class="flex items-center gap-2 min-w-0">
            <div class="flex size-7 items-center justify-center rounded-full bg-primary/20 shrink-0">
              <User class="size-3.5 text-primary" />
            </div>
            <span class="text-xs text-sidebar-foreground/70 truncate">{{ auth.user?.username }}</span>
          </div>
          <Button
            variant="ghost"
            size="icon"
            class="size-7 shrink-0 text-sidebar-foreground/50 hover:text-sidebar-foreground"
            title="Logout"
            @click="showLogoutConfirm = true"
          >
            <LogOut class="size-3.5" />
          </Button>
        </div>
        <!-- Collapsed: just logout icon -->
        <Button
          v-else
          variant="ghost"
          size="icon"
          class="size-7 mx-auto text-sidebar-foreground/50 hover:text-sidebar-foreground"
          title="Logout"
          @click="showLogoutConfirm = true"
        >
          <LogOut class="size-3.5" />
        </Button>
      </SidebarFooter>
    </Sidebar>

    <!--  Main area -->
    <SidebarInset>
      <!-- Top bar (desktop: just trigger; mobile: full header) -->
      <header class="sticky top-0 z-30 flex h-12 items-center gap-2 border-b border-border bg-background/95 backdrop-blur px-4">
        <!-- Desktop: sidebar collapse trigger -->
        <SidebarTrigger class="hidden lg:flex" />

        <!-- Mobile: hamburger -->
        <button
          class="lg:hidden inline-flex items-center justify-center rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
          @click="openMobile"
        >
          <Menu class="size-5" />
        </button>

        <!-- Mobile: app name -->
        <span class="lg:hidden text-sm font-semibold text-foreground">Uptime Monitor</span>

        <!-- Spacer -->
        <div class="flex-1" />

        <!-- Status page link -->
        <NuxtLink
          to="/status"
          target="_blank"
          class="hidden sm:flex items-center gap-1 text-xs text-muted-foreground/60 hover:text-muted-foreground transition-colors"
          title="Public status page"
        >
          <ExternalLink class="size-3" />
          <span class="hidden lg:inline">Status Page</span>
        </NuxtLink>

        <!-- Live status chip -->
        <div
          v-if="store.totalMonitors > 0"
          class="hidden sm:flex items-center gap-1.5 rounded-full border border-border bg-card px-2.5 py-1 text-[11px] text-muted-foreground"
        >
          <span
            :class="[
              'size-1.5 rounded-full',
              store.downMonitors > 0 ? 'bg-red-500 animate-pulse' : 'bg-green-500',
            ]"
          />
          <span v-if="store.downMonitors > 0" class="text-red-400 font-medium">
            {{ store.downMonitors }} down
          </span>
          <span v-else class="text-green-400 font-medium">All up</span>
        </div>

        <!-- Breadcrumb / current route hint -->
        <span class="hidden lg:block text-xs text-muted-foreground capitalize">
          {{ route.path === '/' ? 'Dashboard' : route.path.replace('/', '').replace('/monitor/', 'Monitor #') }}
        </span>
      </header>

      <!-- Page content -->
      <main class="flex-1 overflow-y-auto">
        <slot />
      </main>
    </SidebarInset>

    <!--  Mobile sidebar (Sheet)  -->
    <Sheet :open="isMobileOpen" side="left" @update:open="val => !val && closeMobile()">
      <!-- Sheet header -->
      <div class="flex items-center justify-between px-4 py-3 border-b border-sidebar-border">
        <div class="flex items-center gap-2">
          <div class="flex size-7 items-center justify-center rounded-lg bg-primary/20">
            <Activity class="size-4 text-primary" />
          </div>
          <span class="text-sm font-bold text-sidebar-foreground">Uptime Monitor</span>
        </div>
        <button
          class="rounded-md p-1.5 text-sidebar-foreground/60 hover:bg-sidebar-accent hover:text-sidebar-foreground transition-colors"
          @click="closeMobile"
        >
          <X class="size-4" />
        </button>
      </div>

      <!-- Sheet nav -->
      <div class="flex flex-col gap-2 p-3 overflow-y-auto flex-1">
        <NuxtLink
          v-for="item in [{ to: '/', icon: LayoutDashboard, label: 'Dashboard' }, { to: '/settings', icon: Settings2, label: 'Settings' }]"
          :key="item.to"
          :to="item.to"
          :class="[
            'flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium transition-colors',
            isActive(item.to)
              ? 'bg-sidebar-accent text-sidebar-accent-foreground'
              : 'text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
          ]"
          @click="closeMobile"
        >
          <component :is="item.icon" class="size-4 shrink-0" />
          {{ item.label }}
        </NuxtLink>

        <div v-if="store.monitors.length" class="mt-1">
          <p class="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-sidebar-foreground/40">
            Monitors
          </p>
          <NuxtLink
            v-for="monitor in store.monitors.slice(0, 15)"
            :key="monitor.id"
            :to="`/monitor/${monitor.id}`"
            :class="[
              'flex items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors',
              route.path === `/monitor/${monitor.id}`
                ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                : 'text-sidebar-foreground/70 hover:bg-sidebar-accent/50',
            ]"
            @click="closeMobile"
          >
            <span :class="['size-2 rounded-full shrink-0', statusDotClass(monitor.latestHeartbeat?.status)]" />
            <span class="truncate">{{ monitor.name }}</span>
          </NuxtLink>
        </div>
      </div>
    </Sheet>
    <!-- Logout confirmation -->
    <Dialog :open="showLogoutConfirm" @update:open="showLogoutConfirm = $event">
      <template #title>
        <div class="flex items-center gap-3">
          <div class="flex size-9 items-center justify-center rounded-full bg-muted shrink-0">
            <LogOut class="size-4 text-muted-foreground" />
          </div>
          <span>Sign Out</span>
        </div>
      </template>
      <p class="text-sm text-muted-foreground mb-5">
        Are you sure you want to sign out?
      </p>
      <div class="flex gap-3">
        <Button variant="outline" class="flex-1" :disabled="loggingOut" @click="showLogoutConfirm = false">
          Cancel
        </Button>
        <Button class="flex-1 gap-2" :disabled="loggingOut" @click="confirmLogout">
          <svg v-if="loggingOut" class="size-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
          <LogOut v-else class="size-3.5" />
          Sign Out
        </Button>
      </div>
    </Dialog>
  </SidebarProvider>
</template>

<style scoped>
.fade-collapse-enter-active,
.fade-collapse-leave-active {
  transition: opacity 0.2s ease, transform 0.2s ease;
}
.fade-collapse-enter-from,
.fade-collapse-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}
</style>
