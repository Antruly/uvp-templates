<script setup lang="ts">
import { computed, ref } from 'vue'
import { Check, Monitor, Moon, Palette, Sun } from 'lucide-vue-next'

const theme = ref(localStorage.getItem('workbench.theme') || 'light')
const accent = ref(localStorage.getItem('workbench.accent') || 'teal')
const collapsedSetting = ref(localStorage.getItem('workbench.sidebar') === 'collapsed')
const accents = [
  { id: 'teal', label: 'Lagoon', color: '#148878' },
  { id: 'blue', label: 'Cobalt', color: '#4e70c8' },
  { id: 'coral', label: 'Coral', color: '#df6c58' },
  { id: 'violet', label: 'Iris', color: '#8564c8' },
  { id: 'green', label: 'Fern', color: '#4b8c5c' },
]
const themeOptions = [
  { id: 'light', label: 'Light', detail: 'Bright surfaces', icon: Sun },
  { id: 'dark', label: 'Dark', detail: 'Easy on the eyes', icon: Moon },
  { id: 'system', label: 'System', detail: 'Follow device', icon: Monitor },
]
const effectiveTheme = computed(() => theme.value === 'system' ? (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light') : theme.value)
function chooseTheme(value: string) {
  theme.value = value
  document.documentElement.dataset.theme = effectiveTheme.value
  localStorage.setItem('workbench.theme', value)
}
function chooseAccent(value: string) {
  accent.value = value
  document.documentElement.dataset.accent = value
  localStorage.setItem('workbench.accent', value)
}
function setCompact(event: Event) {
  const compact = (event.target as HTMLInputElement).checked
  localStorage.setItem('workbench.sidebar', compact ? 'collapsed' : 'expanded')
  collapsedSetting.value = compact
  window.dispatchEvent(new CustomEvent('workbench-sidebar-setting', { detail: compact }))
}
function onSidebarChange(event: Event) {
  collapsedSetting.value = (event as CustomEvent<boolean>).detail
}
window.addEventListener('workbench-sidebar-setting', onSidebarChange)
</script>

<template>
  <div class="page-heading-row"><div><p class="eyebrow">PERSONALIZE</p><h1>Settings</h1><p class="page-subtitle">Make your workspace feel like yours.</p></div></div>
  <div class="settings-layout"><nav class="settings-nav" aria-label="Settings sections"><a class="selected" href="#appearance"><Palette :size="16" /> Appearance</a><a href="#preferences">Preferences</a></nav><div class="settings-content">
    <section id="appearance" class="settings-section"><div class="settings-section-heading"><h2>Appearance</h2><p>Choose how your workspace looks on this device.</p></div><div class="option-label">COLOR MODE</div><div class="theme-options"><button v-for="option in themeOptions" :key="option.id" class="theme-option" :class="{ selected: theme === option.id }" @click="chooseTheme(option.id)"><component :is="option.icon" :size="18" /><span><strong>{{ option.label }}</strong><small>{{ option.detail }}</small></span><Check v-if="theme === option.id" class="option-check" :size="16" /></button></div><div class="option-label accent-label">ACCENT COLOR</div><div class="accent-options"><button v-for="option in accents" :key="option.id" class="accent-option" :class="{ selected: accent === option.id }" :aria-label="`${option.label} accent`" :aria-pressed="accent === option.id" @click="chooseAccent(option.id)"><span :style="{ background: option.color }"><Check v-if="accent === option.id" :size="15" /></span><small>{{ option.label }}</small></button></div><p class="settings-hint">Your theme, accent, and sidebar layout are saved in this browser.</p></section>
    <section id="preferences" class="settings-section preference-section"><div class="settings-section-heading"><h2>Navigation</h2><p>Control how much workspace navigation is visible.</p></div><div class="preference-row"><span><strong>Compact sidebar</strong><small>Keep the sidebar icons-only by default on this device.</small></span><label class="switch"><input type="checkbox" :checked="collapsedSetting" @change="setCompact"><span></span></label></div><p class="settings-hint">Use the collapse button in the top bar to change the current layout.</p></section>
  </div></div>
</template>
