// Small helpers shared by the renderer modules.

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

export function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export function formatBytes(n) {
  if (n == null || Number.isNaN(n)) return '—';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let i = 0; let v = Number(n);
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i++; }
  return `${v.toFixed(v >= 100 || i === 0 ? 0 : 1)} ${units[i]}`;
}

export function formatDuration(sec) {
  if (sec == null) return '—';
  const s = Math.round(sec);
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60;
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}` : `${m}:${String(r).padStart(2, '0')}`;
}

export const basename = (p) => String(p).split(/[\\/]/).pop();
export const dirname = (p) => String(p).replace(/[\\/][^\\/]*$/, '');

export function newJobId(prefix = 'job') {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

// Filesystem path of a File from <input type=file> or drag & drop
export const pathOf = (file) => window.ctk.getPathForFile(file);

// Wires a .dropzone + hidden <input type=file>; onFiles receives absolute paths.
export function setupDropzone(zone, input, onFiles, { accept } = {}) {
  const filter = (files) => files.map(pathOf).filter(Boolean).filter(p => !accept || accept.test(p));
  zone.addEventListener('click', () => input.click());
  zone.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); input.click(); } });
  zone.addEventListener('dragover', (e) => { e.preventDefault(); zone.classList.add('is-over'); });
  zone.addEventListener('dragleave', () => zone.classList.remove('is-over'));
  zone.addEventListener('drop', (e) => {
    e.preventDefault(); zone.classList.remove('is-over');
    const paths = filter(Array.from(e.dataTransfer.files));
    if (paths.length) onFiles(paths);
  });
  input.addEventListener('change', () => {
    const paths = filter(Array.from(input.files || []));
    input.value = '';
    if (paths.length) onFiles(paths);
  });
}

// Stops the window from navigating when a file is dropped outside a dropzone; returns cleanup.
export function preventWindowDrop() {
  const prevent = (e) => e.preventDefault();
  window.addEventListener('dragover', prevent);
  window.addEventListener('drop', prevent);
  return () => { window.removeEventListener('dragover', prevent); window.removeEventListener('drop', prevent); };
}

export function setProgress(barEl, badgeEl, fraction) {
  const pct = fraction == null ? null : Math.max(0, Math.min(100, fraction * 100));
  if (barEl) barEl.style.width = (pct ?? 0) + '%';
  if (badgeEl) badgeEl.textContent = pct == null ? '…' : `${pct.toFixed(pct < 10 ? 1 : 0)}%`;
}

export function statusText(el, text, kind) {
  el.innerHTML = '';
  const span = document.createElement('span');
  if (kind) span.className = kind;
  span.style.whiteSpace = 'pre-wrap';
  span.textContent = text;
  el.appendChild(span);
  return span;
}

export function smallButton(label, onClick, variant = 'ghost') {
  const b = document.createElement('button');
  b.className = `${variant} sm`;
  b.textContent = label;
  b.addEventListener('click', onClick);
  return b;
}

// Progress card for a cancellable backend job. run(jobId => promise) wires progress + cancel.
export function createJobPanel(host, { idleText = '' } = {}) {
  host.innerHTML = `
    <div class="row" style="justify-content:space-between; margin-bottom:10px;">
      <div class="label" style="margin:0;">Progreso</div>
      <div class="row" style="gap:8px;"><span class="value-badge" data-pct>0%</span></div>
    </div>
    <div class="progress"><div data-bar></div></div>
    <div class="status" data-msg style="margin-top:12px;"></div>`;
  const bar = $('[data-bar]', host), pct = $('[data-pct]', host), msg = $('[data-msg]', host);
  const cancelBtn = smallButton('Cancelar', () => currentJob && window.ctk.jobs.cancel(currentJob), 'danger');
  cancelBtn.hidden = true;
  pct.parentElement.appendChild(cancelBtn);
  msg.textContent = idleText;
  let currentJob = null;
  let onItem = null;
  const off = window.ctk.jobs.onProgress((p) => {
    if (p.jobId !== currentJob) return;
    if (p.item && onItem) onItem(p.item);
    if (typeof p.fraction === 'number') setProgress(bar, pct, p.fraction);
    if (p.message) msg.textContent = p.message;
  });
  return {
    get busy() { return Boolean(currentJob); },
    msg,
    async run(fn, { onItemDone } = {}) {
      currentJob = newJobId();
      onItem = onItemDone || null;
      setProgress(bar, pct, 0);
      msg.textContent = 'Iniciando…';
      cancelBtn.hidden = false;
      try {
        const res = await fn(currentJob);
        if (res?.ok) setProgress(bar, pct, 1);
        else statusText(msg, res?.cancelled ? 'Cancelado.' : `Error: ${res?.error || 'desconocido'}`, res?.cancelled ? '' : 'warn');
        return res;
      } finally {
        currentJob = null;
        cancelBtn.hidden = true;
      }
    },
    dispose() { off(); },
  };
}

export const ICON_UPLOAD = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M12 16V4m0 0L7.5 8.5M12 4l4.5 4.5M4 15v4a2 2 0 002 2h12a2 2 0 002-2v-4"/></svg>';
