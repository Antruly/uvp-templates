<script setup lang="ts">
import { computed, ref } from 'vue'
import { RouterLink, RouterView, useRoute } from 'vue-router'

const route = useRoute()
const locale = ref(localStorage.getItem('admin.locale') === 'zh-CN' ? 'zh-CN' : 'en-US')
const theme = ref(localStorage.getItem('admin.theme') === 'dark' ? 'dark' : 'light')
const copy = computed(() => locale.value === 'zh-CN'
  ? { overview: '概览', settings: '设置', online: '服务在线', title: '管理控制台' }
  : { overview: 'Overview', settings: 'Settings', online: 'Service online', title: 'Admin console' })

function setLocale(value: string) {
  locale.value = value
  localStorage.setItem('admin.locale', value)
}
function setTheme(value: string) {
  theme.value = value
  localStorage.setItem('admin.theme', value)
  document.documentElement.dataset.theme = value
}
setTheme(theme.value)
</script>

<template>
  <div class="layout">
    <aside class="sidebar">
      <a class="brand" href="/" aria-label="Home"><span class="brand-icon">A</span><span>{{ copy.title }}</span></a>
      <nav aria-label="Primary navigation">
        <RouterLink to="/" class="nav-link" :class="{ active: route.path === '/' }"><span class="nav-symbol">▦</span>{{ copy.overview }}</RouterLink>
        <RouterLink to="/settings" class="nav-link" :class="{ active: route.path === '/settings' }"><span class="nav-symbol">⚙</span>{{ copy.settings }}</RouterLink>
      </nav>
      <div class="side-status"><span class="status-dot"></span>{{ copy.online }}</div>
    </aside>
    <main class="main">
      <header class="topbar">
        <div class="breadcrumbs"><span>Workspace</span><span class="slash">/</span><strong>{{ route.meta.title }}</strong></div>
        <div class="controls">
          <select aria-label="Language" :value="locale" @change="setLocale(($event.target as HTMLSelectElement).value)"><option value="en-US">English</option><option value="zh-CN">中文</option></select>
          <button class="theme-toggle" :aria-label="theme === 'light' ? 'Use dark theme' : 'Use light theme'" @click="setTheme(theme === 'light' ? 'dark' : 'light')">{{ theme === 'light' ? '◐' : '☼' }}</button>
          <span class="avatar" aria-label="Account">A</span>
        </div>
      </header>
      <div class="content"><RouterView /></div>
    </main>
  </div>
</template>
