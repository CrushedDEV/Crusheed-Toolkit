import { $, createJobPanel, basename, escapeHtml, statusText, smallButton } from '../shared.js';

const MAX_ROWS = 500;
const PATTERN_KEY = 'ctkOrganizerPattern';

// "{artist} - {title} [{bpm} {camelot}]" -> file name without extension; empty tokens collapse cleanly
export function applyPattern(pattern, t, index) {
  const values = {
    artist: t.artist, title: t.title?.replace(/\.[a-z0-9]{2,4}$/i, ''), album: t.album,
    bpm: t.bpm ? String(Math.round(t.bpm)) : '', key: t.key || '', camelot: t.camelot || '', n: String(index + 1).padStart(2, '0'),
  };
  return pattern
    .replace(/\{(\w+)\}/g, (_, k) => (values[k] ?? '').toString().trim())
    .replace(/\[\s*\]|\(\s*\)/g, '')
    .split(/\s*-\s*(?=\s|$)|(?<=^|\s)-\s*/)
    .map(s => s.replace(/\s{2,}/g, ' ').trim())
    .filter(Boolean)
    .join(' - ');
}

export function mountOrganizerModule(root) {
  root.innerHTML = `
  <div class="card">
    <div class="field">
      <div class="label">Carpeta de música</div>
      <div class="input-group">
        <input id="og-folder" type="text" placeholder="Selecciona la carpeta de tu librería" />
        <button id="og-browse" class="ghost">Elegir carpeta…</button>
        <button id="og-scan" class="primary">Escanear</button>
      </div>
      <div class="small" style="margin-top:6px;">Incluye subcarpetas. Las etiquetas y portadas solo se pueden editar en MP3.</div>
    </div>
  </div>

  <div class="card">
    <div class="row" style="justify-content:space-between;">
      <div class="row" style="gap:10px;">
        <label class="small"><input id="og-all" type="checkbox" /> Todas</label>
        <input id="og-filter" type="search" placeholder="Filtrar por título, artista o archivo…" style="width:280px;" />
        <span id="og-count" class="small"></span>
      </div>
      <div class="actions" style="margin:0;">
        <button id="og-analyze" class="ghost sm">Analizar BPM/tonalidad</button>
        <button id="og-rename-open" class="ghost sm">Renombrar…</button>
        <button id="og-cover" class="ghost sm">Poner portada…</button>
      </div>
    </div>

    <div id="og-rename" class="card" hidden>
      <h3 class="section-title">Renombrar seleccionadas</h3>
      <div class="field">
        <div class="label">Patrón</div>
        <input id="og-pattern" type="text" spellcheck="false" />
        <div class="small" style="margin-top:6px;">Variables: <code>{artist}</code> <code>{title}</code> <code>{album}</code> <code>{bpm}</code> <code>{key}</code> <code>{camelot}</code> <code>{n}</code></div>
      </div>
      <div class="field">
        <div class="label">Vista previa</div>
        <div id="og-preview" class="well mono" style="max-height:160px; font-size:12px;"></div>
      </div>
      <div class="actions">
        <button id="og-rename-apply" class="primary">Renombrar</button>
        <button id="og-rename-cancel" class="ghost">Cerrar</button>
      </div>
    </div>

    <div id="og-editor" class="card" hidden>
      <h3 class="section-title" id="og-editor-title">Editar etiquetas</h3>
      <div class="grid grid-3">
        <div class="field"><div class="label">Título</div><input id="ed-title" type="text" /></div>
        <div class="field"><div class="label">Artista</div><input id="ed-artist" type="text" /></div>
        <div class="field"><div class="label">Álbum</div><input id="ed-album" type="text" /></div>
        <div class="field"><div class="label">BPM</div><input id="ed-bpm" type="number" min="0" /></div>
        <div class="field"><div class="label">Tonalidad</div><input id="ed-key" type="text" placeholder="A minor, 8A…" /></div>
      </div>
      <div class="actions">
        <button id="ed-save" class="primary">Guardar</button>
        <button id="ed-cancel" class="ghost">Cancelar</button>
      </div>
    </div>

    <div id="og-table" class="well" style="max-height:460px; margin-top:14px; padding:0;"></div>
  </div>

  <div class="card" id="og-progress"></div>
  `;

  let tracks = [];
  const selected = new Set();
  let editing = null;
  const folderInput = $('#og-folder', root);
  const filterInput = $('#og-filter', root);
  const tableHost = $('#og-table', root);
  const patternInput = $('#og-pattern', root);
  const panel = createJobPanel($('#og-progress', root), { idleText: 'Escanea una carpeta para empezar.' });

  try { patternInput.value = localStorage.getItem(PATTERN_KEY) || '{artist} - {title}'; } catch { patternInput.value = '{artist} - {title}'; }

  const visible = () => {
    const q = filterInput.value.trim().toLowerCase();
    return q ? tracks.filter(t => `${t.title} ${t.artist} ${basename(t.file)}`.toLowerCase().includes(q)) : tracks;
  };
  const selectedTracks = () => tracks.filter(t => selected.has(t.file));

  function render() {
    const list = visible();
    $('#og-count', root).textContent = tracks.length ? `${list.length} pistas · ${selected.size} seleccionadas` : '';
    $('#og-all', root).checked = list.length > 0 && list.every(t => selected.has(t.file));
    if (!tracks.length) { tableHost.innerHTML = '<div class="empty">Sin pistas todavía.</div>'; return; }
    const rows = list.slice(0, MAX_ROWS).map(t => `
      <tr data-file="${escapeHtml(t.file)}">
        <td style="width:28px;"><input type="checkbox" ${selected.has(t.file) ? 'checked' : ''} /></td>
        <td style="max-width:260px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;" title="${escapeHtml(t.file)}">${escapeHtml(basename(t.file))}</td>
        <td>${escapeHtml(t.title || '—')}</td>
        <td>${escapeHtml(t.artist || '—')}</td>
        <td>${t.bpm ? Math.round(t.bpm) : '<span class="muted">—</span>'}</td>
        <td>${t.camelot ? `<span class="value-badge">${escapeHtml(t.camelot)}</span>` : escapeHtml(t.key || '—')}</td>
        <td>${t.hasCover ? '✓' : '<span class="muted">—</span>'}</td>
        <td class="actions-cell"><button class="ghost sm" data-edit ${t.ext === 'mp3' ? '' : 'disabled title="Solo MP3"'}>Editar</button></td>
      </tr>`).join('');
    tableHost.innerHTML = `<table class="data"><thead><tr><th></th><th>Archivo</th><th>Título</th><th>Artista</th><th>BPM</th><th>Tono</th><th>Portada</th><th></th></tr></thead><tbody>${rows}</tbody></table>
      ${list.length > MAX_ROWS ? `<div class="empty">Mostrando ${MAX_ROWS} de ${list.length}. Usa el filtro para acotar.</div>` : ''}`;
  }

  tableHost.addEventListener('change', (e) => {
    const tr = e.target.closest('tr[data-file]');
    if (!tr || e.target.type !== 'checkbox') return;
    if (e.target.checked) selected.add(tr.dataset.file); else selected.delete(tr.dataset.file);
    render();
    if (!$('#og-rename', root).hidden) renderPreview();
  });
  tableHost.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-edit]');
    if (!btn) return;
    openEditor(tracks.find(t => t.file === btn.closest('tr').dataset.file));
  });
  $('#og-all', root).addEventListener('change', (e) => {
    for (const t of visible()) { if (e.target.checked) selected.add(t.file); else selected.delete(t.file); }
    render();
  });
  filterInput.addEventListener('input', render);

  $('#og-browse', root).addEventListener('click', async () => {
    const d = await window.ctk.chooseDirectory();
    if (d) folderInput.value = d;
  });

  async function scan() {
    const folder = folderInput.value.trim();
    if (!folder) { statusText(panel.msg, 'Elige una carpeta.', 'warn'); return; }
    panel.msg.textContent = 'Escaneando…';
    const r = await window.ctk.organizer.scan(folder);
    if (!r.ok) { statusText(panel.msg, `Error: ${r.error}`, 'warn'); return; }
    tracks = r.tracks;
    selected.clear();
    const missing = tracks.filter(t => !t.bpm || !t.key).length;
    panel.msg.textContent = `${tracks.length} pistas encontradas · ${missing} sin BPM o tonalidad.`;
    render();
  }
  $('#og-scan', root).addEventListener('click', scan);

  function needSelection() {
    if (selected.size) return true;
    statusText(panel.msg, 'Selecciona al menos una pista.', 'warn');
    return false;
  }

  // Analysis
  $('#og-analyze', root).addEventListener('click', async () => {
    if (!needSelection() || panel.busy) return;
    const files = selectedTracks().map(t => t.file);
    const res = await panel.run((jobId) => window.ctk.organizer.analyze({ jobId, files }), {
      onItemDone: (item) => {
        const t = tracks.find(x => x.file === item.file);
        if (t && item.ok) Object.assign(t, { bpm: item.bpm, key: item.key, camelot: item.camelot });
        render();
      }
    });
    if (res?.ok) {
      const ok = res.results.filter(r => r.ok).length;
      const notWritten = res.results.filter(r => r.ok && !r.written).length;
      statusText(panel.msg, `${ok}/${res.results.length} analizadas${notWritten ? ` · ${notWritten} no son MP3 (no se guardó en el archivo)` : ''}.`, 'success');
    }
  });

  // Rename
  function renderPreview() {
    const list = selectedTracks();
    const prev = $('#og-preview', root);
    if (!list.length) { prev.innerHTML = '<div class="empty">Selecciona pistas en la tabla.</div>'; return; }
    prev.innerHTML = list.slice(0, 30).map((t, i) => `<div>${escapeHtml(basename(t.file))} <span class="muted">→</span> <span class="success">${escapeHtml(applyPattern(patternInput.value, t, i) || '(vacío)')}.${t.ext}</span></div>`).join('')
      + (list.length > 30 ? `<div class="muted">… y ${list.length - 30} más</div>` : '');
  }
  $('#og-rename-open', root).addEventListener('click', () => { $('#og-rename', root).hidden = false; renderPreview(); });
  $('#og-rename-cancel', root).addEventListener('click', () => { $('#og-rename', root).hidden = true; });
  patternInput.addEventListener('input', () => { try { localStorage.setItem(PATTERN_KEY, patternInput.value); } catch {} renderPreview(); });
  $('#og-rename-apply', root).addEventListener('click', async () => {
    if (!needSelection()) return;
    const list = selectedTracks();
    const items = list.map((t, i) => ({ from: t.file, to: applyPattern(patternInput.value, t, i) }));
    if (items.some(i => !i.to)) { statusText(panel.msg, 'Alguna pista quedaría sin nombre: revisa el patrón o las etiquetas.', 'warn'); return; }
    if (!confirm(`¿Renombrar ${items.length} archivos?`)) return;
    const r = await window.ctk.organizer.rename(items);
    if (!r.ok) { statusText(panel.msg, `Error: ${r.error}`, 'warn'); return; }
    for (const res of r.results) {
      if (!res.ok) continue;
      const t = tracks.find(x => x.file === res.from);
      if (t) { selected.delete(t.file); t.file = res.to; selected.add(t.file); }
    }
    const failed = r.results.filter(x => !x.ok);
    statusText(panel.msg, failed.length ? `${r.results.length - failed.length} renombradas · ${failed.length} con error (p. ej. ${basename(failed[0].from)}: ${failed[0].error})` : `${r.results.length} archivos renombrados.`, failed.length ? 'warn' : 'success');
    render(); renderPreview();
  });

  // Cover
  $('#og-cover', root).addEventListener('click', async () => {
    if (!needSelection()) return;
    const image = await window.ctk.chooseFile([{ name: 'Imágenes', extensions: ['jpg', 'jpeg', 'png'] }]);
    if (!image) return;
    const files = selectedTracks().map(t => t.file);
    const r = await window.ctk.organizer.setCover({ files, image });
    if (!r.ok) { statusText(panel.msg, `Error: ${r.error}`, 'warn'); return; }
    for (const res of r.results) if (res.ok) { const t = tracks.find(x => x.file === res.file); if (t) t.hasCover = true; }
    const ok = r.results.filter(x => x.ok).length;
    statusText(panel.msg, `Portada puesta en ${ok} de ${files.length} archivos${ok < files.length ? ' (solo MP3)' : ''}.`, ok ? 'success' : 'warn');
    render();
  });

  // Tag editor
  function openEditor(t) {
    editing = t;
    $('#og-editor-title', root).textContent = `Editar · ${basename(t.file)}`;
    $('#ed-title', root).value = t.title && t.title !== basename(t.file) ? t.title : '';
    $('#ed-artist', root).value = t.artist || '';
    $('#ed-album', root).value = t.album || '';
    $('#ed-bpm', root).value = t.bpm ? Math.round(t.bpm) : '';
    $('#ed-key', root).value = t.key || '';
    $('#og-editor', root).hidden = false;
    $('#ed-title', root).focus();
  }
  $('#ed-cancel', root).addEventListener('click', () => { $('#og-editor', root).hidden = true; editing = null; });
  $('#ed-save', root).addEventListener('click', async () => {
    if (!editing) return;
    const payload = {
      file: editing.file,
      title: $('#ed-title', root).value.trim(), artist: $('#ed-artist', root).value.trim(), album: $('#ed-album', root).value.trim(),
      bpm: $('#ed-bpm', root).value.trim(), key: $('#ed-key', root).value.trim(),
    };
    const r = await window.ctk.organizer.writeTags(payload);
    if (!r.ok) { statusText(panel.msg, `Error: ${r.error}`, 'warn'); return; }
    Object.assign(editing, { title: payload.title || editing.title, artist: payload.artist, album: payload.album, bpm: payload.bpm ? Number(payload.bpm) : editing.bpm, key: payload.key || editing.key });
    statusText(panel.msg, 'Etiquetas guardadas. Vuelve a escanear para recalcular el Camelot.', 'success');
    $('#og-editor', root).hidden = true;
    editing = null;
    render();
  });

  render();
  root._cleanup = () => panel.dispose();
}
