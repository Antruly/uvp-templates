const byId = id => document.getElementById(id)
byId('request').onsubmit = async event => {
  event.preventDefault()
  byId('send').disabled = true
  byId('error').textContent = ''
  byId('status').textContent = 'Sending…'
  byId('response').textContent = ''
  try {
    const started = performance.now()
    const response = await fetch('/api/inspect', {
      method: 'POST',
      headers: { 'Content-Type': byId('content-type').value },
      body: byId('body').value,
      signal: AbortSignal.timeout(10000),
    })
    const body = await response.json()
    byId('status').textContent = `HTTP ${response.status} · ${Math.round(performance.now() - started)} ms · ${body.body_bytes ?? 'unknown'} request bytes`
    byId('response').textContent = JSON.stringify(body, null, 2)
    if (!response.ok) byId('error').textContent = `The server returned HTTP ${response.status}.`
  } catch (error) {
    byId('status').textContent = 'Request failed'
    byId('error').textContent = error instanceof Error ? error.message : String(error)
  } finally { byId('send').disabled = false }
}
