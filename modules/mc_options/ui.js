import { $, escapeHtml, statusText } from '../shared.js';

// Friendly names for the settings people actually tweak
const LABELS = {
  fov: 'Campo de visión (FOV)', renderDistance: 'Distancia de renderizado', simulationDistance: 'Distancia de simulación',
  maxFps: 'FPS máximos', enableVsync: 'VSync', gamma: 'Brillo (gamma)', guiScale: 'Escala de la interfaz',
  fullscreen: 'Pantalla completa', graphicsMode: 'Gráficos', particles: 'Partículas', entityShadows: 'Sombras de entidades',
  mouseSensitivity: 'Sensibilidad del ratón', rawMouseInput: 'Entrada de ratón directa', lang: 'Idioma',
  soundCategory_master: 'Volumen general', soundCategory_music: 'Volumen música', chatScale: 'Escala del chat',
  autoJump: 'Salto automático', bobView: 'Balanceo de la cámara', darkMojangStudiosBackground: 'Fondo de carga oscuro',
  resourcePacks: 'Paquetes de recursos', biomeBlendRadius: 'Mezcla de biomas', mipmapLevels: 'Niveles de mipmap',
  fovEffectScale: 'Efectos de FOV', screenEffectScale: 'Efectos de distorsión', narrator: 'Narrador',
};

export function mountMcOptionsModule(root) {
  root.innerHTML = `
  <div class="card">
    <div class="field">
      <div class="label">Archivo options.txt</div>
      <div class="input-group">
        <input id="op-file" type="text" placeholder="Ruta a options.txt" />
        <button id="op-default" class="ghost">El de mi Minecraft</button>
        <button id="op-browse" class="ghost">Elegir…</button>
        <button id="op-open" class="primary">Abrir</button>
      </div>
      <div class="small" style="margin-top:6px;">Cierra Minecraft antes de guardar: el juego sobrescribe el archivo al salir.</div>
    </div>
  </div>

  <div class="card">
    <div class="row" style="justify-content:space-between;">
      <input id="op-filter" type="search" placeholder="Buscar ajuste…" style="max-width:320px;" />
      <div class="actions" style="margin:0;">
        <label class="small"><input id="op-only-known" type="checkbox" checked /> Solo los habituales</label>
        <button id="op-save" class="primary">Guardar</button>
      </div>
    </div>
    <div id="op-status" class="status" style="margin-top:10px;">Abre un archivo para empezar.</div>
    <div id="op-table" class="well" style="max-height:520px; margin-top:12px; padding:0;"></div>
  </div>
  `;

  const fileInput = $('#op-file', root);
  const status = $('#op-status', root);
  const table = $('#op-table', root);
  let lines = []; // original lines, edited in place to keep order and unknown content
  let entries = []; // { key, value, lineIndex }
  const changed = new Map();

  async function open(file) {
    const r = await window.ctk.file.readText(file);
    if (!r.ok) { statusText(status, `No se pudo abrir: ${r.error}`, 'warn'); return; }
    fileInput.value = file;
    lines = r.text.split(/\r?\n/);
    entries = [];
    lines.forEach((line, i) => {
      const idx = line.indexOf(':');
      if (idx > 0) entries.push({ key: line.slice(0, idx), value: line.slice(idx + 1), lineIndex: i });
    });
    changed.clear();
    status.textContent = `${entries.length} ajustes cargados.`;
    render();
  }

  function render() {
    const q = $('#op-filter', root).value.trim().toLowerCase();
    const onlyKnown = $('#op-only-known', root).checked && !q;
    const list = entries.filter(e => (!onlyKnown || LABELS[e.key]) && (!q || e.key.toLowerCase().includes(q) || (LABELS[e.key] || '').toLowerCase().includes(q)));
    if (!entries.length) { table.innerHTML = '<div class="empty">Sin datos.</div>'; return; }
    table.innerHTML = `<table class="data"><tbody>${list.map(e => {
      const v = changed.has(e.key) ? changed.get(e.key) : e.value;
      const isBool = e.value === 'true' || e.value === 'false';
      const input = isBool
        ? `<select data-key="${escapeHtml(e.key)}"><option value="true" ${v === 'true' ? 'selected' : ''}>Sí</option><option value="false" ${v === 'false' ? 'selected' : ''}>No</option></select>`
        : `<input data-key="${escapeHtml(e.key)}" type="text" value="${escapeHtml(v)}" style="padding:6px 10px;" />`;
      return `<tr><td style="width:45%;">${LABELS[e.key] ? `${escapeHtml(LABELS[e.key])}<div class="small mono">${escapeHtml(e.key)}</div>` : `<span class="mono">${escapeHtml(e.key)}</span>`}</td><td>${input}</td></tr>`;
    }).join('')}</tbody></table>${list.length ? '' : '<div class="empty">Nada coincide.</div>'}`;
  }

  table.addEventListener('change', (e) => {
    const k = e.target.dataset.key;
    if (!k) return;
    const orig = entries.find(x => x.key === k);
    if (orig && orig.value === e.target.value) changed.delete(k); else changed.set(k, e.target.value);
    status.textContent = changed.size ? `${changed.size} cambios sin guardar.` : 'Sin cambios.';
  });

  $('#op-filter', root).addEventListener('input', render);
  $('#op-only-known', root).addEventListener('change', render);
  $('#op-default', root).addEventListener('click', async () => {
    const r = await window.ctk.mc.readOptions();
    if (!r.ok) { statusText(status, `Error: ${r.error}`, 'warn'); return; }
    if (!r.exists) { statusText(status, `No se encontró ${r.file}. ¿Has abierto Minecraft Java alguna vez?`, 'warn'); fileInput.value = r.file; return; }
    open(r.file);
  });
  $('#op-browse', root).addEventListener('click', async () => {
    const f = await window.ctk.chooseFile([{ name: 'options.txt', extensions: ['txt'] }]);
    if (f) open(f);
  });
  $('#op-open', root).addEventListener('click', () => { if (fileInput.value.trim()) open(fileInput.value.trim()); });

  $('#op-save', root).addEventListener('click', async () => {
    if (!changed.size) { status.textContent = 'No hay cambios que guardar.'; return; }
    for (const e of entries) if (changed.has(e.key)) { e.value = changed.get(e.key); lines[e.lineIndex] = `${e.key}:${e.value}`; }
    const r = await window.ctk.file.writeText({ file: fileInput.value.trim(), text: lines.join('\n') });
    if (r.ok) { changed.clear(); statusText(status, 'Guardado (copia del anterior en options.txt.bak).', 'success'); }
    else statusText(status, `Error: ${r.error}`, 'warn');
  });
}
