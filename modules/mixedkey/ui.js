const $ = (sel, root=document) => root.querySelector(sel);

export function mountMixedKeyModule(root) {
  root.innerHTML = `
  <div class="card">
    <div class="row">
      <div style="flex:2;">
        <div class="label">Carpeta de tu librería</div>
        <div class="row">
          <input id="mk-folder" type="text" placeholder="Selecciona una carpeta con tu música" />
          <button id="mk-browse" class="ghost">Elegir carpeta…</button>
        </div>
        <div class="small muted" style="margin-top:6px;">El escaneo incluye todas las subcarpetas.</div>
      </div>
      <div style="flex:1;">
        <div class="label">Tolerancia BPM (±)</div>
        <input id="mk-tol" type="number" value="3" min="0" step="1" />
      </div>
      <div style="align-self:flex-end;">
        <button id="mk-scan" class="primary">Escanear</button>
      </div>
    </div>

    <div class="row" style="margin-top:12px;">
      <div style="flex:1;">
        <div class="label">Pista de referencia</div>
        <select id="mk-ref"></select>
      </div>
      <div style="flex:1;">
        <div class="label">Buscar (título o artista)</div>
        <input id="mk-filter" type="text" placeholder="Escribe para filtrar…" />
        <div id="mk-suggest" class="card" style="position:absolute; display:none; max-height:220px; overflow:auto; margin-top:6px; z-index:10;"></div>
      </div>
      <div style="align-self:flex-end;">
        <button id="mk-recomend" class="ghost">Ver compatibles</button>
      </div>
    </div>

    <div id="mk-status" class="small" style="margin-top:8px;"></div>
  </div>

  <div id="mk-results" style="margin-top:16px;"></div>
  `;

  const folderInput = $('#mk-folder', root);
  const btnBrowse = $('#mk-browse', root);
  const btnScan = $('#mk-scan', root);
  const tolInput = $('#mk-tol', root);
  const refSelect = $('#mk-ref', root);
  const filterInput = $('#mk-filter', root);
  const suggestBox = $('#mk-suggest', root);
  const btnRecomend = $('#mk-recomend', root);
  const status = $('#mk-status', root);
  const results = $('#mk-results', root);

  let tracks = [];

  btnBrowse.addEventListener('click', async () => {
    const d = await window.ctk.chooseDirectory();
    if (d) folderInput.value = d;
  });

  btnScan.addEventListener('click', async () => {
    const folder = (folderInput.value || '').trim();
    if (!folder) { status.textContent = 'Selecciona una carpeta.'; return; }
    status.textContent = 'Escaneando librería…';
    results.innerHTML = '';
    const res = await window.ctk.library.scan(folder);
    if (!res.ok) { status.textContent = `Error: ${res.error}`; return; }
    tracks = res.tracks || [];
    status.textContent = `Encontradas ${tracks.length} pistas.`;
    renderRefOptions();
  });

  function renderRefOptions(filterStr='') {
    const q = (filterStr || '').trim().toLowerCase();
    refSelect.innerHTML = '';
    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = 'Selecciona pista…';
    refSelect.appendChild(placeholder);
    const filtered = q
      ? tracks.filter(t => (t.title||'').toLowerCase().includes(q) || (t.artist||'').toLowerCase().includes(q))
      : tracks;
    for (const t of filtered) {
      const opt = document.createElement('option');
      opt.value = t.file;
      opt.textContent = `${t.title || 'Sin título'} ${t.artist ? ' - ' + t.artist : ''} [${t.bpm || '?'} BPM | ${t.camelot || t.key || '?'}]`;
      refSelect.appendChild(opt);
    }
    renderSuggest(q, filtered.slice(0, 10));
  }

  function renderSuggest(q, items) {
    if (!q) { suggestBox.style.display = 'none'; suggestBox.innerHTML=''; return; }
    if (!items.length) { suggestBox.style.display = 'none'; suggestBox.innerHTML=''; return; }
    suggestBox.innerHTML = '';
    for (const t of items) {
      const row = document.createElement('div');
      row.style.padding = '8px 10px';
      row.style.cursor = 'pointer';
      row.textContent = `${t.title || 'Sin título'} ${t.artist ? ' - ' + t.artist : ''}`;
      row.onclick = () => {
        refSelect.value = t.file;
        filterInput.value = `${t.title || ''}${t.artist ? ' - ' + t.artist : ''}`.trim();
        suggestBox.style.display = 'none';
      };
      suggestBox.appendChild(row);
    }
    suggestBox.style.display = 'block';
  }

  filterInput.addEventListener('input', () => {
    renderRefOptions(filterInput.value);
  });
  document.addEventListener('click', (e) => {
    if (!suggestBox.contains(e.target) && e.target !== filterInput) {
      suggestBox.style.display = 'none';
    }
  });

  btnRecomend.addEventListener('click', async () => {
    const referenceFile = refSelect.value;
    if (!referenceFile) { status.textContent = 'Elige una pista de referencia.'; return; }
    const bpmTolerance = Math.max(0, parseInt(tolInput.value || '3', 10));
    const r = await window.ctk.library.recommend({ tracks, referenceFile, bpmTolerance });
    if (!r.ok) { status.textContent = `Error: ${r.error}`; return; }
    renderRecommendations(r.recommendations || [], referenceFile);
  });

  function renderRecommendations(recs, referenceFile) {
    results.innerHTML = '';
    if (!recs.length) {
      const empty = document.createElement('div');
      empty.className = 'small muted';
      empty.textContent = 'No se encontraron pistas compatibles con los criterios.';
      results.appendChild(empty);
      return;
    }
    const list = document.createElement('div');
    list.style.display = 'grid';
    list.style.gridTemplateColumns = '1fr 0.6fr 0.6fr 0.6fr auto';
    list.style.gap = '8px';
    list.style.alignItems = 'center';

    const header = document.createElement('div');
    header.className = 'small muted';
    header.style.gridColumn = '1 / -1';
    header.textContent = 'Pistas compatibles (ordenadas por BPM más cercano)';
    results.appendChild(header);

    // headers
    const hdrs = ['Título', 'Artista', 'BPM', 'Camelot', ''];
    for (const h of hdrs) {
      const el = document.createElement('div');
      el.className = 'label';
      el.textContent = h;
      list.appendChild(el);
    }

    for (const t of recs) {
      const title = document.createElement('div');
      title.textContent = t.title || '—';
      const artist = document.createElement('div');
      artist.textContent = t.artist || '—';
      const bpm = document.createElement('div');
      bpm.textContent = t.bpm != null ? String(t.bpm) : '—';
      const key = document.createElement('div');
      key.textContent = t.camelot || t.key || '—';
      const actions = document.createElement('div');
      const open = document.createElement('button');
      open.className = 'ghost';
      open.textContent = 'Mostrar';
      open.onclick = () => window.ctk.shell.showItemInFolder(t.file);
      actions.appendChild(open);

      list.appendChild(title);
      list.appendChild(artist);
      list.appendChild(bpm);
      list.appendChild(key);
      list.appendChild(actions);
    }
    results.appendChild(list);
  }
}
