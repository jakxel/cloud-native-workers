const API = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
    ? 'http://localhost:8000'
    : `http://${window.location.hostname}:8000`;

  const STORAGE_KEY = 'csv_task_ids';

  // ── Storage helpers ──────────────────────────────────────────────────────
  function saveTaskId(id, filename) {
    const all = getStoredTasks();
    all.unshift({ id, filename, ts: Date.now() });
    localStorage.setItem(STORAGE_KEY, JSON.stringify(all.slice(0, 50)));
  }

  function getStoredTasks() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); } catch { return []; }
  }

  // ── Drag & Drop ──────────────────────────────────────────────────────────
  const dropZone = document.getElementById('drop-zone');
  const fileInput = document.getElementById('file-input');

  dropZone.addEventListener('dragover', e => { e.preventDefault(); dropZone.classList.add('drag-over'); });
  dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));
  dropZone.addEventListener('drop', e => {
    e.preventDefault();
    dropZone.classList.remove('drag-over');
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  });
  dropZone.addEventListener('click', e => {
    if (e.target.closest('button')) return;
    fileInput.click();
  });
  document.getElementById('browse-btn').addEventListener('click', e => { e.stopPropagation(); fileInput.click(); });
  fileInput.addEventListener('change', () => { if (fileInput.files[0]) handleFile(fileInput.files[0]); });

  document.getElementById('clear-btn').addEventListener('click', () => {
    localStorage.removeItem(STORAGE_KEY);
    document.getElementById('tasks-container').innerHTML = '';
    updateTaskCount(0);
  });

  // ── Upload ───────────────────────────────────────────────────────────────
  async function handleFile(file) {
    if (!file.name.endsWith('.csv')) return alert('Please select a CSV file.');

    const card = createTaskCard(null, file.name);
    document.getElementById('tasks-container').prepend(card.el);

    const fd = new FormData();
    fd.append('file', file);

    let taskId;
    try {
      const res = await fetch(`${API}/upload`, { method: 'POST', body: fd });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      taskId = data.task_id;
      card.setId(taskId);
      saveTaskId(taskId, file.name);
      updateTaskCount();
    } catch (err) {
      card.setError('Upload failed: ' + err.message);
      return;
    }

    streamTask(taskId, card);
  }

  // ── SSE Stream ───────────────────────────────────────────────────────────
  function streamTask(taskId, card) {
    const es = new EventSource(`${API}/stream/${taskId}`);

    es.onmessage = e => {
      const data = JSON.parse(e.data);
      card.update(data);
      updateWorkerDashboard(data);

      if (data.status === 'completed' || data.status === 'error') {
        es.close();
        updateWorkerIdle(data.worker_id);
      }
    };

    es.onerror = () => {
      es.close();
      // SSE falló o cerró — polling como fallback
      pollStatus(taskId, card);
    };
  }

  async function pollStatus(taskId, card) {
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`${API}/status/${taskId}`);
        const data = await res.json();
        card.update(data);
        updateWorkerDashboard(data);

        if (data.status === 'completed' || data.status === 'error') {
          clearInterval(interval);
          updateWorkerIdle(data.worker_id);
        }
      } catch {
        clearInterval(interval);
      }
    }, 1000);
  }
  // ── Worker dashboard ─────────────────────────────────────────────────────
  function updateWorkerDashboard(data) {
    if (!data.worker_id) return;
    const dot = document.getElementById(`dot-${data.worker_id}`);
    const label = document.getElementById(`status-${data.worker_id}`);
    if (!dot || !label) return;
    if (data.status === 'processing') {
      dot.classList.add('active');
      label.textContent = `processing ${data.filename || ''}`;
    }
  }

  function updateWorkerIdle(workerId) {
    if (!workerId) return;
    const dot = document.getElementById(`dot-${workerId}`);
    const label = document.getElementById(`status-${workerId}`);
    if (dot) dot.classList.remove('active');
    if (label) label.textContent = 'idle';
  }

  // ── Task card factory ────────────────────────────────────────────────────
  function createTaskCard(taskId, filename) {
    const el = document.createElement('div');
    el.className = 'task-card';

    el.innerHTML = `
      <div class="task-header">
        <div>
          <div class="task-filename">${escHtml(filename)}</div>
          <div class="task-meta" id="meta-">Uploading…</div>
        </div>
        <span class="badge badge-pending" id="badge-">pending</span>
      </div>
      <div class="progress-bar"><div class="progress-fill" id="bar-"></div></div>
      <div id="body-"></div>
    `;

    const badge = el.querySelector('.badge');
    const bar = el.querySelector('.progress-fill');
    const meta = el.querySelector('.task-meta');
    const body = el.querySelector('div[id^="body-"]');

    let _id = taskId || '_tmp_' + Date.now();
    function applyId(id) {
      const idMap = [
        { base: 'meta', selector: '#meta-' },
        { base: 'badge', selector: '#badge-' },
        { base: 'bar', selector: '#bar-' },
        { base: 'body', selector: '#body-' },
      ];
      idMap.forEach(({ base, selector }) => {
        const node = el.querySelector(selector);
        if (node) node.id = `${base}-${id}`;
      });
      _id = id;
    }
    if (taskId) applyId(taskId);

    function setId(id) { applyId(id); }

    function update(data) {
      const { status, worker_id, result, error } = data;
      if (!badge || !bar || !meta || !body) return;

      badge.className = `badge badge-${status}`;

      if (status === 'pending') {
        badge.innerHTML = 'pending';
        bar.className = 'progress-fill';
        bar.style.width = '15%';
        meta.textContent = 'In queue…';
      } else if (status === 'processing') {
        badge.innerHTML = `<span class="spinner"></span> processing`;
        bar.className = 'progress-fill processing';
        meta.textContent = `Processing on ${worker_id}…`;
      } else if (status === 'completed') {
        badge.innerHTML = '✓ completed';
        bar.className = 'progress-fill done';
        meta.textContent = `Done · ${worker_id}`;
        renderResult(body, result, _id);
      } else if (status === 'error') {
        badge.innerHTML = '✗ error';
        bar.className = 'progress-fill err';
        meta.textContent = `Error on ${worker_id || 'unknown'}`;
        body.innerHTML = `<div class="error-list"><p>${escHtml(error || 'Unknown error')}</p></div>`;
      }
    }

    function setError(msg) {
      update({ status: 'error', error: msg, worker_id: '' });
    }

    return { el, setId, update, setError };
  }

  // ── Result renderer + Canvas chart ──────────────────────────────────────
  function renderResult(container, result, taskId) {
    if (!result) return;

    const cols = result.columns || {};
    const colNames = Object.keys(cols);

    container.innerHTML = `
      <div class="results">
        <div class="results-summary">
          <div class="stat-box"><div class="stat-label">Total rows</div><div class="stat-value">${result.total_rows}</div></div>
          <div class="stat-box"><div class="stat-label">Valid</div><div class="stat-value" style="color:var(--success)">${result.valid_rows}</div></div>
          <div class="stat-box"><div class="stat-label">Invalid</div><div class="stat-value" style="color:var(--error)">${result.invalid_rows}</div></div>
        </div>
        ${colNames.length ? `
          <table class="col-table">
            <thead><tr><th>Column</th><th>Count</th><th>Total</th><th>Average</th><th>Min</th><th>Max</th></tr></thead>
            <tbody>
              ${colNames.map(c => `
                <tr>
                  <td><strong>${escHtml(c)}</strong></td>
                  <td>${cols[c].count}</td>
                  <td>${cols[c].total}</td>
                  <td>${cols[c].average}</td>
                  <td>${cols[c].min}</td>
                  <td>${cols[c].max}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
          <canvas id="chart-${taskId}" height="180"></canvas>
        ` : '<p style="font-size:0.85rem;color:var(--muted)">No numeric columns found.</p>'}
        ${result.errors && result.errors.length ? `
          <div class="error-list" style="margin-top:0.8rem">
            ${result.errors.map(e => `<p>⚠ ${escHtml(e)}</p>`).join('')}
          </div>
        ` : ''}
      </div>
    `;

    if (colNames.length) drawChart(`chart-${taskId}`, colNames, cols);
  }

  function drawChart(canvasId, labels, cols) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    const W = canvas.offsetWidth || 600;
    const H = 180;
    canvas.width  = W * dpr;
    canvas.height = H * dpr;
    ctx.scale(dpr, dpr);

    const averages = labels.map(l => cols[l].average);
    const maxVal = Math.max(...averages, 1);
    const barW = Math.min(60, (W - 80) / labels.length - 12);
    const gap = (W - 60) / labels.length;
    const baseY = H - 36;
    const maxH = baseY - 20;

    ctx.clearRect(0, 0, W, H);

    // Axes
    ctx.strokeStyle = '#e5e7eb';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(48, 10); ctx.lineTo(48, baseY); ctx.lineTo(W - 10, baseY); ctx.stroke();

    labels.forEach((lbl, i) => {
      const x = 56 + i * gap;
      const h = (averages[i] / maxVal) * maxH;
      const y = baseY - h;

      // Bar gradient
      const grad = ctx.createLinearGradient(0, y, 0, baseY);
      grad.addColorStop(0, '#4f46e5');
      grad.addColorStop(1, '#818cf8');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.roundRect(x - barW / 2, y, barW, h, 4);
      ctx.fill();

      // Label
      ctx.fillStyle = '#6b7280';
      ctx.font = '11px -apple-system, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(lbl.length > 8 ? lbl.slice(0, 7) + '…' : lbl, x, baseY + 14);

      // Value
      ctx.fillStyle = '#111827';
      ctx.font = 'bold 11px -apple-system, sans-serif';
      ctx.fillText(averages[i], x, y - 6);
    });
  }

  // ── Load saved tasks on startup ──────────────────────────────────────────
  async function loadSavedTasks() {
    const stored = getStoredTasks();
    if (!stored.length) return;
    updateTaskCount(stored.length);

    for (const { id, filename } of stored.slice(0, 10)) {
      try {
        const res = await fetch(`${API}/status/${id}`);
        if (!res.ok) continue;
        const data = await res.json();
        const card = createTaskCard(id, filename);
        card.setId(id);
        document.getElementById('tasks-container').append(card.el);
        card.update(data);

        if (data.status === 'pending' || data.status === 'processing') {
          streamTask(id, card);
        }
      } catch { /* skip */ }
    }
  }

  function updateTaskCount(n) {
    const stored = n !== undefined ? n : getStoredTasks().length;
    document.getElementById('task-count').textContent = stored ? `${stored} tasks` : '';
  }

  function escHtml(s) {
    return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }

  loadSavedTasks();