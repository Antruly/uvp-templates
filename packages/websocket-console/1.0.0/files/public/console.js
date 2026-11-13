const byId = (id) => document.getElementById(id)
const endpoint = new URL('/ws', location.href)
endpoint.protocol = location.protocol === 'https:' ? 'wss:' : 'ws:'
byId('endpoint').textContent = endpoint.href
const maxEntries = 100
const maxCharacters = 4096
let socket = null
let dropped = 0
let truncated = 0
let sent = 0
let received = 0
const encoder = new TextEncoder()
function counts() {
  byId('counts').textContent = `${sent} sent · ${received} received · ${dropped} entries dropped · ${truncated} entries truncated`
}
function append(direction, kind, text, bytes) {
  const entry = document.createElement('article')
  const meta = document.createElement('small')
  meta.textContent = `${direction} · ${kind} · ${bytes} bytes · ${new Date().toLocaleTimeString()}`
  const body = document.createElement('pre')
  body.textContent = text.slice(0, maxCharacters)
  if (text.length > maxCharacters) { body.textContent += '\n[truncated]'; truncated++ }
  entry.append(meta, body)
  const log = byId('log')
  log.append(entry)
  while (log.children.length > maxEntries) { log.firstChild.remove(); dropped++ }
  counts()
}
function state(label) {
  byId('state').textContent = label
  byId('connect').disabled = socket !== null
  byId('disconnect').disabled = socket === null || socket.readyState >= WebSocket.CLOSING
  byId('send').disabled = socket?.readyState !== WebSocket.OPEN
}
function hex(bytes) { return Array.from(bytes.subarray(0, 1365), b => b.toString(16).padStart(2, '0')).join(' ') + (bytes.length > 1365 ? ' …' : '') }
byId('connect').onclick = () => {
  if (socket) return
  byId('error').textContent = ''
  const current = new WebSocket(endpoint)
  socket = current
  current.binaryType = 'arraybuffer'
  state('Connecting')
  current.onopen = () => state('Connected')
  current.onmessage = ({ data }) => {
    received++
    if (typeof data === 'string') append('IN', 'text', data, encoder.encode(data).length)
    else {
      const bytes = new Uint8Array(data)
      // Count binary truncation explicitly; only a bounded hex preview is formatted.
      if (bytes.length > 1365) truncated++
      append('IN', 'binary', hex(bytes), bytes.length)
    }
  }
  current.onerror = () => { byId('error').textContent = 'WebSocket connection failed. Check that the service is running.' }
  current.onclose = (event) => {
    if (socket !== current) return
    socket = null
    state('Disconnected')
    append('SYSTEM', 'close', `Code ${event.code}${event.reason ? ': ' + event.reason : ''}`, 0)
  }
}
byId('disconnect').onclick = () => { if (socket) { socket.close(1000, 'Console disconnect'); state('Disconnecting') } }
byId('compose').onsubmit = (event) => {
  event.preventDefault()
  byId('error').textContent = ''
  if (socket?.readyState !== WebSocket.OPEN) return
  const text = byId('message').value
  try {
    if (byId('mode').value === 'hex') {
      const normalized = text.replace(/\s/g, '')
      if (!/^(?:[0-9a-fA-F]{2})*$/.test(normalized)) throw new Error('Enter complete hexadecimal byte pairs, optionally separated by whitespace.')
      const bytes = Uint8Array.from(normalized.match(/../g) ?? [], pair => parseInt(pair, 16))
      socket.send(bytes)
      if (bytes.length > 1365) truncated++
      append('OUT', 'binary', hex(bytes), bytes.length)
    } else {
      socket.send(text)
      append('OUT', 'text', text, encoder.encode(text).length)
    }
    sent++
    counts()
  } catch (error) { byId('error').textContent = error.message }
}
byId('clear').onclick = () => { byId('log').replaceChildren(); dropped = truncated = sent = received = 0; counts() }
addEventListener('pagehide', () => socket?.close(1000, 'Page closed'))
counts()
