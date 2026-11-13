<script setup lang="ts">
import { ArrowDownRight, ArrowUpRight, ChevronRight, MoreHorizontal, Plus, Users, Workflow, Zap } from 'lucide-vue-next'

const metrics = [
  { label: 'Active projects', value: '24', change: '+12.8%', direction: 'up', icon: Workflow, tone: 'teal', note: 'vs. last month' },
  { label: 'Team members', value: '18', change: '+4.2%', direction: 'up', icon: Users, tone: 'blue', note: 'vs. last month' },
  { label: 'Tasks completed', value: '1,284', change: '+18.6%', direction: 'up', icon: Zap, tone: 'amber', note: 'vs. last month' },
]
const projects = [
  { name: 'Website redesign', group: 'Design team', initials: 'WD', color: 'violet', progress: 72, status: 'On track', due: 'Nov 22' },
  { name: 'Mobile app launch', group: 'Product team', initials: 'MA', color: 'blue', progress: 48, status: 'In progress', due: 'Dec 04' },
  { name: 'Q4 marketing campaign', group: 'Growth team', initials: 'MC', color: 'coral', progress: 91, status: 'On track', due: 'Nov 18' },
  { name: 'Customer portal', group: 'Engineering', initials: 'CP', color: 'green', progress: 26, status: 'At risk', due: 'Dec 12' },
]
</script>

<template>
  <div class="page-heading-row">
    <div><p class="eyebrow">MONDAY, NOVEMBER 16, 2026</p><h1>Good morning, Alex <span class="greeting">✳</span></h1><p class="page-subtitle">Here's what's happening across your workspace today.</p></div>
    <button class="primary-button"><Plus :size="16" /> New project</button>
  </div>
  <div class="metrics-grid">
    <article v-for="item in metrics" :key="item.label" class="metric-card">
      <div class="metric-top"><span class="metric-icon" :class="item.tone"><component :is="item.icon" :size="18" /></span><button class="subtle-icon" :aria-label="`${item.label} options`"><MoreHorizontal :size="18" /></button></div>
      <p class="metric-label">{{ item.label }}</p><div class="metric-value">{{ item.value }}</div>
      <div class="metric-foot"><span class="change"><ArrowUpRight :size="14" />{{ item.change }}</span><span>{{ item.note }}</span></div>
    </article>
    <article class="focus-card"><div class="focus-top"><span>WEEKLY FOCUS</span><span class="focus-mark"><Zap :size="16" /></span></div><div class="focus-number">82<span>%</span></div><p>You're ahead of your team goal</p><div class="focus-track"><i></i></div><small>41 of 50 tasks completed</small></article>
  </div>
  <div class="section-heading"><div><h2>Projects</h2><p>Your team's active work at a glance.</p></div><RouterLink to="/projects" class="text-link">View all <ChevronRight :size="15" /></RouterLink></div>
  <div class="table-wrap">
    <table><thead><tr><th>PROJECT</th><th>PROGRESS</th><th>STATUS</th><th>DUE DATE</th><th></th></tr></thead>
      <tbody><tr v-for="project in projects" :key="project.name"><td><div class="project-name"><span class="project-icon" :class="project.color">{{ project.initials }}</span><span><strong>{{ project.name }}</strong><small>{{ project.group }}</small></span></div></td><td><div class="progress-cell"><div class="progress-track"><i :style="{ width: `${project.progress}%` }"></i></div><span>{{ project.progress }}%</span></div></td><td><span class="status-pill" :class="project.status.toLowerCase().replace(' ', '-')"><i></i>{{ project.status }}</span></td><td class="due-date">{{ project.due }}</td><td><button class="subtle-icon row-menu" :aria-label="`${project.name} options`"><MoreHorizontal :size="18" /></button></td></tr></tbody>
    </table>
  </div>
  <div class="bottom-grid"><article class="activity-panel"><div class="panel-title"><div><h2>Recent activity</h2><p>Updates from your team</p></div><button class="subtle-icon" aria-label="Activity options"><MoreHorizontal :size="18" /></button></div><div class="activity-item"><span class="activity-avatar lavender">JL</span><p><strong>Jordan Lee</strong> completed <b>Homepage wireframes</b><small>12 minutes ago</small></p></div><div class="activity-item"><span class="activity-avatar peach">SK</span><p><strong>Sam Kim</strong> joined <b>Mobile app launch</b><small>1 hour ago</small></p></div><div class="activity-item"><span class="activity-avatar mint">AR</span><p><strong>Alex Rivera</strong> shared a new file in <b>Customer portal</b><small>3 hours ago</small></p></div></article><article class="insight-panel"><span class="insight-icon"><Zap :size="18" /></span><p class="eyebrow">TEAM INSIGHT</p><h2>Strong momentum this week</h2><p>Your team completed <strong>18% more tasks</strong> than last week. Keep the pace going.</p><button class="insight-link">View team report <ChevronRight :size="15" /></button><ArrowDownRight class="insight-arrow" :size="72" stroke-width="1" /></article></div>
</template>
