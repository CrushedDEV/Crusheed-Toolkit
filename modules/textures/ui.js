import { $, preventWindowDrop, formatBytes, escapeHtml, statusText, smallButton, dirname, pathOf, setProgress, ICON_UPLOAD } from '../shared.js';

const IMG_EXT = /\.(png|jpe?g|webp|bmp|gif)$/i;

const floorPow2 = (n) => 2 ** Math.floor(Math.log2(Math.max(1, n)));

// Target size: fit inside maxSize keeping aspect, then optionally snap each side down to a power of two
export function targetSize(w, h, maxSize, pow2) {
  const scale = Math.min(1, maxSize / Math.max(w, h));
  let tw = Math.max(1, Math.round(w * scale));
  let th = Math.max(1, Math.round(h * scale));
  if (pow2) { tw = floorPow2(tw); th = floorPow2(th); }
  return { w: tw, h: th };
}

// Halving steps avoid the aliasing a single big drawImage downscale produces
function resize(bitmap, w, h) {
  let src = bitmap, sw = bitmap.width, sh = bitmap.height;
  while (sw / 2 >= w && sh / 2 >= h) {
    const c = new OffscreenCanvas(Math.round(sw / 2), Math.round(sh / 2));
    const ctx = c.getContext('2d');
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(src, 0, 0, c.width, c.height);
    src = c; sw = c.width; sh = c.height;
  }
  const out = new OffscreenCanvas(w, h);
  const ctx = out.getContext('2d');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(src, 0, 0, w, h);
  return out;
}

function hasAlpha(canvas) {
  const ctx = canvas.getContext('2d');
  const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
  for (let i = 3; i < data.length; i += 4 * 7) if (data[i] < 255) return true;
  return false;
}

