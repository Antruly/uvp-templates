<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { api } from '../api'

interface Overview { service: string; status: string; items: number }
const summary = ref<Overview | null>(null)
const error = ref('')
const loading = ref(true)

onMounted(async () => {
  try { summary.value = await api<Overview>('/api/overview') }
  catch (cause) { error.value = cause instanceof Error ? cause.message : 'Request failed' }
  finally { loading.value = false }
})
</script>

<template>
  <section class="page-heading"><div><p class="eyebrow">WORKSPACE</p><h1>Overview</h1><p class="subtitle">A starting point for your service operations.</p></div><span class="date-label">{{ new Intl.DateTimeFormat().format(new Date()) }}</span></section>
  <section class="metric-grid" aria-label="Service summary">
    <article class="metric"><div class="metric-label">Service status</div><div v-if="loading" class="metric-value">Loading</div><div v-else-if="error" class="metric-value error">Unavailable</div><div v-else class="metric-value"><span class="status-dot"></span>{{ summary?.status }}</div><div class="metric-note">Reported by the local service</div></article>
    <article class="metric"><div class="metric-label">Example records</div><div class="metric-value">{{ loading || error ? '—' : summary?.items }}</div><div class="metric-note">Replace with your domain data</div></article>
    <article class="metric"><div class="metric-label">Runtime</div><div class="metric-value">libuvcpp</div><div class="metric-note">HTTP service</div></article>
    <article class="metric"><div class="metric-label">Interface</div><div class="metric-value">Vue 3</div><div class="metric-note">Vite production build</div></article>
  </section>
  <section class="content-grid">
    <article class="panel"><div class="panel-heading"><div><p class="eyebrow">ACTIVITY</p><h2>Recent activity</h2></div><button class="quiet-button" aria-label="More activity options">···</button></div><div class="empty-row"><span class="activity-icon">↗</span><div><strong>No activity yet</strong><p>Connect this view to events from your service.</p></div></div><div class="empty-row"><span class="activity-icon alt">＋</span><div><strong>Start with an endpoint</strong><p>Add a typed request in the API client.</p></div></div></article>
    <article class="panel status-panel"><div class="panel-heading"><div><p class="eyebrow">HEALTH</p><h2>Service checks</h2></div></div><div class="check-row"><span class="check-indicator">✓</span><span>Process endpoint</span><code>/healthz</code></div><div class="check-row"><span class="check-indicator">✓</span><span>Overview endpoint</span><code>/api/overview</code></div><p class="panel-footnote">This example does not include access control.</p></article>
  </section>
</template>
