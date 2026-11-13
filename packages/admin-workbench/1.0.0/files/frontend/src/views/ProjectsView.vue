<script setup lang="ts">
import { computed, ref } from 'vue'
import { MoreHorizontal, Plus, Search, SlidersHorizontal } from 'lucide-vue-next'

const query = ref('')
const selected = ref('All projects')
const projects = [
  { name: 'Website redesign', group: 'Design team', initials: 'WD', color: 'violet', progress: 72, status: 'On track', due: 'Nov 22' },
  { name: 'Mobile app launch', group: 'Product team', initials: 'MA', color: 'blue', progress: 48, status: 'In progress', due: 'Dec 04' },
  { name: 'Q4 marketing campaign', group: 'Growth team', initials: 'MC', color: 'coral', progress: 91, status: 'On track', due: 'Nov 18' },
  { name: 'Customer portal', group: 'Engineering', initials: 'CP', color: 'green', progress: 26, status: 'At risk', due: 'Dec 12' },
  { name: 'Design system v2', group: 'Design team', initials: 'DS', color: 'amber', progress: 64, status: 'In progress', due: 'Dec 16' },
  { name: 'Analytics dashboard', group: 'Engineering', initials: 'AD', color: 'teal', progress: 100, status: 'Complete', due: 'Nov 12' },
]
const filtered = computed(() => projects.filter((project) => project.name.toLowerCase().includes(query.value.toLowerCase()) && (selected.value === 'All projects' || project.status === selected.value)))
</script>

<template>
  <div class="page-heading-row"><div><p class="eyebrow">WORKSPACE</p><h1>Projects</h1><p class="page-subtitle">Manage and track your team's work.</p></div><button class="primary-button"><Plus :size="16" /> New project</button></div>
  <div class="list-toolbar"><label class="table-search"><Search :size="16" /><input v-model="query" aria-label="Search projects" placeholder="Search projects" /></label><label class="filter-select"><SlidersHorizontal :size="15" /><select v-model="selected" aria-label="Filter projects"><option>All projects</option><option>On track</option><option>In progress</option><option>At risk</option><option>Complete</option></select></label></div>
  <div class="table-wrap"><table><thead><tr><th>PROJECT</th><th>PROGRESS</th><th>STATUS</th><th>DUE DATE</th><th></th></tr></thead><tbody><tr v-for="project in filtered" :key="project.name"><td><div class="project-name"><span class="project-icon" :class="project.color">{{ project.initials }}</span><span><strong>{{ project.name }}</strong><small>{{ project.group }}</small></span></div></td><td><div class="progress-cell"><div class="progress-track"><i :style="{ width: `${project.progress}%` }"></i></div><span>{{ project.progress }}%</span></div></td><td><span class="status-pill" :class="project.status.toLowerCase().replace(' ', '-')"><i></i>{{ project.status }}</span></td><td class="due-date">{{ project.due }}</td><td><button class="subtle-icon row-menu" :aria-label="`${project.name} options`"><MoreHorizontal :size="18" /></button></td></tr></tbody></table><p v-if="filtered.length === 0" class="empty-state">No projects match this search.</p></div>
</template>
