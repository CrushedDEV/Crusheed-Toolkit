import { $, newJobId, smallButton, escapeHtml } from '../shared.js';

const QUALITY_OPTIONS = {
  mp4: [['best', 'Máxima disponible'], ['2160', '4K (2160p)'], ['1440', '1440p'], ['1080', '1080p'], ['720', '720p'], ['480', '480p']],
  mp3: [['best', 'Máxima (VBR)'], ['320', '320 kbps'], ['192', '192 kbps'], ['128', '128 kbps']],
};
const OUTDIR_KEY = 'ctkYtOutDir';

// The queue lives at module level so it survives switching to another tool and back.
const queue = [];
let running = null;
let view = null; // render callback of the currently mounted UI

let renderScheduled = false;
function notify() {
  if (!view || renderScheduled) return;
  renderScheduled = true;
  requestAnimationFrame(() => { renderScheduled = false; if (view) view(); });
}

async function processQueue() {
  if (running) return;
  const item = queue.find(i => i.state === 'pending');
  if (!item) return;
  running = item;
  item.state = 'running';
  item.status = 'Iniciando…';
  notify();
  const res = await window.ctk.youtube.download({
    url: item.url, format: item.format, quality: item.quality, playlist: item.playlist, outputDir: item.outputDir, jobId: item.jobId
  });
  if (res.ok) {
    item.state = 'done';
    item.percent = 100;
    item.files = res.files || (res.file ? [res.file] : []);
    item.status = item.files.length > 1 ? `Completado · ${item.files.length} archivos` : 'Completado';
  } else if (res.cancelled) {
    item.state = 'cancelled';
    item.status = 'Cancelado';
  } else {
    item.state = 'error';
    item.status = res.error || 'Error desconocido';
  }
  running = null;
  notify();
  processQueue();
}

window.ctk.youtube.onProgress((p) => {
  const item = queue.find(i => i.jobId === p.jobId);
  if (!item) return;
  if (p.stage === 'item') item.itemInfo = `Elemento ${p.index} de ${p.total}`;
  if (typeof p.percent === 'number') {
    item.percent = Math.max(0, Math.min(100, p.percent));
    item.status = ['Descargando', item.itemInfo, p.speed && p.speed !== 'Unknown B/s' ? p.speed : null, p.eta ? `ETA ${p.eta}` : null].filter(Boolean).join(' · ');
  } else if (p.stage === 'postprocess') {
    item.status = p.step === 'extract-audio' ? 'Extrayendo audio…' : 'Combinando audio y vídeo…';
  }
  notify();
});

