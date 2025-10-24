const $ = (sel, root=document) => root.querySelector(sel);

export function mountYouTubeModule(root) {
  root.innerHTML = `
  <div class="card">
    <div class="label">URL del video</div>
    <input id="yt-url" type="text" placeholder="https://www.youtube.com/watch?v=..." />

    <div class="row" style="margin-top:12px;">
      <div style="flex:1;">
        <div class="label">Formato</div>
        <select id="yt-format">
          <option value="mp4">MP4 (video)</option>
          <option value="mp3">MP3 (audio)</option>
        </select>
      </div>
      <div style="flex:2;">
        <div class="label">Carpeta destino</div>
        <div class="row">
          <input id="yt-outdir" type="text" placeholder="Carpeta de descarga" />
          <button id="btn-browse" class="ghost">Buscar…</button>
        </div>
      </div>
      <div style="align-self:flex-end;">
        <button id="btn-download" class="primary">Descargar</button>
      </div>
    </div>

    <div style="margin-top:16px;">
      <div class="label">Progreso</div>
      <div class="row" style="align-items:center; gap:10px;">
        <div class="progress" style="flex:1;"><div id="yt-progress"></div></div>
        <span id="yt-percent" class="value-badge">0%</span>
      </div>
      <div id="yt-status" class="small" style="margin-top:8px;"></div>
    </div>
  </div>
  `;

  const urlInput = $('#yt-url', root);
  const fmtSelect = $('#yt-format', root);
  const outInput = $('#yt-outdir', root);
  const btnBrowse = $('#btn-browse', root);
  const btnDownload = $('#btn-download', root);
  const bar = $('#yt-progress', root);
  const percentBadge = $('#yt-percent', root);
  const status = $('#yt-status', root);

  // Defaults
  window.ctk.getDefaults().then(({ downloadsDir, ffmpegAvailable }) => {
    outInput.value = downloadsDir;
    if (!ffmpegAvailable) {
      const note = document.createElement('div');
      note.className = 'small warn';
      note.textContent = 'Para convertir a MP3 se requiere FFmpeg instalado en el sistema.';
      status.appendChild(note);
    }
  });

  const off = window.ctk.youtube.onProgress(({ percent }) => {
    if (typeof percent === 'number') {
      bar.style.width = Math.max(0, Math.min(100, percent)) + '%';
      const txt = `${percent.toFixed(1)}%`;
      status.textContent = `Descargando: ${txt}`;
      if (percentBadge) percentBadge.textContent = txt;
    }
  });

  btnBrowse.addEventListener('click', async () => {
    const d = await window.ctk.chooseDirectory();
    if (d) outInput.value = d;
  });

  btnDownload.addEventListener('click', async () => {
    const url = (urlInput.value || '').trim();
    const format = fmtSelect.value;
    const outputDir = (outInput.value || '').trim();

    if (!url) {
      status.textContent = 'Ingrese una URL válida.';
      return;
    }
    status.textContent = 'Iniciando descarga…';
    bar.style.width = '0%';

    const res = await window.ctk.youtube.download({ url, format, outputDir });
    if (res.ok) {
      status.innerHTML = `<span class="success">Completado</span>`;
      if (res.file) {
        const openBtn = document.createElement('button');
        openBtn.className = 'ghost';
        openBtn.style.marginLeft = '8px';
        openBtn.textContent = 'Mostrar en carpeta';
        openBtn.onclick = () => window.ctk.shell.showItemInFolder(res.file);
        status.appendChild(openBtn);

        // If MP3, allow direct analyze navigation
        if (String(res.file).toLowerCase().endsWith('.mp3')) {
          const analyzeBtn = document.createElement('button');
          analyzeBtn.className = 'ghost';
          analyzeBtn.style.marginLeft = '8px';
          analyzeBtn.textContent = 'Analizar BPM/Tonalidad';
          analyzeBtn.onclick = () => {
            const ev = new CustomEvent('ctk:navigate', { detail: { module: 'analyzer', params: { filePath: res.file } } });
            window.dispatchEvent(ev);
          };
          status.appendChild(analyzeBtn);
        }
      }
    } else {
      status.innerHTML = `<span class="warn">Error: ${res.error}</span>`;
    }
  });

  // cleanup when module is switched (optional in this simple setup)
  root._cleanup = () => off && off();
}
