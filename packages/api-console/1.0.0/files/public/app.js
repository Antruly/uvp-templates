(() => {
  'use strict';

  const $ = (id) => document.getElementById(id);

  const el = {
    method: $('method'),
    url: $('url'),
    send: $('send-btn'),
    save: $('save-btn'),
    addHeader: $('add-header'),
    headerEditor: $('headers-editor'),
    headerCount: $('header-count'),
    contentType: $('content-type'),
    body: $('body'),
    verifyTls: $('verify-tls'),
    timeout: $('timeout'),
    collections: $('collections'),
    collectionsEmpty: $('collections-empty'),
    history: $('history'),
    historyEmpty: $('history-empty'),
    clearHistory: $('clear-history'),
    statusPill: $('status-pill'),
    responseTime: $('response-time'),
    responseSize: $('response-size'),
    respBody: $('resp-body'),
    respHeaders: $('resp-headers'),
    previewFrame: $('preview-frame'),
    previewEmpty: $('preview-empty'),
    previewScripts: $('preview-scripts'),
  };

  let lastResponse = null;

  // ---------------------------------------------------------------- headers

  function addHeaderRow(name = '', value = '') {
    const row = document.createElement('div');
    row.className = 'header-row';

    const nameInput = document.createElement('input');
    nameInput.className = 'h-name';
    nameInput.placeholder = '名称';
    nameInput.spellcheck = false;
    nameInput.value = name;
    nameInput.addEventListener('input', updateHeaderCount);

    const valueInput = document.createElement('input');
    valueInput.className = 'h-value';
    valueInput.placeholder = '值';
    valueInput.spellcheck = false;
    valueInput.value = value;

    const remove = document.createElement('button');
    remove.className = 'remove';
    remove.type = 'button';
    remove.title = '删除';
    remove.textContent = '×';
    remove.addEventListener('click', () => {
      row.remove();
      if (!el.headerEditor.querySelector('.header-row')) addHeaderRow();
      updateHeaderCount();
    });

    row.append(nameInput, valueInput, remove);
    el.headerEditor.append(row);
    updateHeaderCount();
    return row;
  }

  function setHeaderRows(headers) {
    el.headerEditor.innerHTML = '';
    if (!headers || headers.length === 0) {
      addHeaderRow();
      return;
    }
    headers.forEach((h) => addHeaderRow(h.name || '', h.value || ''));
    if (!el.headerEditor.querySelector('.header-row')) addHeaderRow();
  }

  function readHeaderRows() {
    return Array.from(el.headerEditor.querySelectorAll('.header-row'))
      .map((row) => ({
        name: row.querySelector('.h-name').value.trim(),
        value: row.querySelector('.h-value').value,
      }))
      .filter((h) => h.name.length > 0);
  }

  function updateHeaderCount() {
    el.headerCount.textContent = String(readHeaderRows().length);
  }

  // ------------------------------------------------------------ request I/O

  function readRequest() {
    const headers = readHeaderRows().filter(
      (h) => h.name.toLowerCase() !== 'content-type'
    );
    const ct = el.contentType.value;
    if (ct) headers.push({ name: 'Content-Type', value: ct });

    return {
      method: el.method.value,
      url: el.url.value.trim(),
      headers,
      body: el.body.value,
      verify_tls: el.verifyTls.checked,
      timeout_ms: Number(el.timeout.value) || 15000,
    };
  }

  function applyRequest(req) {
    if (!req) return;
    el.method.value = req.method || 'GET';
    el.url.value = req.url || '';
    el.body.value = req.body || '';

    const headers = (req.headers || []).slice();
    const ctIndex = headers.findIndex(
      (h) => String(h.name).toLowerCase() === 'content-type'
    );
    if (ctIndex >= 0) {
      const ct = headers.splice(ctIndex, 1)[0].value;
      const known = Array.from(el.contentType.options).some(
        (o) => o.value === ct
      );
      el.contentType.value = known ? ct : '';
    } else {
      el.contentType.value = '';
    }

    setHeaderRows(headers);
    el.verifyTls.checked = req.verify_tls !== false;
    el.timeout.value = req.timeout_ms || 15000;
  }

  // ------------------------------------------------------------------- send

  function setBusy(busy) {
    el.send.disabled = busy;
    el.send.textContent = busy ? '发送中…' : '发送';
  }

  function setStatus(text, cls) {
    el.statusPill.textContent = text;
    el.statusPill.className = 'pill' + (cls ? ' ' + cls : '');
  }

  function statusClass(code) {
    if (code >= 200 && code < 300) return 'ok';
    if (code >= 300 && code < 400) return 'info';
    if (code >= 400 && code < 500) return 'warn';
    if (code >= 500) return 'error';
    return '';
  }

  function formatBytes(n) {
    const bytes = Number(n) || 0;
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
  }

  function renderBodyText(text) {
    el.respBody.textContent = text;
  }

  function prettyBody(body, headers) {
    if (!body) return '(空响应体)';
    const ct = (headers || []).find(
      (h) => String(h.name).toLowerCase() === 'content-type'
    );
    const looksJson =
      (ct && /json/i.test(ct.value || '')) ||
      /^\s*[[{]/.test(body);
    if (looksJson) {
      try {
        return JSON.stringify(JSON.parse(body), null, 2);
      } catch (_) {
        // Not actually JSON — show it as received.
      }
    }
    return body;
  }

  function renderHeaders(headers) {
    el.respHeaders.innerHTML = '';
    if (!headers || headers.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'muted';
      empty.textContent = '没有响应头';
      el.respHeaders.append(empty);
      return;
    }
    headers.forEach((h) => {
      const row = document.createElement('div');
      row.className = 'resp-header-row';
      const k = document.createElement('span');
      k.className = 'k';
      k.textContent = h.name;
      const v = document.createElement('span');
      v.className = 'v';
      v.textContent = h.value;
      row.append(k, v);
      el.respHeaders.append(row);
    });
  }

  // --------------------------------------------------------------- preview

  function responseContentType(data) {
    const headers = (data && data.headers) || [];
    const ct = headers.find(
      (h) => String(h.name).toLowerCase() === 'content-type'
    );
    return ct ? String(ct.value || '') : '';
  }

  function isHtmlResponse(data) {
    if (!data || !data.ok) return false;
    if (/text\/html|application\/xhtml\+xml/i.test(responseContentType(data))) {
      return true;
    }
    const body = String(data.body || '').trimStart().toLowerCase();
    return body.startsWith('<!doctype html') || body.startsWith('<html');
  }

  // Resolve relative URLs in the preview against the URL that produced the
  // response. The iframe is sandboxed, so this only affects where subresources
  // are fetched from.
  function injectBase(html, baseUrl) {
    const safe = String(baseUrl)
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/</g, '&lt;');
    const tag = '<base href="' + safe + '">';
    if (/<head(\s[^>]*)?>/i.test(html)) {
      return html.replace(/<head(\s[^>]*)?>/i, (match) => match + tag);
    }
    if (/<html(\s[^>]*)?>/i.test(html)) {
      return html.replace(
        /<html(\s[^>]*)?>/i,
        (match) => match + '<head>' + tag + '</head>'
      );
    }
    return '<!doctype html><html><head>' + tag + '</head><body>' +
           html + '</body></html>';
  }

  function resetPreview() {
    el.previewFrame.classList.remove('visible');
    el.previewFrame.removeAttribute('srcdoc');
    el.previewEmpty.style.display = '';
    if (!lastResponse) {
      el.previewEmpty.textContent = '发送请求后，可在响应为 HTML 时预览。';
    } else if (!isHtmlResponse(lastResponse)) {
      el.previewEmpty.textContent = '当前响应不是 HTML，无法预览。';
    } else {
      el.previewEmpty.textContent = '切换到预览。';
    }
  }

  function renderPreview() {
    if (!isHtmlResponse(lastResponse)) {
      resetPreview();
      return;
    }
    const base =
      (lastResponse.request && lastResponse.request.url) || '';
    el.previewFrame.setAttribute(
      'sandbox',
      el.previewScripts.checked
        ? 'allow-scripts allow-forms allow-popups'
        : 'allow-forms allow-popups'
    );
    el.previewFrame.srcdoc = injectBase(String(lastResponse.body || ''), base);
    el.previewEmpty.style.display = 'none';
    el.previewFrame.classList.add('visible');
  }

  function renderResponse(data) {
    lastResponse = data;
    resetPreview();
    el.responseTime.textContent = data.elapsed_ms + ' ms';
    el.responseSize.textContent = formatBytes(data.bytes);

    if (!data.ok) {
      setStatus('ERR', 'error');
      renderBodyText(
        '请求失败\n\n' + (data.error || 'unknown error') +
        '\n\nURL: ' + (data.request ? data.request.url : '')
      );
      renderHeaders([]);
      return;
    }

    setStatus(String(data.status) + ' ' + (data.status_text || ''),
      statusClass(data.status));
    renderBodyText(prettyBody(data.body, data.headers));
    renderHeaders(data.headers);
  }

  async function send() {
    const request = readRequest();
    if (!request.url) {
      el.url.focus();
      setStatus('—', '');
      renderBodyText('请先填写请求 URL。');
      return;
    }

    setBusy(true);
    setStatus('…', 'info');
    el.responseTime.textContent = '';
    el.responseSize.textContent = '';
    renderBodyText('请求发送中…');
    lastResponse = null;
    resetPreview();

    try {
      const res = await fetch('/api/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
      });
      const data = await res.json();
      renderResponse(data);
    } catch (err) {
      setStatus('ERR', 'error');
      renderBodyText(
        '无法连接本地服务。\n\n' + String(err && err.message)
      );
      renderHeaders([]);
    } finally {
      setBusy(false);
      loadHistory();
    }
  }

  // ------------------------------------------------------------ collections

  function methodClass(method) {
    switch (String(method || '').toUpperCase()) {
      case 'GET': return 'm-http';
      case 'POST': return 'm-post';
      case 'PUT': return 'm-put';
      case 'PATCH': return 'm-patch';
      case 'DELETE': return 'm-delete';
      default: return 'm-other';
    }
  }

  function shortUrl(url) {
    try {
      const u = new URL(url);
      return u.host + (u.pathname === '/' ? '' : u.pathname);
    } catch (_) {
      return url || '(no url)';
    }
  }

  function renderCollections(items) {
    el.collections.innerHTML = '';
    el.collectionsEmpty.style.display = items.length ? 'none' : '';
    items.forEach((item) => {
      const li = document.createElement('li');
      li.className = 'side-item';
      li.title = item.request ? item.request.url : '';

      const method = document.createElement('span');
      method.className = 'method ' + methodClass(item.request && item.request.method);
      method.textContent = (item.request && item.request.method) || 'GET';

      const label = document.createElement('span');
      label.className = 'label';
      label.textContent = item.name;

      const remove = document.createElement('button');
      remove.className = 'remove';
      remove.type = 'button';
      remove.title = '删除';
      remove.textContent = '×';
      remove.addEventListener('click', async (event) => {
        event.stopPropagation();
        await fetch('/api/collections/' + encodeURIComponent(item.id), {
          method: 'DELETE',
        });
        loadCollections();
      });

      li.append(method, label, remove);
      li.addEventListener('click', () => applyRequest(item.request));
      el.collections.append(li);
    });
  }

  async function loadCollections() {
    try {
      const res = await fetch('/api/collections');
      const data = await res.json();
      renderCollections(data.items || []);
    } catch (err) {
      renderCollections([]);
    }
  }

  async function saveRequest() {
    const request = readRequest();
    if (!request.url) {
      el.url.focus();
      return;
    }
    const suggested = (() => {
      try {
        const u = new URL(request.url);
        return u.pathname === '/' ? u.host : u.pathname;
      } catch (_) {
        return request.url;
      }
    })();
    const name = window.prompt('保存为集合名称', suggested);
    if (!name) return;

    try {
      const res = await fetch('/api/collections', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), request }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        window.alert('保存失败：' + (data.error || res.status));
        return;
      }
      await loadCollections();
    } catch (err) {
      window.alert('保存失败：' + String(err && err.message));
    }
  }

  // ---------------------------------------------------------------- history

  function renderHistory(items) {
    el.history.innerHTML = '';
    el.historyEmpty.style.display = items.length ? 'none' : '';
    items.forEach((item) => {
      const req = item.request || {};
      const li = document.createElement('li');
      li.className = 'side-item';
      li.title = req.url || '';

      const method = document.createElement('span');
      method.className = 'method ' + methodClass(req.method);
      method.textContent = req.method || 'GET';

      const label = document.createElement('span');
      label.className = 'label';
      label.textContent = shortUrl(req.url);

      const sub = document.createElement('span');
      sub.className = 'sub';
      sub.textContent = item.ok ? String(item.status) : 'ERR';
      if (!item.ok) sub.style.color = 'var(--red)';

      li.append(method, label, sub);
      li.addEventListener('click', () => applyRequest(req));
      el.history.append(li);
    });
  }

  async function loadHistory() {
    try {
      const res = await fetch('/api/history');
      const data = await res.json();
      renderHistory(data.items || []);
    } catch (err) {
      renderHistory([]);
    }
  }

  async function clearHistory() {
    try {
      await fetch('/api/history', { method: 'DELETE' });
      await loadHistory();
    } catch (_) {
      // Nothing to do — the list stays as it was.
    }
  }

  // ------------------------------------------------------------------- tabs

  document.querySelectorAll('.tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach((t) => t.classList.remove('active'));
      document.querySelectorAll('.panel').forEach((p) => p.classList.remove('active'));
      tab.classList.add('active');
      $('tab-' + tab.dataset.tab).classList.add('active');
    });
  });

  document.querySelectorAll('.resp-tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.resp-tab').forEach((t) => t.classList.remove('active'));
      document.querySelectorAll('.resp-panel').forEach((p) => p.classList.remove('active'));
      tab.classList.add('active');
      $('resp-' + tab.dataset.resp + '-panel').classList.add('active');
      if (tab.dataset.resp === 'preview') renderPreview();
    });
  });

  el.previewScripts.addEventListener('change', () => {
    if (document.querySelector('.resp-tab[data-resp="preview"]').classList.contains('active')) {
      renderPreview();
    }
  });

  // ---------------------------------------------------------------- wiring

  el.send.addEventListener('click', send);
  el.save.addEventListener('click', saveRequest);
  el.addHeader.addEventListener('click', () => addHeaderRow());
  el.clearHistory.addEventListener('click', clearHistory);
  el.url.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') send();
  });
  document.addEventListener('keydown', (event) => {
    if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
      event.preventDefault();
      send();
    }
  });

  // --------------------------------------------------------------- startup

  addHeaderRow();
  resetPreview();
  loadCollections();
  loadHistory();
})();
