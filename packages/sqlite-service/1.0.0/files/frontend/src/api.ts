export interface Item { id: string; value: string; created_at: string }
interface DbTable { rows: Item[] }

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: { Accept: 'application/json', ...init?.headers },
  })
  const body = await response.text()
  if (!response.ok) {
    let message = `Request failed (${response.status})`
    try { message = JSON.parse(body).error ?? message } catch { if (body) message = body }
    throw new Error(message)
  }
  return body ? JSON.parse(body) as T : undefined as T
}

export const listItems = async () => (await request<DbTable>('/api/items')).rows
export const createItem = (item: Pick<Item, 'id' | 'value'>) =>
  request<{ stored: number }>('/api/items', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(item),
  })
export const updateItem = (id: string, value: string) =>
  request<{ updated: boolean }>(`/api/items/${encodeURIComponent(id)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ value }),
  })
export const deleteItem = (id: string) =>
  request<{ deleted: boolean }>(`/api/items/${encodeURIComponent(id)}`, { method: 'DELETE' })
export const checkHealth = () => request<{ status: string }>('/healthz')
