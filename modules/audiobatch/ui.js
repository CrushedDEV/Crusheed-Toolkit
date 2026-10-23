import { $, setupDropzone, preventWindowDrop, createJobPanel, basename, smallButton, statusText, escapeHtml, ICON_UPLOAD } from '../shared.js';

const AUDIO_EXT = /\.(mp3|wav|flac|m4a|aac|ogg|opus|wma|aiff?|mp4|mkv|webm|mov)$/i;
const LOSSLESS = new Set(['wav', 'flac']);

export function mountAudioBatchModule(root) {
  root.innerHTML = `
  <div class="card">
    <div id="ab-drop" class="dropzone" role="button" tabindex="0">
      ${ICON_UPLOAD}
      <div><strong>Suelta archivos de audio</strong> (o vídeos, se extrae el audio)</div>
      <div class="small">MP3, WAV, FLAC, M4A, OGG, OPUS, AIFF, MP4…</div>
      <input id="ab-input" type="file" multiple accept="audio/*,video/*" style="display:none;" />
    </div>

    <div class="grid" style="grid-template-columns:160px 160px minmax(0,1fr);">
      <div class="field">
        <div class="label">Convertir a</div>
        <select id="ab-format">
          <option value="mp3">MP3</option>
          <option value="wav">WAV</option>
          <option value="flac">FLAC</option>
          <option value="m4a">M4A (AAC)</option>
          <option value="ogg">OGG</option>
          <option value="opus">OPUS</option>
        </select>
      </div>
      <div class="field" id="ab-bitrate-field">
        <div class="label">Bitrate</div>
        <select id="ab-bitrate">
          <option value="320" selected>320 kbps</option>
          <option value="256">256 kbps</option>
          <option value="192">192 kbps</option>
          <option value="128">128 kbps</option>
        </select>
      </div>
      <div class="field">
        <div class="label">Carpeta de salida</div>
        <div class="input-group">
          <input id="ab-outdir" type="text" placeholder="La misma que cada archivo" />
          <button id="ab-browse" class="ghost">Buscar…</button>
        </div>
      </div>
    </div>

    <div class="grid" style="grid-template-columns:repeat(2, 160px) minmax(0,1fr); align-items:end;">
      <div class="field">
        <div class="label">Recortar desde</div>
        <input id="ab-start" type="text" placeholder="0:00" />
      </div>
      <div class="field">
        <div class="label">Hasta</div>
        <input id="ab-end" type="text" placeholder="final" />
      </div>
      <label class="small" style="min-height:42px;"><input id="ab-norm" type="checkbox" /> Igualar volumen (−14 LUFS, como Spotify/YouTube)</label>
    </div>

    <div class="actions">
      <button id="ab-run" class="primary">Convertir</button>
      <button id="ab-clear" class="ghost">Vaciar lista</button>
    </div>
  </div>

  <div class="card">
    <h3 class="section-title">Archivos</h3>
    <div id="ab-list" class="well" style="max-height:300px; margin-top:10px;"></div>
  </div>

  <div class="card" id="ab-progress"></div>
  `;

  let files = [];
  const results = new Map(); // input -> result
  const list = $('#ab-list', root);
  const fmt = $('#ab-format', root);
  const panel = createJobPanel($('#ab-progress', root), { idleText: 'Añade archivos para empezar.' });

  function render() {
    if (!files.length) { list.innerHTML = '<div class="empty">No hay archivos.</div>'; return; }
    list.innerHTML = '';
    for (const f of files) {
      const r = results.get(f);
      const row = document.createElement('div');
      row.className = 'row';
      row.style.padding = '6px 2px';
      row.style.flexWrap = 'nowrap';
      row.innerHTML = `<div style="flex:1; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;" title="${escapeHtml(f)}">${escapeHtml(basename(f))}</div><div class="small" data-state></div>`;
      const state = row.querySelector('[data-state]');
      if (r?.ok) {
        state.className = 'small success'; state.textContent = 'Hecho';
        row.appendChild(smallButton('Mostrar', () => window.ctk.shell.showItemInFolder(r.file)));
      } else if (r) {
        state.className = 'small warn'; state.textContent = r.error;
      } else if (!panel.busy) {
        row.appendChild(smallButton('Quitar', () => { files = files.filter(x => x !== f); render(); }));
      }
      list.appendChild(row);
    }
  }

  function addFiles(paths) {
    for (const p of paths) if (!files.includes(p)) files.push(p);
    results.clear();
    render();
  }

  setupDropzone($('#ab-drop', root), $('#ab-input', root), addFiles, { accept: AUDIO_EXT });
  const cleanupDrop = preventWindowDrop();
  fmt.addEventListener('change', () => { $('#ab-bitrate-field', root).hidden = LOSSLESS.has(fmt.value); });
  $('#ab-browse', root).addEventListener('click', async () => {
    const d = await window.ctk.chooseDirectory();
    if (d) $('#ab-outdir', root).value = d;
  });
  $('#ab-clear', root).addEventListener('click', () => { if (!panel.busy) { files = []; results.clear(); render(); } });

  $('#ab-run', root).addEventListener('click', async (e) => {
    if (!files.length) { statusText(panel.msg, 'Añade al menos un archivo.', 'warn'); return; }
    if (panel.busy) return;
    const btn = e.currentTarget;
    btn.disabled = true;
    results.clear();
    render();
    const res = await panel.run((jobId) => window.ctk.media.batchAudio({
      jobId, files,
      format: fmt.value,
      bitrate: Number($('#ab-bitrate', root).value),
      start: $('#ab-start', root).value.trim(),
      end: $('#ab-end', root).value.trim(),
      normalize: $('#ab-norm', root).checked,
      outputDir: $('#ab-outdir', root).value.trim() || null,
    }), { onItemDone: (item) => { results.set(item.input, item); render(); } });
    btn.disabled = false;
    if (res?.ok) {
      const ok = res.results.filter(r => r.ok).length;
      statusText(panel.msg, `${ok} de ${res.results.length} archivos convertidos.`, ok === res.results.length ? 'success' : 'warn');
    }
    render();
  });

  render();
  root._cleanup = () => { panel.dispose(); cleanupDrop(); };
}
