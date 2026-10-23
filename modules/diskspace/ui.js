import { $, $$, createJobPanel, formatBytes, escapeHtml, statusText, basename } from '../shared.js';

export function mountDiskSpaceModule(root) {
  root.innerHTML = `
  <div class="card">
    <div class="field">
      <div class="label">Carpeta a analizar</div>
      <div class="input-group">
        <input id="ds-folder" type="text" placeholder="Por ejemplo C:\\Users\\tu-usuario o D:\\" />
        <button id="ds-browse" class="ghost">Elegir…</button>
        <button id="ds-scan" class="primary">Analizar</button>
      </div>
    </div>
    <div class="actions">
      <label class="small"><input id="ds-dupes" type="checkbox" checked /> Buscar duplicados</label>
      <label class="small">a partir de
        <select id="ds-min" style="width:auto; padding:6px 30px 6px 10px;">
          <option value="102400">100 KB</option>
          <option value="1048576" selected>1 MB</option>
          <option value="10485760">10 MB</option>
          <option value="104857600">100 MB</option>
        </select>
      </label>
    </div>
  </div>

  <div class="card" id="ds-progress"></div>

  <div class="card" id="ds-results" hidden>
    <div class="row" style="justify-content:space-between;">
      <div class="segmented" id="ds-tabs">
        <button data-tab="folders" class="active">Carpetas</button>
        <button data-tab="largest">Archivos grandes</button>
        <button data-tab="dupes">Duplicados</button>
      </div>
      <div id="ds-summary" class="facts"></div>
    </div>
    <div id="ds-view" class="well" style="max-height:520px; margin-top:14px; padding:0;"></div>
    <div class="small" style="margin-top:8px;">«Papelera» mueve el archivo a la Papelera de reciclaje: se puede recuperar.</div>
  </div>
  `;

  const panel = createJobPanel($('#ds-progress', root), { idleText: 'Elige una carpeta y pulsa Analizar.' });
  const view = $('#ds-view', root);
  let data = null;
  let tab = 'folders';
  const trashed = new Set();

  const row = (file, size, extra = '') => `
    <tr class="${trashed.has(file) ? 'muted' : ''}">
      <td style="max-width:520px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;" title="${escapeHtml(file)}">${extra}${escapeHtml(file)}</td>
      <td style="white-space:nowrap; text-align:right;"><b>${formatBytes(size)}</b></td>
      <td class="actions-cell">${trashed.has(file) ? '<span class="small">En la papelera</span>' : `<button class="ghost sm" data-show="${escapeHtml(file)}">Mostrar</button> <button class="danger sm" data-trash="${escapeHtml(file)}">Papelera</button>`}</td>
    </tr>`;

  function render() {
    if (!data) return;
    if (tab === 'folders') {
      const max = data.folders[0]?.size || 1;
      view.innerHTML = `<table class="data"><tbody>${data.folders.slice(0, 200).map(f => `
        <tr>
          <td style="width:40%;">${f.isDir ? '📁 ' : ''}${escapeHtml(f.name)}</td>
          <td><div class="progress" style="height:6px;"><div style="width:${(f.size / max * 100).toFixed(1)}%"></div></div></td>
          <td style="white-space:nowrap; text-align:right;"><b>${formatBytes(f.size)}</b></td>
          <td class="actions-cell">${f.isDir ? `<button class="ghost sm" data-drill="${escapeHtml(f.path)}">Entrar</button>` : ''} <button class="ghost sm" data-show="${escapeHtml(f.path)}">Mostrar</button></td>
        </tr>`).join('')}</tbody></table>`;
    } else if (tab === 'largest') {
      view.innerHTML = `<table class="data"><tbody>${data.largest.map(f => row(f.file, f.size)).join('')}</tbody></table>`;
    } else {
      if (!data.duplicates.length) { view.innerHTML = '<div class="empty">No se encontraron duplicados.</div>'; return; }
      view.innerHTML = data.duplicates.map(g => `
        <div style="padding:10px 12px; border-bottom:1px solid var(--border);">
          <div class="small" style="margin-bottom:6px;">${g.files.length} copias de ${formatBytes(g.size)} · se recuperan <b>${formatBytes(g.wasted)}</b> dejando una</div>
          <table class="data"><tbody>${g.files.map((f, i) => row(f, g.size, i === 0 ? '<span class="value-badge" style="margin-right:6px;">original</span>' : '')).join('')}</tbody></table>
        </div>`).join('');
    }
  }

  view.addEventListener('click', async (e) => {
    const show = e.target.closest('[data-show]');
    if (show) { window.ctk.shell.showItemInFolder(show.dataset.show); return; }
    const drill = e.target.closest('[data-drill]');
    if (drill) { $('#ds-folder', root).value = drill.dataset.drill; scan(); return; }
    const trash = e.target.closest('[data-trash]');
    if (trash) {
      const file = trash.dataset.trash;
      if (!confirm(`¿Mover a la papelera?\n${basename(file)}`)) return;
      const r = await window.ctk.shell.trash([file]);
      if (r.ok) { trashed.add(file); render(); } else statusText(panel.msg, `Error: ${r.results?.[0]?.error || 'desconocido'}`, 'warn');
    }
  });

  $$('#ds-tabs button', root).forEach(b => b.addEventListener('click', () => {
    tab = b.dataset.tab;
    $$('#ds-tabs button', root).forEach(x => x.classList.toggle('active', x === b));
    render();
  }));

  $('#ds-browse', root).addEventListener('click', async () => {
    const d = await window.ctk.chooseDirectory();
    if (d) $('#ds-folder', root).value = d;
  });

  async function scan() {
    const folder = $('#ds-folder', root).value.trim();
    if (!folder) { statusText(panel.msg, 'Elige una carpeta.', 'warn'); return; }
    if (panel.busy) return;
    const res = await panel.run((jobId) => window.ctk.sys.diskScan({ jobId, folder, duplicates: $('#ds-dupes', root).checked, minDupSize: Number($('#ds-min', root).value) }));
    if (!res?.ok) return;
    data = res;
    trashed.clear();
    const wasted = res.duplicates.reduce((s, g) => s + g.wasted, 0);
    $('#ds-summary', root).innerHTML = `<span class="fact">Total <b>${formatBytes(res.totalBytes)}</b></span><span class="fact">Archivos <b>${res.files.toLocaleString('es')}</b></span>${$('#ds-dupes', root).checked ? `<span class="fact">En duplicados <b>${formatBytes(wasted)}</b></span>` : ''}`;
    statusText(panel.msg, `Análisis terminado${res.errors ? ` · ${res.errors} elementos sin permiso de lectura` : ''}.`, 'success');
    $('#ds-results', root).hidden = false;
    render();
  }
  $('#ds-scan', root).addEventListener('click', scan);

  root._cleanup = () => panel.dispose();
}
