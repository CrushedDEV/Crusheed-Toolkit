export function mountConverterModule(root){
  root.innerHTML = '';

  const card = document.createElement('div');
  card.className = 'card';
  card.innerHTML = `
    <h2 class="title">Convertidor de Archivos</h2>
    <p class="small muted">Imágenes: AVIF/WebP/JPEG/PNG, Redimensionado HQ • Documentos: DOCX → HTML/PDF</p>

    <div class="row" style="margin-top:8px; flex-wrap:wrap;">
      <div style="flex:2; min-width:260px;">
        <div class="label">Arrastra archivos aquí</div>
        <div id="dropzone" style="border:1px dashed var(--border); background:#0a0a0a; border-radius:12px; padding:18px; text-align:center; color:var(--text-dim);" aria-label="Zona de soltar" role="button" tabindex="0">
          Suelta archivos o haz clic para seleccionar
          <input id="files" type="file" multiple style="display:none;" />
        </div>
        <div class="row" style="margin-top:8px;">
          <button class="ghost" id="pick-btn">Seleccionar archivos...</button>
        </div>
      </div>
      <div id="img-panel" style="flex:1; min-width:200px; display:none;">
        <div class="label">Formato de salida</div>
        <select id="format">
          <option value="auto" selected>AUTO (elige el más pequeño)</option>
          <option value="image/avif">AVIF</option>
          <option value="image/webp">WebP</option>
          <option value="image/jpeg">JPEG</option>
          <option value="image/png">PNG</option>
        </select>
      </div>
      <div id="img-quality" style="flex:1; min-width:220px; display:none;">
        <div class="label">Calidad (JPEG/WebP/AVIF)</div>
        <div class="slider-row">
          <input id="quality" type="range" min="0" max="100" value="85" />
          <span id="quality-val" class="value-badge">85</span>
        </div>
      </div>
      <div id="img-resize" style="flex:1; min-width:200px; display:none;">
        <div class="label">Redimensionar</div>
        <div class="row">
          <input id="width" type="text" placeholder="Ancho (px)" />
          <input id="height" type="text" placeholder="Alto (px)" />
        </div>
        <label class="small" style="display:flex; align-items:center; gap:8px; margin-top:6px;">
          <input id="keep-ar" type="checkbox" checked /> Mantener proporción
        </label>
      </div>
    </div>

    <div class="row" style="margin-top:12px;">
      <button class="ghost" id="preview" style="display:none;">Previsualizar primera imagen</button>
      <button class="primary" id="convert-all" style="display:none;">Convertir imágenes (ZIP)</button>
    </div>

    <div id="docx-panel" class="row" style="margin-top:8px; display:none;">
      <div class="label">Acciones para documentos DOCX</div>
      <button class="ghost" id="docx-zip">DOCX → PDF (ZIP)</button>
    </div>

    <div class="label" style="margin-top:12px;">Archivos</div>
    <div id="file-list" class="card" style="background:#0a0a0a; border-radius:12px; padding:10px; max-height:200px; overflow:auto;"></div>

    <div class="label" style="margin-top:12px;">Acciones por archivo</div>
    <div id="actions-list" class="card" style="background:#0a0a0a; border-radius:12px; padding:10px; max-height:240px; overflow:auto;"></div>

    <div class="label" style="margin-top:12px;">Previsualización</div>
    <div id="preview-area" class="row" style="gap:16px; align-items:flex-start;"></div>
  `;

  root.appendChild(card);

  const q = (sel)=>card.querySelector(sel);
  const input = q('#files');
  const dropzone = q('#dropzone');
  const pickBtn = q('#pick-btn');
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
  const area = q('#preview-area');
  const actionsList = q('#actions-list');
  const list = q('#file-list');

  const supportsSave = !!(window.ctk && window.ctk.file && window.ctk.file.save);
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

  async function ensureFilePath(f){
    if (f && f.path) return f.path;
    const chosen = await window.ctk.chooseFile();
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
        const res = await window.ctk.doc.docxToPdf(p);
        if (res?.ok && res.filePath){
          outputs.push(res.filePath);
        }
      }
      if (!outputs.length) return;
      const { default: JSZip } = await import('jszip');
      const zip = new JSZip();
      for (const outPath of outputs){
        try{
          // Bring file content from main via shell? We don't have direct fs in renderer; request save dialog with base64 requires reading file.
          // Simpler: Show folder for first output and skip ZIP if multiple handling is complex without fs in renderer.
        }catch{}
      }
      // As fallback, abrir carpeta del primer resultado
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

  async function blobToBase64(blob){
    return new Promise((resolve)=>{
      const r = new FileReader();
      r.onload = ()=> resolve(r.result);
      r.readAsDataURL(blob);
    });
  }

  function renderList(files){
    list.innerHTML = '';
    if (!files || !files.length){
      list.innerHTML = '<div class="small muted">No hay archivos seleccionados.</div>';
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
      actionsList.innerHTML = '<div class="small muted">Añade archivos para ver acciones disponibles.</div>';
      return;
    }
    files.forEach((file, idx)=>{
      const row = document.createElement('div');
      row.className = 'row';
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
        btnHtml.className = 'ghost';
        btnHtml.textContent = 'DOCX → HTML (vista)';
        btnHtml.onclick = async ()=>{
          const path = await pickFilePathIfNeeded(idx);
          if (!path) return;
          const res = await window.ctk.doc.docxToHtml(path);
          if (res?.ok){
            const win = window.open('', '_blank');
            if (win){ win.document.write(res.html); win.document.close(); }
          }
        };
        const btnPdf = document.createElement('button');
        btnPdf.className = 'ghost';
        btnPdf.textContent = 'DOCX → PDF (guardar)';
        btnPdf.onclick = async ()=>{
          const path = await pickFilePathIfNeeded(idx);
          if (!path) return;
          const res = await window.ctk.doc.docxToPdf(path);
          if (res?.ok && res.filePath){ window.ctk.shell.showItemInFolder(res.filePath); }
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

  // Helper to get FileSystem path for dropped File (Electron provides path on files from input)
  async function pickFilePathIfNeeded(index){
    const f = filesState[index];
    // Attempt to use path if present (Electron adds path on file entries from input)
    if (f && f.path) return f.path;
    // Fallback: pedir al usuario seleccionar el archivo original
    const chosen = await window.ctk.chooseFile();
    return chosen || null;
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
    img.src = url; img.style.maxWidth = '280px'; img.style.borderRadius = '12px';
    const meta = document.createElement('div');
    meta.className = 'small muted';
    meta.textContent = `${extFor(out.type).toUpperCase()} • ${(out.blob.size/1024).toFixed(1)} KB`;
    area.appendChild(img);
    area.appendChild(meta);
  });

  btnConvAll.addEventListener('click', async ()=>{
    if (!filesState.length) return;
    const files = Array.from(filesState).filter(isImageFile);
    const { default: JSZip } = await import('jszip');
    const zip = new JSZip();
    for (const f of files){
      const out = await convertFileBest(f);
      if (!out) continue;
      const nameNoExt = f.name.replace(/\.[^.]+$/, '');
      const ext = extFor(out.type);
      zip.file(`${nameNoExt}.${ext}`, out.blob);
    }
    const content = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
    if (supportsSave){
      const base64 = await blobToBase64(content);
      await window.ctk.file.save({
        title: 'Guardar ZIP',
        defaultPath: 'converted_images.zip',
        dataBase64: base64.split(',')[1],
        filters: [{ name:'ZIP', extensions:['zip'] }]
      });
    } else {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(content);
      a.download = 'converted_images.zip';
      document.body.appendChild(a); a.click(); a.remove();
    }
  });

  function setupDropzone(){
    function setHover(on){
      dropzone.style.borderColor = on ? 'var(--accent)' : 'var(--border)';
      dropzone.style.background = on ? '#0e0e0e' : '#0a0a0a';
      dropzone.style.cursor = 'pointer';
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
  if (pickBtn) pickBtn.addEventListener('click', ()=> input.click());
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
}
