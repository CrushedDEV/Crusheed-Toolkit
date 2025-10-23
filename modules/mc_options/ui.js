export function mountMcOptionsModule(root) {
  root.innerHTML = '';

  const card = document.createElement('div');
  card.className = 'card';

  card.innerHTML = `
    <h2 class="title">Editor de options.txt</h2>
    <p class="small muted">Pega el contenido de tu <code>options.txt</code> o cárgalo desde archivo. Edita y exporta.</p>

    <div class="row" style="margin-top:8px; align-items:flex-start;">
      <div style="flex:1; min-width:280px;">
        <div class="label">Contenido options.txt</div>
        <textarea id="opt-src" style="width:100%; height:180px; background:#0a0a0a; color:var(--text); border:1px solid var(--border); border-radius:12px; padding:10px; resize:vertical;"></textarea>
        <div class="row" style="margin-top:8px;">
          <input type="file" id="opt-file" accept=".txt" />
          <button class="ghost" id="opt-load">Cargar</button>
          <button class="primary" id="opt-parse">Analizar</button>
        </div>
      </div>
    </div>

    <div class="row" style="margin-top:12px; align-items:flex-start;">
      <div style="flex:1; min-width:280px;">
        <div class="label">Parámetros detectados</div>
        <div id="opt-table" class="card" style="background:#0a0a0a; border-radius:12px; padding:8px;"></div>
        <div class="row" style="margin-top:8px;">
          <button class="ghost" id="opt-reset">Reset</button>
          <button class="primary" id="opt-export">Exportar options.txt</button>
        </div>
      </div>
    </div>
  `;

  root.appendChild(card);

  const src = card.querySelector('#opt-src');
  const file = card.querySelector('#opt-file');
  const btnLoad = card.querySelector('#opt-load');
  const btnParse = card.querySelector('#opt-parse');
  const btnExport = card.querySelector('#opt-export');
  const btnReset = card.querySelector('#opt-reset');
  const table = card.querySelector('#opt-table');

  let state = {};

  function parseOptions(text) {
    const out = {};
    text.split(/\r?\n/).forEach(line => {
      const t = line.trim();
      if (!t || t.startsWith('#')) return;
      const i = t.indexOf(':');
      const j = t.indexOf('=');
      // options.txt usa key:value o key:value? Algunas builds usan ':'; otras '='
      let sep = ':';
      if (j > -1 && (i === -1 || j < i)) sep = '=';
      const idx = t.indexOf(sep);
      if (idx === -1) return;
      const k = t.slice(0, idx).trim();
      const v = t.slice(idx + 1).trim();
      if (k) out[k] = v;
    });
    return out;
  }

  function renderTable(data) {
    table.innerHTML = '';
    const keys = Object.keys(data).sort();
    if (!keys.length) {
      table.innerHTML = '<p class="small muted" style="margin:8px;">No hay parámetros. Analiza primero.</p>';
      return;
    }
    keys.forEach(key => {
      const row = document.createElement('div');
      row.className = 'row';
      row.style.margin = '6px 0';

      const k = document.createElement('input');
      k.type = 'text'; k.value = key; k.disabled = true; k.style.flex = '1';

      const v = document.createElement('input');
      v.type = 'text'; v.value = data[key]; v.style.flex = '1';
      v.addEventListener('input', () => { state[key] = v.value; });

      row.appendChild(k);
      row.appendChild(v);
      table.appendChild(row);
    });
  }

  function serializeOptions(data) {
    // Conservar separador ':' como por defecto
    return Object.entries(data).map(([k, v]) => `${k}:${v}`).join('\n');
  }

  btnLoad.addEventListener('click', () => {
    if (!file.files || !file.files[0]) return;
    const f = file.files[0];
    const reader = new FileReader();
    reader.onload = () => { src.value = reader.result; };
    reader.readAsText(f);
  });

  btnParse.addEventListener('click', () => {
    state = parseOptions(src.value || '');
    renderTable(state);
  });

  btnExport.addEventListener('click', () => {
    const text = serializeOptions(state);
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'options.txt';
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
  });

  btnReset.addEventListener('click', () => {
    state = {};
    table.innerHTML = '';
    src.value = '';
    file.value = '';
  });
}
