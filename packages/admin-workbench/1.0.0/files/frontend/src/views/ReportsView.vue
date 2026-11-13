<script setup lang="ts">
import { BarChart3, CalendarDays, Download, FileChartColumn, TrendingUp, Users } from 'lucide-vue-next'
const summaries = [
  { label: 'Team performance', detail: 'Tasks completed by team', icon: Users, value: '1,284', tone: 'teal' },
  { label: 'Project health', detail: 'Status across active work', icon: TrendingUp, value: '92%', tone: 'blue' },
  { label: 'Workload overview', detail: 'Capacity for this month', icon: BarChart3, value: '76%', tone: 'amber' },
]
</script>

<template>
  <div class="page-heading-row"><div><p class="eyebrow">INSIGHTS</p><h1>Reports</h1><p class="page-subtitle">A clear view of progress across your workspace.</p></div><button class="secondary-button"><Download :size="16" /> Export report</button></div>
  <div class="report-summary-grid"><article v-for="item in summaries" :key="item.label" class="report-card"><span class="metric-icon" :class="item.tone"><component :is="item.icon" :size="18" /></span><h2>{{ item.label }}</h2><p>{{ item.detail }}</p><strong>{{ item.value }}</strong><span class="report-change">+8.4% from last month</span></article></div>
  <article class="chart-panel"><div class="panel-title"><div><h2>Workspace activity</h2><p>Completed tasks over the last 8 weeks</p></div><button class="filter-select"><CalendarDays :size="15" /> Last 8 weeks</button></div><div class="chart-area"><div class="chart-y-labels"><span>400</span><span>300</span><span>200</span><span>100</span><span>0</span></div><div class="chart-bars"><div v-for="(height, index) in [38, 52, 45, 67, 58, 76, 69, 92]" :key="index" class="chart-bar-wrap"><i :style="{ height: `${height}%` }"></i><span>{{ ['Sep 22', 'Sep 29', 'Oct 06', 'Oct 13', 'Oct 20', 'Oct 27', 'Nov 03', 'Nov 10'][index] }}</span></div></div></div><p class="chart-note"><FileChartColumn :size="15" /> Example reporting surface. Connect your own service data to replace these values.</p></article>
</template>
