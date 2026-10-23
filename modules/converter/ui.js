export function mountConverterModule(root){
  root.innerHTML = '';

  const card = document.createElement('div');
  card.className = 'card';
  card.innerHTML = `
    <div id="dropzone" class="dropzone" aria-label="Zona de soltar" role="button" tabindex="0">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M12 16V4m0 0L7.5 8.5M12 4l4.5 4.5M4 15v4a2 2 0 002 2h12a2 2 0 002-2v-4"/></svg>
      <div><strong>Suelta archivos aquí</strong> o haz clic para seleccionar</div>
      <div class="small">Imágenes (PNG, JPG, WEBP, AVIF) y documentos DOCX</div>
      <input id="files" type="file" accept="image/*,.docx" multiple style="display:none;" />
    </div>

    <div class="grid grid-3" id="img-options">
      <div id="img-panel" class="field" style="display:none;">
        <div class="label">Formato de salida</div>
        <select id="format">
          <option value="auto" selected>AUTO (el más ligero)</option>
          <option value="image/avif">AVIF</option>
          <option value="image/webp">WebP</option>
          <option value="image/jpeg">JPEG</option>
          <option value="image/png">PNG</option>
        </select>
      </div>
      <div id="img-quality" class="field" style="display:none;">
        <div class="label">Calidad (JPEG/WebP/AVIF)</div>
        <div class="slider-row">
          <input id="quality" type="range" min="0" max="100" value="85" />
          <span id="quality-val" class="value-badge">85</span>
        </div>
      </div>
      <div id="img-resize" class="field" style="display:none;">
        <div class="label">Redimensionar (px)</div>
        <div class="input-group">
          <input id="width" type="text" placeholder="Ancho" />
          <input id="height" type="text" placeholder="Alto" />
        </div>
        <label class="small" style="margin-top:8px;">
          <input id="keep-ar" type="checkbox" checked /> Mantener proporción
        </label>
      </div>
    </div>

    <div class="actions">
      <button class="primary" id="convert-all" style="display:none;">Convertir imágenes (ZIP)</button>
      <button class="ghost" id="preview" style="display:none;">Previsualizar primera imagen</button>
    </div>

    <div id="docx-panel" class="grid" style="display:none; grid-template-columns:240px auto; align-items:end; justify-content:start;">
      <div class="field">
        <div class="label">Convertir DOCX a</div>
        <select id="docx-target">
          <option value="pdf" selected>PDF</option>
          <option value="html">HTML</option>
        </select>
      </div>
      <div>
        <button class="ghost" id="docx-zip">Convertir todos los DOCX</button>
      </div>
    </div>

    <div class="grid grid-2">
      <div class="field">
        <div class="label">Archivos</div>
        <div id="file-list" class="well" style="max-height:220px;"></div>
      </div>
      <div class="field">
        <div class="label">Acciones por archivo</div>
        <div id="actions-list" class="well" style="max-height:220px;"></div>
      </div>
    </div>

    <div class="field">
      <div class="label">Previsualización</div>
      <div id="preview-area" class="row" style="gap:16px; align-items:flex-start;"><div class="small">Pulsa «Previsualizar» para ver el resultado.</div></div>
    </div>
  `;

  root.appendChild(card);

  const q = (sel)=>card.querySelector(sel);
  const input = q('#files');
  const dropzone = q('#dropzone');
  const fmt = q('#format');
  const quality = q('#quality');
  const qualityVal = q('#quality-val');
  const width = q('#width');
  const height = q('#height');
  const keep = q('#keep-ar');
  const btnPrev = q('#preview');
  const btnConvAll = q('#convert-all');
  const imgPanel = q('#img-panel');
  const imgQuality = q('#img-quality');
  const imgResize = q('#img-resize');
  const docxPanel = q('#docx-panel');
  const btnDocxZip = q('#docx-zip');
  const docxTargetSel = q('#docx-target');
  const area = q('#preview-area');
  const actionsList = q('#actions-list');
  const list = q('#file-list');

  let filesState = [];

  function fileToImage(file){
    return new Promise((res, rej)=>{
      const img = new Image();
      img.onload = ()=>res(img);
      img.onerror = rej;
      const reader = new FileReader();
      reader.onload = ()=>{ img.src = reader.result; };
      reader.readAsDataURL(file);
    });
  }

  function updatePanels(){
    const anyImg = filesState.some(isImageFile);
    const anyDocx = filesState.some(isDocxFile);
    // Image controls visibility
    [imgPanel, imgQuality, imgResize, btnPrev, btnConvAll].forEach(el => { if (el) el.style.display = anyImg ? '' : 'none'; });
    // DOCX panel visibility
    if (docxPanel) docxPanel.style.display = anyDocx ? '' : 'none';
  }

  // Real filesystem path of a dropped/selected File (File.path no longer exists in Electron 32+)
  async function ensureFilePath(f){
    const p = f ? window.ctk.getPathForFile(f) : null;
    if (p) return p;
    const chosen = await window.ctk.chooseFile([{ name: 'Documentos Word', extensions: ['docx'] }]);
    return chosen || null;
  }

  if (btnDocxZip){
    btnDocxZip.addEventListener('click', async ()=>{
      const docxFiles = filesState.filter(isDocxFile);
      if (!docxFiles.length) return;
      const outputs = [];
      for (const f of docxFiles){
        const p = await ensureFilePath(f);
        if (!p) continue;
        const target = (docxTargetSel && docxTargetSel.value) || 'pdf';
        if (target === 'pdf'){
          const res = await window.ctk.doc.docxToPdf(p);
          if (res?.ok && res.filePath) outputs.push(res.filePath);
          else alert(`No se pudo convertir ${f.name}: ${res?.error || 'error desconocido'}`);
        } else {
          const res = await window.ctk.doc.docxToHtml(p);
          if (res?.ok && res.html){
            const outPath = p.replace(/\.[^.]+$/, '') + '.html';
            // Guardar HTML mediante diálogo (como archivo .html)
            const saved = await window.ctk.file.save({
              title: 'Guardar HTML',
              defaultPath: outPath,
              filters: [{ name: 'HTML', extensions: ['html','htm'] }],
              dataBase64: btoa(unescape(encodeURIComponent(res.html)))
            });
            if (saved?.ok && saved.filePath) outputs.push(saved.filePath);
          }
        }
      }
      if (!outputs.length) return;
      // Abrir carpeta del primer resultado
      if (outputs[0]) window.ctk.shell.showItemInFolder(outputs[0]);
    });
  }

  function syncQualityBadge(){
    if (qualityVal) qualityVal.textContent = String(Math.max(0, Math.min(100, Number(quality.value)||0)));
  }

  function drawToCanvas(img, w, h){
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, 0, 0, w, h);
    return canvas;
  }

  function computeSize(img){
    let w = parseInt(width.value, 10);
    let h = parseInt(height.value, 10);
    if (!w && !h) return { w: img.naturalWidth, h: img.naturalHeight };
    if (w && h) return { w, h };
    if (w){
      const ratio = img.naturalHeight / img.naturalWidth;
      return { w, h: keep.checked ? Math.round(w * ratio) : img.naturalHeight };
    }
    if (h){
      const ratio = img.naturalWidth / img.naturalHeight;
      return { w: keep.checked ? Math.round(h * ratio) : img.naturalWidth, h };
    }
  }

  function toBlobAsync(canvas, type, q){
    return new Promise((res)=> canvas.toBlob(b => res(b), type, q));
  }

  async function convertWithStrategy(canvas, strategy){
    const q = Math.min(1, Math.max(0, Number(quality.value) / 100));
    const results = [];
    const tryTypes = strategy === 'auto'
      ? ['image/avif', 'image/webp', 'image/jpeg', 'image/png']
      : [strategy];

    for (const type of tryTypes){
      // Calidad aplica a AVIF/WEBP/JPEG; PNG ignora q
      const blob = await toBlobAsync(canvas, type, ['image/png'].includes(type) ? undefined : q);
      if (!blob) continue;
      results.push({ type, blob });
      if (strategy !== 'auto') break;
    }
    if (!results.length) return null;
    if (strategy === 'auto'){
      // Escoger el blob más pequeño
      results.sort((a,b)=> a.blob.size - b.blob.size);
      return results[0];
    }
    return results[0];
  }

  async function convertFileBest(file){
    const img = await fileToImage(file);
    const { w, h } = computeSize(img);
    const canvas = drawToCanvas(img, w, h);
    const strategy = fmt.value;
    const out = await convertWithStrategy(canvas, strategy);
    return out; // { type, blob }
  }

  function extFor(type){
    if (type === 'image/avif') return 'avif';
    if (type === 'image/webp') return 'webp';
    if (type === 'image/jpeg') return 'jpg';
    if (type === 'image/png') return 'png';
    return 'bin';
  }

  function renderList(files){
    list.innerHTML = '';
    if (!files || !files.length){
      list.innerHTML = '<div class="empty">No hay archivos seleccionados.</div>';
      return;
    }
    files.forEach((file, i)=>{
      const item = document.createElement('div');
      item.className = 'small muted';
      const type = file.type || (file.name.split('.').pop()||'').toLowerCase();
      item.textContent = `${file.name} — ${type || 'desconocido'} (${(file.size/1024).toFixed(1)} KB)`;
      list.appendChild(item);
    });
  }

  function isImageFile(file){
    return (file.type && file.type.startsWith('image/')) || /\.(png|jpe?g|webp|avif)$/i.test(file.name);
  }

  function isDocxFile(file){
    return /\.(docx)$/i.test(file.name);
  }

  function renderActions(files){
    actionsList.innerHTML = '';
    if (!files || !files.length){
      actionsList.innerHTML = '<div class="empty">Añade archivos para ver acciones disponibles.</div>';
      return;
    }
    files.forEach((file, idx)=>{
      const row = document.createElement('div');
      row.className = 'row';
      row.style.padding = '6px 2px';
      const name = document.createElement('div');
      name.className = 'small';
      name.style.flex = '1';
      name.textContent = file.name;
      row.appendChild(name);

      if (isImageFile(file)){
        const hint = document.createElement('div');
        hint.className = 'small muted';
        hint.textContent = 'Imagen: usa opciones de arriba para convertir/optimizar';
        row.appendChild(hint);
      } else if (isDocxFile(file)){
        const btnHtml = document.createElement('button');
        btnHtml.className = 'ghost sm';
        btnHtml.textContent = 'DOCX → HTML (vista)';
        btnHtml.onclick = async ()=>{
          const path = await pickFilePathIfNeeded(idx);
          if (!path) return;
          const res = await window.ctk.doc.docxToHtml(path);
          if (res?.ok){
            const win = window.open('', '_blank');
            if (win){ win.document.write(res.html); win.document.close(); }
          } else alert(`No se pudo convertir: ${res?.error || 'error desconocido'}`);
        };
        const btnPdf = document.createElement('button');
        btnPdf.className = 'ghost sm';
        btnPdf.textContent = 'DOCX → PDF (guardar)';
        btnPdf.onclick = async ()=>{
          const path = await pickFilePathIfNeeded(idx);
          if (!path) return;
          const res = await window.ctk.doc.docxToPdf(path);
          if (res?.ok && res.filePath){ window.ctk.shell.showItemInFolder(res.filePath); }
          else alert(`No se pudo convertir: ${res?.error || 'error desconocido'}`);
        };
        row.appendChild(btnHtml);
        row.appendChild(btnPdf);
      } else {
        const none = document.createElement('div');
        none.className = 'small muted';
        none.textContent = 'Sin acciones específicas (próximamente)';
        row.appendChild(none);
      }
      actionsList.appendChild(row);
    });
  }

  function pickFilePathIfNeeded(index){
    return ensureFilePath(filesState[index]);
  }

  btnPrev.addEventListener('click', async ()=>{
    area.innerHTML = '';
    if (!filesState.length) return;
    const firstImg = filesState.find(isImageFile);
    if (!firstImg) return;
    const out = await convertFileBest(firstImg);
    if (!out) return;
    const url = URL.createObjectURL(out.blob);
    const img = document.createElement('img');
    img.src = url; img.style.maxWidth = '320px'; img.style.borderRadius = '12px'; img.style.border = '1px solid var(--border)';
    const meta = document.createElement('div');
    meta.className = 'small muted';
    meta.textContent = `${extFor(out.type).toUpperCase()} • ${(out.blob.size/1024).toFixed(1)} KB`;
    area.appendChild(img);
    area.appendChild(meta);
  });

  btnConvAll.addEventListener('click', async ()=>{
    if (!filesState.length) return;
    const files = Array.from(filesState).filter(isImageFile);
    // The ZIP is built in the main process (jszip can't be imported from the renderer without a bundler)
    const entries = [];
    const usedNames = new Set();
    for (const f of files){
      const out = await convertFileBest(f);
      if (!out) continue;
      const nameNoExt = f.name.replace(/\.[^.]+$/, '');
      const ext = extFor(out.type);
      let name = `${nameNoExt}.${ext}`;
      for (let i = 2; usedNames.has(name); i++) name = `${nameNoExt}-${i}.${ext}`;
      usedNames.add(name);
      entries.push({ name, data: new Uint8Array(await out.blob.arrayBuffer()) });
    }
    if (!entries.length) { alert('No se pudo convertir ninguna imagen.'); return; }
    const r = await window.ctk.file.saveZip({ title: 'Guardar ZIP', defaultPath: 'converted_images.zip', entries });
    if (r?.ok && r.filePath) window.ctk.shell.showItemInFolder(r.filePath);
    else if (r && !r.ok && !r.canceled) alert(`No se pudo guardar el ZIP: ${r.error}`);
  });

  function setupDropzone(){
    function setHover(on){
      dropzone.classList.toggle('is-over', on);
    }
    dropzone.addEventListener('click', ()=> input.click());
    dropzone.addEventListener('keydown', (e)=>{ if (e.key==='Enter' || e.key===' ') { e.preventDefault(); input.click(); } });
    dropzone.addEventListener('dragover', (e)=>{ e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; setHover(true); });
    dropzone.addEventListener('dragleave', ()=> setHover(false));
    dropzone.addEventListener('drop', (e)=>{
      e.preventDefault(); setHover(false);
      const files = Array.from(e.dataTransfer.files);
      if (!files.length) return;
      filesState = files;
      renderList(filesState);
      renderActions(filesState);
      updatePanels();
    });
  }

  // Bind input and dropzone
  input.addEventListener('change', ()=> { filesState = Array.from(input.files || []); renderList(filesState); renderActions(filesState); updatePanels(); });
  setupDropzone();
  renderList(filesState);
  renderActions(filesState);
  updatePanels();

  // Bind quality slider updates
  if (quality) {
    quality.addEventListener('input', syncQualityBadge);
    syncQualityBadge();
  }

  // Prevent default drag&drop on window to avoid navigation replacing the app
  const preventWinDnD = (e)=>{ e.preventDefault(); };
  window.addEventListener('dragover', preventWinDnD);
  window.addEventListener('drop', preventWinDnD);
  root._cleanup = () => {
    window.removeEventListener('dragover', preventWinDnD);
    window.removeEventListener('drop', preventWinDnD);
  };
}
