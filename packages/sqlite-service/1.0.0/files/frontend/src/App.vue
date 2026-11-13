<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { checkHealth, createItem, updateItem, deleteItem, listItems, type Item } from './api'

const items = ref<Item[]>([])
const id = ref('')
const value = ref('')
const loading = ref(true)
const saving = ref(false)
const error = ref('')
const health = ref('checking')

async function refresh() {
  error.value = ''
  try { items.value = await listItems() }
  catch (cause) { error.value = cause instanceof Error ? cause.message : 'Could not load records' }
  finally { loading.value = false }
}

async function addItem() {
  if (!id.value.trim() || !value.value.trim()) return
  saving.value = true
  error.value = ''
  try {
    await createItem({ id: id.value.trim(), value: value.value.trim() })
    id.value = ''
    value.value = ''
    await refresh()
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : 'Could not create record'
  } finally { saving.value = false }
}

const editing = ref<string | null>(null)
const editedValue = ref('')

async function saveItem(itemId: string) {
  saving.value = true
  error.value = ''
  try {
    await updateItem(itemId, editedValue.value)
    editing.value = null
    await refresh()
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : 'Could not update record'
  } finally { saving.value = false }
}

async function removeItem(itemId: string) {
  error.value = ''
  try { await deleteItem(itemId); await refresh() }
  catch (cause) { error.value = cause instanceof Error ? cause.message : 'Could not delete record' }
}

onMounted(async () => {
  try { health.value = (await checkHealth()).status }
  catch { health.value = 'unavailable' }
  await refresh()
})
</script>

<template>
  <div class="shell">
    <aside class="sidebar">
      <a class="brand" href="#"><span class="brand-mark">D</span><span>{{project.name}}</span></a>
      <p class="nav-label">WORKSPACE</p>
      <a class="nav-link active" href="#"><span aria-hidden="true">▦</span> Records</a>
      <div class="side-foot"><span class="signal" :class="{ offline: health !== 'ok' }"></span><span>Service {{ health }}</span><code>SQLite</code></div>
    </aside>
    <main class="main">
      <header class="topbar"><span>Workspace <span class="divider">/</span> Records</span><span class="runtime">libuvcpp <i></i></span></header>
      <div class="content">
        <section class="heading"><div><p class="eyebrow">DATABASE</p><h1>Records</h1><p class="subtitle">Items stored in the local SQLite database.</p></div><button class="refresh" type="button" title="Refresh records" aria-label="Refresh records" @click="refresh">↻</button></section>
        <section class="summary"><div><span class="summary-label">Total records</span><strong>{{ items.length }}</strong></div><span class="summary-note"><i></i> Persistent storage</span></section>
        <section class="panel form-panel">
          <div class="panel-heading"><div><p class="eyebrow">NEW RECORD</p><h2>Add an item</h2></div><span class="method">POST</span></div>
          <form class="create-form" @submit.prevent="addItem">
            <label>Identifier<input v-model="id" name="id" required maxlength="255" placeholder="e.g. project-01" /></label>
            <label>Value<input v-model="value" name="value" required placeholder="A value to store" /></label>
            <button class="primary" type="submit" :disabled="saving || !id.trim() || !value.trim()">{{ saving ? 'Saving…' : 'Add record' }}</button>
          </form>
        </section>
        <section class="panel records-panel">
          <div class="panel-heading"><div><p class="eyebrow">SQLITE TABLE · ITEMS</p><h2>Stored records</h2></div><span class="count">{{ items.length }} total</span></div>
          <p v-if="error" class="notice" role="alert">{{ error }}</p>
          <div v-if="loading" class="empty">Loading records…</div>
          <div v-else-if="!items.length" class="empty"><span class="empty-mark">∅</span><strong>No records yet</strong><span>Create a record above to see it here.</span></div>
          <div v-else class="table-wrap"><table><thead><tr><th>Identifier</th><th>Value</th><th>Created</th><th><span class="sr-only">Actions</span></th></tr></thead><tbody><tr v-for="item in items" :key="item.id"><td><code>{{ item.id }}</code></td><td class="value-cell"><input v-if="editing === item.id" v-model="editedValue" :aria-label="`Value for ${item.id}`" /><span v-else>{{ item.value }}</span></td><td class="time-cell">{{ item.created_at }}</td><td class="action-cell"><template v-if="editing === item.id"><button type="button" :disabled="saving || !editedValue" @click="saveItem(item.id)">Save</button><button type="button" :disabled="saving" @click="editing = null">Cancel</button></template><button v-else type="button" @click="editing = item.id; editedValue = item.value">Edit</button><button type="button" class="delete" :disabled="saving" :aria-label="`Delete ${item.id}`" title="Delete record" @click="removeItem(item.id)">×</button></td></tr></tbody></table></div>
        </section>
        <footer><span>REST API</span><code>GET · POST · PUT · DELETE /api/items</code><span class="footer-health"><i :class="{ offline: health !== 'ok' }"></i>{{ health === 'ok' ? 'Operational' : health }}</span></footer>
      </div>
    </main>
  </div>
</template>
