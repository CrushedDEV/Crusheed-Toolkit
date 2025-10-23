export function mountMcManifestModule(root) {
  root.innerHTML = '';

  const card = document.createElement('div');
  card.className = 'card';

  card.innerHTML = `
    <h2 class="title">Visor de manifest.json</h2>
    <p class="small muted">Pega el contenido de <code>manifest.json</code> (packs de recursos/behavior) o cárgalo desde archivo. Valida y explora campos clave.</p>

    <div class="row" style="margin-top:8px; align-items:flex-start;">
      <div style="flex:1; min-width:280px;">
        <div class="label">Contenido JSON</div>
        <textarea id="mf-src" style="width:100%; height:180px; background:#0a0a0a; color:var(--text); border:1px solid var(--border); border-radius:12px; padding:10px; resize:vertical;"></textarea>
        <div class="row" style="margin-top:8px;">
          <input type="file" id="mf-file" accept=".json" />
          <button class="ghost" id="mf-load">Cargar</button>
          <button class="primary" id="mf-parse">Analizar</button>
        </div>
      </div>
    </div>

    <div class="row" style="margin-top:12px; align-items:flex-start;">
      <div style="flex:1; min-width:280px;">
        <div class="label">Resultado</div>
        <div id="mf-result" class="card" style="background:#0a0a0a; border-radius:12px; padding:8px;"></div>
        <div class="row" style="margin-top:8px;">
          <button class="ghost" id="mf-reset">Reset</button>
          <button class="primary" id="mf-pretty">Descargar pretty JSON</button>
        </div>
      </div>
    </div>
  `;

  root.appendChild(card);

  const src = card.querySelector('#mf-src');
  const file = card.querySelector('#mf-file');
  const btnLoad = card.querySelector('#mf-load');
  const btnParse = card.querySelector('#mf-parse');
  const btnReset = card.querySelector('#mf-reset');
  const btnPretty = card.querySelector('#mf-pretty');
  const result = card.querySelector('#mf-result');

  let obj = null;

  function safeParse(text){
    try { return JSON.parse(text); } catch { return null; }
  }

  function render(obj){
    result.innerHTML = '';
    if (!obj){
      result.innerHTML = '<p class="small warn" style="margin:8px;">JSON inválido o vacío.</p>';
      return;
    }
    const info = document.createElement('div');
    info.className = 'row';
    info.style.flexDirection = 'column';

    const name = obj.header?.name ?? obj.name ?? 'Desconocido';
    const ver = Array.isArray(obj.header?.version) ? obj.header.version.join('.') : (obj.version ?? '');
    const uuid = obj.header?.uuid ?? obj.uuid ?? '';
    const minEng = obj.header?.min_engine_version ? (Array.isArray(obj.header.min_engine_version) ? obj.header.min_engine_version.join('.') : obj.header.min_engine_version) : '';
    const modules = Array.isArray(obj.modules) ? obj.modules : [];

    const fields = [
      ['Nombre', name],
      ['Versión', ver],
      ['UUID', uuid],
      ['Min Engine', minEng],
      ['Módulos', modules.length ? modules.map(m => `${m.type || 'type?'} ${Array.isArray(m.version)?m.version.join('.'):(m.version||'')}`).join(', ') : '—']
    ];

    fields.forEach(([k, v]) => {
      const row = document.createElement('div');
      row.className = 'row';
      row.style.margin = '4px 0';
      const lk = document.createElement('div');
      lk.className = 'small muted';
      lk.textContent = k;
      lk.style.minWidth = '120px';
      const vv = document.createElement('div');
      vv.textContent = String(v || '');
      row.appendChild(lk); row.appendChild(vv);
      info.appendChild(row);
    });

    const pre = document.createElement('pre');
    pre.style.marginTop = '8px';
    pre.style.whiteSpace = 'pre-wrap';
    pre.style.wordBreak = 'break-word';
    pre.textContent = JSON.stringify(obj, null, 2);

    result.appendChild(info);
    result.appendChild(pre);
  }

  btnLoad.addEventListener('click', () => {
    if (!file.files || !file.files[0]) return;
    const f = file.files[0];
    const reader = new FileReader();
    reader.onload = () => { src.value = reader.result; };
    reader.readAsText(f);
  });

  btnParse.addEventListener('click', () => {
    obj = safeParse(src.value || '');
    render(obj);
  });

  btnPretty.addEventListener('click', () => {
    if (!obj) return;
    const text = JSON.stringify(obj, null, 2);
    const blob = new Blob([text], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'manifest.pretty.json';
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
  });

  btnReset.addEventListener('click', () => {
    obj = null;
    src.value = '';
    file.value = '';
    result.innerHTML = '';
  });
}