export function mountYouTubeModule(root) {
  root.innerHTML = `
  <div class="card">
    <div class="field">
      <div class="label">URLs (una por línea)</div>
      <textarea id="yt-urls" rows="3" placeholder="https://www.youtube.com/watch?v=...&#10;https://youtu.be/..." spellcheck="false" style="resize:vertical;"></textarea>
    </div>

    <div class="grid" style="grid-template-columns: 170px 190px minmax(0,1fr);">
      <div class="field">
        <div class="label">Formato</div>
        <select id="yt-format">
          <option value="mp4">MP4 · vídeo</option>
          <option value="mp3">MP3 · solo audio</option>
        </select>
      </div>
      <div class="field">
        <div class="label">Calidad</div>
        <select id="yt-quality"></select>
      </div>
      <div class="field">
        <div class="label">Carpeta destino</div>
        <div class="input-group">
          <input id="yt-outdir" type="text" placeholder="Carpeta de descarga" />
          <button id="btn-browse" class="ghost">Buscar…</button>
        </div>
      </div>
    </div>

    <div class="actions">
      <button id="btn-add" class="primary">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12m0 0l-4.5-4.5M12 15l4.5-4.5M4 17v2a2 2 0 002 2h12a2 2 0 002-2v-2"/></svg>
        Descargar
      </button>
      <label class="small"><input id="yt-playlist" type="checkbox" /> Si es una playlist, descargarla entera</label>
      <button id="btn-update-tool" class="ghost sm push" title="Fuerza la actualización de yt-dlp">Actualizar yt-dlp</button>
    </div>
    <div id="yt-tool" class="small" style="margin-top:8px;"></div>
  </div>

  <div class="card">
    <div class="row" style="justify-content:space-between; margin-bottom:12px;">
      <h3 class="section-title" style="margin:0;">Cola de descargas</h3>
      <button id="btn-clear" class="ghost sm">Limpiar terminadas</button>
    </div>
    <div id="yt-queue"></div>
  </div>
  `;

  const urlsInput = $('#yt-urls', root);
  const fmtSelect = $('#yt-format', root);
  const qualitySelect = $('#yt-quality', root);
  const outInput = $('#yt-outdir', root);
  const playlistCb = $('#yt-playlist', root);
  const queueEl = $('#yt-queue', root);
  const toolNote = $('#yt-tool', root);

  function fillQuality() {
    qualitySelect.innerHTML = QUALITY_OPTIONS[fmtSelect.value].map(([v, l]) => `<option value="${v}">${l}</option>`).join('');
  }
  fmtSelect.addEventListener('change', fillQuality);
  fillQuality();

  window.ctk.getDefaults().then(({ downloadsDir, ffmpegAvailable }) => {
    let saved = null;
    try { saved = localStorage.getItem(OUTDIR_KEY); } catch {}
    outInput.value = saved || downloadsDir;
    if (!ffmpegAvailable) toolNote.innerHTML = '<span class="warn">No se encontró FFmpeg: la conversión a MP3 y la unión de audio/vídeo no funcionarán.</span>';
  });
  outInput.addEventListener('change', () => { try { localStorage.setItem(OUTDIR_KEY, outInput.value.trim()); } catch {} });

  const offTool = window.ctk.youtube.onToolStatus(({ ready, updated, version, error }) => {
    if (!ready) toolNote.textContent = `No se pudo preparar yt-dlp: ${error || 'error desconocido'}`;
    else if (updated) toolNote.textContent = `yt-dlp actualizado a ${version || 'la última versión'}.`;
    else if (error) toolNote.textContent = `No se pudo actualizar yt-dlp (${error}). Se usará la versión instalada.`;
  });

  $('#btn-browse', root).addEventListener('click', async () => {
    const d = await window.ctk.chooseDirectory();
    if (d) { outInput.value = d; try { localStorage.setItem(OUTDIR_KEY, d); } catch {} }
  });

  $('#btn-update-tool', root).addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    btn.disabled = true;
    toolNote.textContent = 'Buscando actualización de yt-dlp…';
    const r = await window.ctk.youtube.updateTool();
    toolNote.textContent = !r.ok ? `Error: ${r.error}` : (r.updated ? `yt-dlp actualizado a ${r.version}.` : 'yt-dlp ya está en la última versión.');
    btn.disabled = false;
  });

  $('#btn-add', root).addEventListener('click', () => {
    const urls = urlsInput.value.split(/\s+/).map(s => s.trim()).filter(Boolean);
    const outputDir = outInput.value.trim();
    const bad = urls.filter(u => !/^https?:\/\//i.test(u));
    if (!urls.length) { toolNote.textContent = 'Pega al menos una URL.'; return; }
    if (bad.length) { toolNote.textContent = `URL no válida: ${bad[0]}`; return; }
    if (!outputDir) { toolNote.textContent = 'Elige una carpeta de destino.'; return; }
    for (const url of urls) {
      queue.push({
        jobId: newJobId('yt'), url, outputDir,
        format: fmtSelect.value, quality: qualitySelect.value, playlist: playlistCb.checked,
        state: 'pending', status: 'En cola', percent: 0, files: []
      });
    }
    urlsInput.value = '';
    toolNote.textContent = '';
    render();
    processQueue();
  });

  $('#btn-clear', root).addEventListener('click', () => {
    for (let i = queue.length - 1; i >= 0; i--) {
      if (['done', 'error', 'cancelled'].includes(queue[i].state)) queue.splice(i, 1);
    }
    render();
  });

  function render() {
    queueEl.innerHTML = '';
    if (!queue.length) {
      queueEl.innerHTML = '<div class="empty">La cola está vacía. Pega una o varias URLs arriba.</div>';
      return;
    }
    for (const item of queue) {
      const row = document.createElement('div');
      row.className = 'list-row';
      row.style.flexDirection = 'column';
      row.style.alignItems = 'stretch';
      const stateClass = item.state === 'done' ? 'success' : item.state === 'error' ? 'warn' : '';
      row.innerHTML = `
        <div class="row" style="flex-wrap:nowrap;">
          <span class="value-badge">${item.format.toUpperCase()}</span>
          <div style="flex:1; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;" title="${escapeHtml(item.url)}">${escapeHtml(item.files[0] ? item.files[0].split(/[\\/]/).pop() : item.url)}</div>
          <div class="actions" style="margin:0; gap:6px; flex-wrap:nowrap;"></div>
        </div>
        <div class="progress" style="margin-top:10px;${item.state === 'running' || item.state === 'done' ? '' : 'opacity:.4;'}"><div style="width:${item.percent}%"></div></div>
        <div class="small ${stateClass}" style="margin-top:6px; white-space:pre-wrap;"></div>`;
      row.querySelector('.small').textContent = item.status;
      const actions = row.querySelector('.actions');
      if (item.state === 'running') {
        actions.appendChild(smallButton('Cancelar', () => window.ctk.jobs.cancel(item.jobId), 'danger'));
      } else if (item.state === 'pending') {
        actions.appendChild(smallButton('Quitar', () => { queue.splice(queue.indexOf(item), 1); render(); }));
      } else if (item.state === 'done' && item.files.length) {
        actions.appendChild(smallButton('Mostrar', () => window.ctk.shell.showItemInFolder(item.files[item.files.length - 1])));
        if (item.files.length === 1 && /\.mp3$/i.test(item.files[0])) {
          actions.appendChild(smallButton('Analizar BPM', () => window.dispatchEvent(new CustomEvent('ctk:navigate', { detail: { module: 'analyzer', params: { filePath: item.files[0] } } }))));
        }
      } else if (item.state === 'error' || item.state === 'cancelled') {
        actions.appendChild(smallButton('Reintentar', () => {
          Object.assign(item, { state: 'pending', status: 'En cola', percent: 0, jobId: newJobId('yt'), itemInfo: null });
          render(); processQueue();
        }));
      }
      queueEl.appendChild(row);
    }
  }

  view = render;
  render();

  root._cleanup = () => { view = null; try { offTool && offTool(); } catch {} };
}
