export interface ApiFailure extends Error {
  status: number
}

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: { Accept: 'application/json', ...init.headers },
  })
  const text = await response.text()
  let data: unknown = null
  if (text) {
    try { data = JSON.parse(text) } catch { data = text }
  }
  if (!response.ok) {
    const error = new Error(typeof data === 'string' ? data : `Request failed (${response.status})`) as ApiFailure
    error.status = response.status
    throw error
  }
  return data as T
}
