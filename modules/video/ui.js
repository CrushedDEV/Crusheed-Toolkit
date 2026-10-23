import { $, $$, setupDropzone, preventWindowDrop, createJobPanel, formatBytes, formatDuration, basename, smallButton, statusText, ICON_UPLOAD } from '../shared.js';

const VIDEO_EXT = /\.(mp4|mkv|mov|webm|avi|m4v|wmv|flv|ts)$/i;

export function mountVideoModule(root) {
  root.innerHTML = `
  <div class="card">
    <div id="vd-drop" class="dropzone" role="button" tabindex="0">
      ${ICON_UPLOAD}
      <div><strong>Suelta un vídeo aquí</strong> o haz clic para elegirlo</div>
      <div class="small" id="vd-file">MP4, MKV, MOV, WEBM…</div>
      <input id="vd-input" type="file" accept="video/*,.mkv" style="display:none;" />
    </div>
    <div id="vd-facts" class="facts" hidden></div>

    <div class="segmented" id="vd-mode">
      <button data-mode="compress" class="active">Comprimir para Discord</button>
      <button data-mode="gif">Crear GIF</button>
    </div>

    <div id="vd-compress">
      <div class="grid" style="grid-template-columns:minmax(0,1fr) 170px 150px;">
        <div class="field">
          <div class="label">Tamaño máximo</div>
          <div class="row" style="gap:8px; flex-wrap:nowrap;">
            <div class="segmented" id="vd-size">
              <button data-mb="10" class="active">10 MB</button>
              <button data-mb="50">50 MB</button>
              <button data-mb="500">500 MB</button>
            </div>
            <input id="vd-size-custom" type="number" min="1" step="1" placeholder="Otro (MB)" style="max-width:120px;" />
          </div>
          <div class="small" style="margin-top:6px;">10 MB: Discord gratis · 50 MB: Nitro Basic · 500 MB: Nitro</div>
        </div>
        <div class="field">
          <div class="label">Resolución</div>
          <select id="vd-height">
            <option value="auto" selected>Automática</option>
            <option value="1080">1080p</option>
            <option value="720">720p</option>
            <option value="480">480p</option>
            <option value="360">360p</option>
          </select>
        </div>
        <div class="field">
          <div class="label">Audio</div>
          <select id="vd-audio">
            <option value="64">64 kbps</option>
            <option value="96" selected>96 kbps</option>
            <option value="128">128 kbps</option>
          </select>
        </div>
      </div>
    </div>

    <div id="vd-gif" hidden>
      <div class="grid" style="grid-template-columns:repeat(2, 200px);">
        <div class="field">
          <div class="label">Ancho</div>
          <select id="gif-width">
            <option value="320">320 px</option>
            <option value="480" selected>480 px</option>
            <option value="640">640 px</option>
            <option value="800">800 px</option>
          </select>
        </div>
        <div class="field">
          <div class="label">Fotogramas por segundo</div>
          <select id="gif-fps">
            <option value="10">10 fps</option>
            <option value="15" selected>15 fps</option>
            <option value="20">20 fps</option>
            <option value="25">25 fps</option>
          </select>
        </div>
      </div>
    </div>

    <div class="grid" style="grid-template-columns:repeat(2, 160px) minmax(0,1fr); align-items:end;">
      <div class="field">
        <div class="label">Recortar desde</div>
        <input id="vd-start" type="text" placeholder="0:00" />
      </div>
      <div class="field">
        <div class="label">Hasta</div>
        <input id="vd-end" type="text" placeholder="final" />
      </div>
      <div class="small" style="padding-bottom:12px;">Formato: segundos, m:ss o h:mm:ss. Vacío = sin recortar.</div>
    </div>

    <div class="actions">
      <button id="vd-run" class="primary">Comprimir</button>
    </div>
  </div>

  <div class="card" id="vd-progress"></div>
  `;

  let input = null;
  let info = null;
  let mode = 'compress';
  let sizeMB = 10;

  const drop = $('#vd-drop', root);
  const facts = $('#vd-facts', root);
  const runBtn = $('#vd-run', root);
  const panel = createJobPanel($('#vd-progress', root), { idleText: 'Elige un vídeo para empezar.' });

  async function loadFile(p) {
    input = p;
    info = null;
    $('#vd-file', root).textContent = basename(p);
    facts.hidden = false;
    facts.innerHTML = '<span class="fact">Leyendo…</span>';
    const r = await window.ctk.media.info(p);
    if (!r.ok) { facts.innerHTML = ''; statusText(panel.msg, `Error: ${r.error}`, 'warn'); return; }
    info = r.info;
    facts.innerHTML = '';
    const add = (k, v) => { const s = document.createElement('span'); s.className = 'fact'; s.innerHTML = `${k} <b></b>`; s.querySelector('b').textContent = v; facts.appendChild(s); };
    add('Duración', formatDuration(info.duration));
    if (info.width) add('Resolución', `${info.width}×${info.height}`);
    if (info.fps) add('FPS', String(Math.round(info.fps)));
    add('Audio', info.hasAudio ? 'sí' : 'no');
    panel.msg.textContent = 'Listo.';
  }

  setupDropzone(drop, $('#vd-input', root), (paths) => loadFile(paths[0]), { accept: VIDEO_EXT });
  const cleanupDrop = preventWindowDrop();

  $$('#vd-mode button', root).forEach(b => b.addEventListener('click', () => {
    mode = b.dataset.mode;
    $$('#vd-mode button', root).forEach(x => x.classList.toggle('active', x === b));
    $('#vd-compress', root).hidden = mode !== 'compress';
    $('#vd-gif', root).hidden = mode !== 'gif';
    runBtn.textContent = mode === 'gif' ? 'Crear GIF' : 'Comprimir';
  }));

  $$('#vd-size button', root).forEach(b => b.addEventListener('click', () => {
    sizeMB = Number(b.dataset.mb);
    $('#vd-size-custom', root).value = '';
    $$('#vd-size button', root).forEach(x => x.classList.toggle('active', x === b));
  }));
  $('#vd-size-custom', root).addEventListener('input', (e) => {
    const v = Number(e.target.value);
    if (v > 0) { sizeMB = v; $$('#vd-size button', root).forEach(x => x.classList.remove('active')); }
  });

  runBtn.addEventListener('click', async () => {
    if (!input) { statusText(panel.msg, 'Primero elige un vídeo.', 'warn'); return; }
    if (panel.busy) return;
    runBtn.disabled = true;
    const start = $('#vd-start', root).value.trim();
    const end = $('#vd-end', root).value.trim();
    const res = await panel.run((jobId) => mode === 'gif'
      ? window.ctk.media.makeGif({ jobId, input, start, end, width: $('#gif-width', root).value, fps: $('#gif-fps', root).value })
      : window.ctk.media.compressVideo({ jobId, input, start, end, targetMB: sizeMB, maxHeight: $('#vd-height', root).value, audioKbps: $('#vd-audio', root).value }));
    runBtn.disabled = false;
    if (res?.ok) {
      const detail = mode === 'gif'
        ? `GIF creado · ${formatBytes(res.size)}`
        : `Listo · ${formatBytes(res.size)} · ${res.height}p${res.fits ? '' : ' · ¡ojo! se ha pasado un poco del límite, prueba un tamaño algo menor'}`;
      statusText(panel.msg, detail, res.fits === false ? 'warn' : 'success');
      panel.msg.appendChild(smallButton('Mostrar', () => window.ctk.shell.showItemInFolder(res.file)));
    }
  });

  root._cleanup = () => { panel.dispose(); cleanupDrop(); };
}
