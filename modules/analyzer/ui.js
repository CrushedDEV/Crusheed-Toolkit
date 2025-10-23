const $ = (sel, root=document) => root.querySelector(sel);

export function mountAnalyzerModule(root, params={}) {
  root.innerHTML = `
  <div class="card">
    <div class="label">Archivo de audio (MP3 recomendado)</div>
    <div class="row">
      <input id="az-file" type="text" placeholder="Selecciona un archivo .mp3" />
      <button id="az-browse" class="ghost">Elegir archivo…</button>
    </div>

    <div class="row" style="margin-top:12px;">
      <button id="az-analyze" class="primary">Analizar BPM y tonalidad</button>
      <div id="az-status" class="small"></div>
    </div>

    <div style="margin-top:16px;" id="az-results" hidden>
      <div class="row">
        <div class="card" style="flex:1;">
          <div class="label">BPM</div>
          <div id="az-bpm" class="title">—</div>
        </div>
        <div class="card" style="flex:1;">
          <div class="label">Tonalidad</div>
          <div id="az-key" class="title">—</div>
        </div>
      </div>
      <div class="row" style="margin-top:12px;">
        <button id="az-write" class="ghost">Escribir en metadatos ID3</button>
      </div>
    </div>
  </div>
  `;

  const fileInput = $('#az-file', root);
  const btnBrowse = $('#az-browse', root);
  const btnAnalyze = $('#az-analyze', root);
  const status = $('#az-status', root);
  const results = $('#az-results', root);
  const bpmEl = $('#az-bpm', root);
  const keyEl = $('#az-key', root);
  const btnWrite = $('#az-write', root);

  if (params.filePath) {
    fileInput.value = params.filePath;
  }

  btnBrowse.addEventListener('click', async () => {
    const f = await window.ctk.chooseFile();
    if (f) fileInput.value = f;
  });

  let lastResult = null;

  btnAnalyze.addEventListener('click', async () => {
    const fp = (fileInput.value || '').trim();
    if (!fp) { status.textContent = 'Selecciona un archivo.'; return; }
    status.textContent = 'Analizando… esto puede tardar unos segundos';
    results.hidden = true;
    const res = await window.ctk.audio.analyze(fp);
    if (res.ok) {
      const { bpm, key, confidence } = res.result || {};
      lastResult = { bpm, key };
      bpmEl.textContent = bpm ? String(bpm) : '—';
      keyEl.textContent = key ? String(key) : '—';
      results.hidden = false;
      status.textContent = confidence ? `Confianza estimada: ${(confidence*100).toFixed(0)}%` : '';
    } else {
      status.textContent = `Error: ${res.error}`;
    }
  });

  btnWrite.addEventListener('click', async () => {
    const fp = (fileInput.value || '').trim();
    if (!fp) { status.textContent = 'Selecciona un archivo.'; return; }
    if (!lastResult) { status.textContent = 'Primero analiza el archivo.'; return; }
    const r = await window.ctk.audio.writeTags({ filePath: fp, ...lastResult });
    status.textContent = r.ok ? 'Metadatos escritos correctamente.' : `Error: ${r.error}`;
  });
}
