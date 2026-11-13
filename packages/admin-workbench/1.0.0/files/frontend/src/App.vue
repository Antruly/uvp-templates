<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { RouterLink, RouterView, useRoute } from 'vue-router'
import {
  Activity, Bell, ChevronDown, ChevronLeft, ChevronRight, Command, FileChartColumn,
  FolderKanban, LayoutDashboard, Menu, Moon, PanelLeftClose, PanelLeftOpen,
  Search, Settings, Sun, X,
} from 'lucide-vue-next'

const route = useRoute()
const collapsed = ref(localStorage.getItem('workbench.sidebar') === 'collapsed')
const mobileOpen = ref(false)
const theme = ref(localStorage.getItem('workbench.theme') || 'light')
const accent = ref(localStorage.getItem('workbench.accent') || 'teal')
const navItems = [
  { label: 'Overview', path: '/', icon: LayoutDashboard },
  { label: 'Projects', path: '/projects', icon: FolderKanban, count: '8' },
  { label: 'Reports', path: '/reports', icon: FileChartColumn },
]
const pageTitle = computed(() => String(route.meta.title || 'Overview'))
const isDark = computed(() => theme.value === 'dark')

function toggleSidebar() {
  collapsed.value = !collapsed.value
  localStorage.setItem('workbench.sidebar', collapsed.value ? 'collapsed' : 'expanded')
}
function closeMobile() { mobileOpen.value = false }
function onKeydown(event: KeyboardEvent) {
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'b') {
    event.preventDefault()
    toggleSidebar()
  }
  if (event.key === 'Escape') closeMobile()
}
function onSidebarPreference(event: Event) {
  collapsed.value = Boolean((event as CustomEvent<boolean>).detail)
}
watch([theme, accent], ([nextTheme, nextAccent]) => {
  const effectiveTheme = nextTheme === 'system'
    ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
    : nextTheme
  document.documentElement.dataset.theme = effectiveTheme
  document.documentElement.dataset.accent = nextAccent
  localStorage.setItem('workbench.theme', nextTheme)
  localStorage.setItem('workbench.accent', nextAccent)
}, { immediate: true })
function onSystemThemeChange() {
  if (theme.value === 'system') {
    document.documentElement.dataset.theme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  }
}
onMounted(() => {
  window.addEventListener('keydown', onKeydown)
  window.addEventListener('workbench-sidebar-setting', onSidebarPreference)
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', onSystemThemeChange)
})
onUnmounted(() => {
  window.removeEventListener('keydown', onKeydown)
  window.removeEventListener('workbench-sidebar-setting', onSidebarPreference)
  window.matchMedia('(prefers-color-scheme: dark)').removeEventListener('change', onSystemThemeChange)
})
</script>

<template>
  <div class="app-shell" :class="{ 'is-collapsed': collapsed }">
    <button v-if="mobileOpen" class="mobile-scrim" aria-label="Close navigation" @click="closeMobile"></button>
    <aside class="sidebar" :class="{ 'mobile-open': mobileOpen }">
      <div class="brand-row">
        <RouterLink to="/" class="brand" aria-label="Northstar home" @click="closeMobile">
          <span class="brand-mark"><Activity :size="18" :stroke-width="2.4" /></span>
          <span class="brand-copy"><strong>Northstar</strong><small>WORKSPACE</small></span>
        </RouterLink>
        <button class="icon-button mobile-close" aria-label="Close navigation" @click="closeMobile"><X :size="18" /></button>
      </div>
      <button class="workspace-switcher" :title="collapsed ? 'Northstar Studio' : undefined">
        <span class="workspace-avatar">N</span>
        <span class="workspace-copy"><strong>Northstar Studio</strong><small>Free workspace</small></span>
        <ChevronDown class="workspace-chevron" :size="15" />
      </button>
      <div class="nav-caption">WORKSPACE</div>
      <nav class="primary-nav" aria-label="Workspace navigation">
        <RouterLink v-for="item in navItems" :key="item.path" :to="item.path" class="nav-link" :class="{ active: route.path === item.path }" :title="collapsed ? item.label : undefined" @click="closeMobile">
          <component :is="item.icon" :size="18" :stroke-width="1.8" />
          <span class="nav-label">{{ item.label }}</span>
          <span v-if="item.count" class="nav-count">{{ item.count }}</span>
        </RouterLink>
      </nav>
      <div class="nav-caption tools-caption">PREFERENCES</div>
      <nav class="primary-nav" aria-label="Preferences">
        <RouterLink to="/settings" class="nav-link" :class="{ active: route.path === '/settings' }" :title="collapsed ? 'Settings' : undefined" @click="closeMobile">
          <Settings :size="18" :stroke-width="1.8" /><span class="nav-label">Settings</span>
        </RouterLink>
      </nav>
      <div class="sidebar-bottom">
        <div class="upgrade-box"><span class="upgrade-glyph"><Command :size="15" /></span><div class="upgrade-copy"><strong>Make it yours</strong><small>Choose a theme and accent</small></div></div>
        <button class="profile-row" :title="collapsed ? 'Alex Morgan' : undefined"><span class="profile-avatar">AM</span><span class="profile-copy"><strong>Alex Morgan</strong><small>Administrator</small></span><ChevronDown class="profile-chevron" :size="15" /></button>
      </div>
    </aside>

    <main class="main-area">
      <header class="topbar">
        <div class="topbar-left">
          <button class="icon-button desktop-collapse" :aria-label="collapsed ? 'Expand sidebar' : 'Collapse sidebar'" :title="collapsed ? 'Expand sidebar' : 'Collapse sidebar'" @click="toggleSidebar">
            <PanelLeftOpen v-if="collapsed" :size="18" /><PanelLeftClose v-else :size="18" />
          </button>
          <button class="icon-button mobile-menu" aria-label="Open navigation" @click="mobileOpen = true"><Menu :size="20" /></button>
          <div class="breadcrumb"><span>Workspace</span><ChevronRight :size="14" /><strong>{{ pageTitle }}</strong></div>
        </div>
        <div class="topbar-actions">
          <button class="search-button" aria-label="Search"><Search :size="16" /><span>Search</span><kbd>⌘ K</kbd></button>
          <span class="topbar-divider"></span>
          <button class="icon-button notification-button" aria-label="Notifications"><Bell :size="18" /><i></i></button>
          <button class="quick-theme" :aria-label="isDark ? 'Switch to light appearance' : 'Switch to dark appearance'" @click="theme = isDark ? 'light' : 'dark'"> <Sun v-if="isDark" :size="17" /><Moon v-else :size="17" /></button>
          <span class="topbar-avatar">AM</span>
        </div>
      </header>
      <section class="page-content"><RouterView /></section>
      <footer class="page-footer"><span>Northstar Workspace</span><span>Last synced just now</span></footer>
    </main>
  </div>
</template>