export function mountTexturesModule(root) {
  root.innerHTML = `
  <div class="card">
    <div id="tx-drop" class="dropzone" role="button" tabindex="0">
      ${ICON_UPLOAD}
      <div><strong>Suelta texturas aquí</strong> o haz clic para elegirlas</div>
      <div class="small">PNG, JPG, WEBP, BMP. Para Unity, VRChat o cualquier motor.</div>
      <input id="tx-input" type="file" multiple accept="image/*" style="display:none;" />
    </div>

    <div class="grid" style="grid-template-columns:160px 200px 160px minmax(0,1fr); align-items:end;">
      <div class="field">
        <div class="label">Tamaño máximo</div>
        <select id="tx-max">
          <option value="256">256 px</option>
          <option value="512">512 px</option>
          <option value="1024">1024 px</option>
          <option value="2048" selected>2048 px</option>
          <option value="4096">4096 px</option>
        </select>
      </div>
      <div class="field">
        <div class="label">Formato</div>
        <select id="tx-format">
          <option value="auto" selected>Auto (PNG si hay transparencia, si no JPG)</option>
          <option value="same">El mismo que el original</option>
          <option value="png">PNG</option>
          <option value="jpg">JPG</option>
        </select>
      </div>
      <div class="field">
        <div class="label">Calidad JPG</div>
        <select id="tx-q">
          <option value="0.95">95</option>
          <option value="0.9" selected>90</option>
          <option value="0.8">80</option>
        </select>
      </div>
      <label class="small" style="min-height:42px;"><input id="tx-pow2" type="checkbox" checked /> Forzar potencia de 2 (256, 512, 1024…)</label>
    </div>

    <div class="field">
      <div class="label">Guardar en</div>
      <div class="input-group">
        <input id="tx-out" type="text" placeholder="Por defecto: subcarpeta «optimized» junto a las imágenes" />
        <button id="tx-browse" class="ghost">Elegir…</button>
      </div>
    </div>

    <div class="actions">
      <button id="tx-run" class="primary">Optimizar</button>
      <button id="tx-clear" class="ghost">Vaciar</button>
    </div>
  </div>

  <div class="card">
    <div class="row" style="justify-content:space-between; margin-bottom:10px;">
      <h3 class="section-title" style="margin:0;">Texturas</h3>
      <span class="value-badge" id="tx-pct">0%</span>
    </div>
    <div class="progress"><div id="tx-bar"></div></div>
    <div id="tx-status" class="status" style="margin-top:12px;">Añade imágenes para empezar.</div>
    <div id="tx-list" class="well" style="max-height:420px; margin-top:12px; padding:0;"></div>
  </div>
  `;

  let items = []; // { file: File, path, before:{w,h,size}, after? }
  const list = $('#tx-list', root);
  const status = $('#tx-status', root);

  function render() {
    if (!items.length) { list.innerHTML = '<div class="empty">Sin imágenes.</div>'; return; }
    list.innerHTML = `<table class="data"><thead><tr><th>Archivo</th><th>Antes</th><th>Después</th><th>Ahorro</th></tr></thead><tbody>${items.map(it => `
      <tr>
        <td>${escapeHtml(it.file.name)}</td>
        <td class="small">${it.before ? `${it.before.w}×${it.before.h} · ${formatBytes(it.file.size)}` : '…'}</td>
        <td class="small">${it.error ? `<span class="warn">${escapeHtml(it.error)}</span>` : it.after ? `${it.after.w}×${it.after.h} · ${formatBytes(it.after.size)} · ${it.after.ext.toUpperCase()}` : '—'}</td>
        <td>${it.after ? `<b class="${it.after.size < it.file.size ? 'success' : 'warn'}">${Math.round((1 - it.after.size / it.file.size) * 100)}%</b>` : ''}</td>
      </tr>`).join('')}</tbody></table>`;
  }

  async function addFiles(files) {
    for (const f of files) {
      if (!IMG_EXT.test(f.name) || items.some(i => i.path === pathOf(f))) continue;
      const it = { file: f, path: pathOf(f) };
      items.push(it);
      try { const bmp = await createImageBitmap(f); it.before = { w: bmp.width, h: bmp.height }; bmp.close(); }
      catch { it.error = 'No se puede leer'; }
    }
    if (!$('#tx-out', root).value && items[0]?.path) $('#tx-out', root).value = `${dirname(items[0].path)}\\optimized`;
    status.textContent = `${items.length} imágenes.`;
    render();
  }

  const drop = $('#tx-drop', root), input = $('#tx-input', root);
  drop.addEventListener('click', () => input.click());
  drop.addEventListener('dragover', (e) => { e.preventDefault(); drop.classList.add('is-over'); });
  drop.addEventListener('dragleave', () => drop.classList.remove('is-over'));
  drop.addEventListener('drop', (e) => { e.preventDefault(); drop.classList.remove('is-over'); addFiles(Array.from(e.dataTransfer.files)); });
  input.addEventListener('change', () => { addFiles(Array.from(input.files || [])); input.value = ''; });
  const cleanupDrop = preventWindowDrop();

  $('#tx-browse', root).addEventListener('click', async () => {
    const d = await window.ctk.chooseDirectory();
    if (d) $('#tx-out', root).value = d;
  });
  $('#tx-clear', root).addEventListener('click', () => { items = []; $('#tx-out', root).value = ''; render(); });

  $('#tx-run', root).addEventListener('click', async (e) => {
    const todo = items.filter(i => !i.error);
    if (!todo.length) { statusText(status, 'Añade imágenes primero.', 'warn'); return; }
    const outDir = $('#tx-out', root).value.trim();
    if (!outDir) { statusText(status, 'Elige dónde guardar.', 'warn'); return; }
    const btn = e.currentTarget;
    btn.disabled = true;
    const maxSize = Number($('#tx-max', root).value);
    const pow2 = $('#tx-pow2', root).checked;
    const format = $('#tx-format', root).value;
    const quality = Number($('#tx-q', root).value);
    const entries = [];
    const used = new Set();
    for (let i = 0; i < todo.length; i++) {
      const it = todo[i];
      setProgress($('#tx-bar', root), $('#tx-pct', root), i / todo.length);
      status.textContent = `Procesando ${i + 1}/${todo.length} · ${it.file.name}`;
      try {
        const bmp = await createImageBitmap(it.file);
        const { w, h } = targetSize(bmp.width, bmp.height, maxSize, pow2);
        const canvas = resize(bmp, w, h);
        bmp.close();
        const origExt = it.file.name.split('.').pop().toLowerCase();
        let ext = format === 'same' ? (origExt === 'jpeg' ? 'jpg' : origExt) : format;
        if (format === 'auto') ext = hasAlpha(canvas) ? 'png' : 'jpg';
        if (!['png', 'jpg', 'webp'].includes(ext)) ext = 'png';
        const type = ext === 'jpg' ? 'image/jpeg' : `image/${ext}`;
        const blob = await canvas.convertToBlob({ type, quality: ext === 'png' ? undefined : quality });
        let name = `${it.file.name.replace(/\.[^.]+$/, '')}.${ext}`;
        for (let n = 2; used.has(name.toLowerCase()); n++) name = `${it.file.name.replace(/\.[^.]+$/, '')}-${n}.${ext}`;
        used.add(name.toLowerCase());
        entries.push({ name, data: new Uint8Array(await blob.arrayBuffer()) });
        it.after = { w, h, size: blob.size, ext };
        it.error = null;
      } catch (err) {
        it.error = err?.message || 'Error';
      }
      render();
    }
    const r = entries.length ? await window.ctk.file.writeMany({ dir: outDir, entries }) : { ok: false, error: 'Nada que guardar' };
    setProgress($('#tx-bar', root), $('#tx-pct', root), 1);
    btn.disabled = false;
    if (!r.ok) { statusText(status, `Error al guardar: ${r.error}`, 'warn'); return; }
    const before = todo.reduce((s, i) => s + (i.after ? i.file.size : 0), 0);
    const after = todo.reduce((s, i) => s + (i.after?.size || 0), 0);
    statusText(status, `${entries.length} texturas guardadas · ${formatBytes(before)} → ${formatBytes(after)}`, 'success');
    status.appendChild(smallButton('Abrir carpeta', () => window.ctk.shell.openPath(outDir)));
  });

  render();
  root._cleanup = cleanupDrop;
}
