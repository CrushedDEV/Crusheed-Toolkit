export function mountConverterModule(root){
  root.innerHTML = '';

  const card = document.createElement('div');
  card.className = 'card';
  card.innerHTML = `
    <h2 class="title">Conversor/Optimizador de Imágenes</h2>
    <p class="small muted">AVIF/WebP/JPEG/PNG • Redimensionado HQ • Guardado fiable mediante diálogo del sistema.</p>

    <div class="row" style="margin-top:8px; flex-wrap:wrap;">
      <div style="flex:2; min-width:260px;">
        <div class="label">Arrastra imágenes aquí</div>
        <div id="dropzone" style="border:1px dashed var(--border); background:#0a0a0a; border-radius:12px; padding:18px; text-align:center; color:var(--text-dim);" aria-label="Zona de soltar" role="button" tabindex="0">
          Suelta imágenes o haz clic para seleccionar
          <input id="files" type="file" accept="image/*" multiple style="display:none;" />
        </div>
        <div class="row" style="margin-top:8px;">
          <button class="ghost" id="pick-btn">Seleccionar imágenes...</button>
        </div>
      </div>
      <div style="flex:1; min-width:200px;">
        <div class="label">Formato de salida</div>
        <select id="format">
          <option value="auto" selected>AUTO (elige el más pequeño)</option>
          <option value="image/avif">AVIF</option>
          <option value="image/webp">WebP</option>
          <option value="image/jpeg">JPEG</option>
          <option value="image/png">PNG</option>
        </select>
      </div>
      <div style="flex:1; min-width:160px;">
        <div class="label">Calidad (JPEG/WebP/AVIF)</div>
        <input id="quality" type="range" min="0" max="100" value="85" />
      </div>
      <div style="flex:1; min-width:200px;">
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
      <button class="ghost" id="preview">Previsualizar primera imagen</button>
      <button class="primary" id="convert-all">Convertir todo (ZIP)</button>
    </div>

    <div class="label" style="margin-top:12px;">Archivos</div>
    <div id="file-list" class="card" style="background:#0a0a0a; border-radius:12px; padding:10px; max-height:260px; overflow:auto;"></div>

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
  const width = q('#width');
  const height = q('#height');
  const keep = q('#keep-ar');
  const btnPrev = q('#preview');
  const btnConvAll = q('#convert-all');
  const area = q('#preview-area');
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
      item.textContent = `${file.name} (${(file.size/1024).toFixed(1)} KB)`;
      list.appendChild(item);
    });
  }

  btnPrev.addEventListener('click', async ()=>{
    area.innerHTML = '';
    if (!filesState.length) return;
    const out = await convertFileBest(filesState[0]);
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
    const files = Array.from(filesState);
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
      const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('image/'));
      if (!files.length) return;
      filesState = files;
      renderList(filesState);
    });
  }

  // Bind input and dropzone
  input.addEventListener('change', ()=> { filesState = Array.from(input.files || []); renderList(filesState); });
  if (pickBtn) pickBtn.addEventListener('click', ()=> input.click());
  setupDropzone();
  renderList(filesState);

  // Prevent default drag&drop on window to avoid navigation replacing the app
  const preventWinDnD = (e)=>{ e.preventDefault(); };
  window.addEventListener('dragover', preventWinDnD);
  window.addEventListener('drop', preventWinDnD);
}
