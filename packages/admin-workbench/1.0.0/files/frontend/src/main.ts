import { createApp } from 'vue'
import { createRouter, createWebHistory } from 'vue-router'
import App from './App.vue'
import './style.css'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', component: () => import('./views/OverviewView.vue'), meta: { title: 'Overview' } },
    { path: '/projects', component: () => import('./views/ProjectsView.vue'), meta: { title: 'Projects' } },
    { path: '/reports', component: () => import('./views/ReportsView.vue'), meta: { title: 'Reports' } },
    { path: '/settings', component: () => import('./views/SettingsView.vue'), meta: { title: 'Settings' } },
  ],
})

createApp(App).use(router).mount('#app')
