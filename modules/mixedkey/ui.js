const $ = (sel, root=document) => root.querySelector(sel);

export function mountMixedKeyModule(root) {
  root.innerHTML = `
  <div class="card">
    <div class="grid" style="grid-template-columns:minmax(0,1fr) 240px; align-items:start;">
      <div class="field">
        <div class="label">Carpeta de tu librería</div>
        <div class="input-group">
          <input id="mk-folder" type="text" placeholder="Selecciona una carpeta con tu música" />
          <button id="mk-browse" class="ghost">Elegir carpeta…</button>
        </div>
        <div class="small" style="margin-top:6px;">El escaneo incluye todas las subcarpetas.</div>
      </div>
      <div class="field">
        <div class="label">Tolerancia BPM (±)</div>
        <div class="slider-row" style="min-height:40px;">
          <input id="mk-tol" type="range" value="3" min="0" max="10" step="1" />
          <span id="mk-tol-val" class="value-badge">3</span>
        </div>
      </div>
    </div>
    <div class="actions">
      <button id="mk-scan" class="primary">Escanear librería</button>
      <div id="mk-status" class="status"></div>
    </div>
  </div>

  <div class="card">
    <div class="grid grid-2">
      <div class="field">
        <div class="label">Pista de referencia</div>
        <select id="mk-ref"></select>
      </div>
      <div class="field" style="position:relative;">
        <div class="label">Buscar (título o artista)</div>
        <input id="mk-filter" type="text" placeholder="Escribe para filtrar…" />
        <div id="mk-suggest" class="card" style="position:absolute; top:100%; left:0; right:0; display:none; max-height:240px; overflow:auto; margin-top:6px; z-index:10; padding:6px; background:#0d0d10;"></div>
      </div>
    </div>
    <div class="actions">
      <button id="mk-recomend" class="ghost">Ver compatibles</button>
    </div>
  </div>

  <div id="mk-results"></div>
  `;

  const folderInput = $('#mk-folder', root);
  const btnBrowse = $('#mk-browse', root);
  const btnScan = $('#mk-scan', root);
  const tolInput = $('#mk-tol', root);
  const tolVal = $('#mk-tol-val', root);
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

  // Sync tolerance badge
  function syncTol(){
    if (tolVal) tolVal.textContent = String(Math.max(0, Math.min(10, parseInt(tolInput.value||'3',10))));
  }
  if (tolInput){
    tolInput.addEventListener('input', syncTol);
    syncTol();
  }

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
      row.className = 'nav-item';
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
  const onDocClick = (e) => {
    if (!suggestBox.contains(e.target) && e.target !== filterInput) {
      suggestBox.style.display = 'none';
    }
  };
  document.addEventListener('click', onDocClick);
  root._cleanup = () => document.removeEventListener('click', onDocClick);

  btnRecomend.addEventListener('click', async () => {
    const referenceFile = refSelect.value;
    if (!referenceFile) { status.textContent = 'Elige una pista de referencia.'; return; }
    const bpmTolerance = Math.max(0, parseInt(tolInput.value || '3', 10));
    const r = await window.ctk.library.recommend({ tracks, referenceFile, bpmTolerance });
    if (!r.ok) { status.textContent = `Error: ${r.error}`; return; }
    renderRecommendations(r.recommendations || []);
  });

  function renderRecommendations(recs) {
    results.innerHTML = '';
    const card = document.createElement('div');
    card.className = 'card';
    results.appendChild(card);
    if (!recs.length) {
      card.innerHTML = '<div class="empty">No se encontraron pistas compatibles con los criterios.</div>';
      return;
    }
    const head = document.createElement('div');
    head.className = 'row';
    head.style.justifyContent = 'space-between';
    head.innerHTML = '<h3 class="section-title">Pistas compatibles</h3><span class="small">Ordenadas por BPM más cercano</span>';
    card.appendChild(head);

    const table = document.createElement('table');
    table.className = 'data';
    table.innerHTML = '<thead><tr><th>Título</th><th>Artista</th><th>BPM</th><th>Camelot</th><th></th></tr></thead>';
    const tbody = document.createElement('tbody');
    for (const t of recs) {
      const tr = document.createElement('tr');
      for (const v of [t.title || '—', t.artist || '—', t.bpm != null ? String(t.bpm) : '—', t.camelot || t.key || '—']) {
        const td = document.createElement('td');
        td.textContent = v;
        tr.appendChild(td);
      }
      const tdAct = document.createElement('td');
      tdAct.className = 'actions-cell';
      const open = document.createElement('button');
      open.className = 'ghost sm';
      open.textContent = 'Mostrar';
      open.onclick = () => window.ctk.shell.showItemInFolder(t.file);
      tdAct.appendChild(open);
      tr.appendChild(tdAct);
      tbody.appendChild(tr);
    }
    table.appendChild(tbody);
    card.appendChild(table);
  }
}
