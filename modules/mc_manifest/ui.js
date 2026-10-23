import { $, escapeHtml, statusText } from '../shared.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const verStr = (v) => Array.isArray(v) ? v.join('.') : (v ?? '');

// Checks the usual mistakes in Bedrock resource/behavior pack manifests
function validate(m) {
  const issues = [];
  if (!m.format_version) issues.push('Falta format_version.');
  if (!m.header) { issues.push('Falta el bloque header.'); return issues; }
  if (!m.header.name) issues.push('header.name está vacío.');
  if (!UUID_RE.test(m.header.uuid || '')) issues.push('header.uuid no es un UUID válido.');
  if (!Array.isArray(m.header.version) || m.header.version.length !== 3) issues.push('header.version debe ser [x, y, z].');
  if (m.format_version >= 2 && !m.header.min_engine_version) issues.push('Falta header.min_engine_version.');
  const uuids = [m.header.uuid];
  (m.modules || []).forEach((mod, i) => {
    if (!UUID_RE.test(mod.uuid || '')) issues.push(`modules[${i}].uuid no es válido.`);
    if (!mod.type) issues.push(`modules[${i}] no tiene type.`);
    uuids.push(mod.uuid);
  });
  if (!(m.modules || []).length) issues.push('No hay ningún módulo.');
  const dupes = uuids.filter((u, i) => u && uuids.indexOf(u) !== i);
  if (dupes.length) issues.push('Hay UUIDs repetidos entre header y módulos.');
  return issues;
}

export function mountMcManifestModule(root) {
  root.innerHTML = `
  <div class="card">
    <div class="field">
      <div class="label">manifest.json (pack de Minecraft Bedrock)</div>
      <div class="input-group">
        <input id="mf-file" type="text" placeholder="Ruta al manifest.json, o pega el JSON abajo" />
        <button id="mf-browse" class="ghost">Elegir…</button>
        <button id="mf-open" class="primary">Abrir</button>
      </div>
    </div>
    <div class="field">
      <div class="label">Contenido</div>
      <textarea id="mf-src" class="mono" rows="10" spellcheck="false" style="resize:vertical; font-size:12.5px;"></textarea>
    </div>
    <div class="actions">
      <button id="mf-parse" class="ghost">Validar</button>
      <button id="mf-uuids" class="ghost">Regenerar UUIDs</button>
      <button id="mf-bump" class="ghost">Subir versión</button>
      <button id="mf-format" class="ghost">Formatear</button>
      <button id="mf-save" class="primary push">Guardar</button>
    </div>
    <div class="small" style="margin-top:8px;">«Regenerar UUIDs» es lo que necesitas al duplicar un pack, para que el juego no lo confunda con el original.</div>
  </div>

  <div class="card" id="mf-result"><div class="empty">Abre o pega un manifest.json.</div></div>
  `;

  const src = $('#mf-src', root);
  const fileInput = $('#mf-file', root);
  const result = $('#mf-result', root);

  function parse() {
    try { return JSON.parse(src.value); } catch (err) { statusText(result, `JSON inválido: ${err.message}`, 'warn'); return null; }
  }

  function render(m) {
    const issues = validate(m);
    const h = m.header || {};
    result.innerHTML = `
      <div class="row" style="justify-content:space-between;">
        <h3 class="section-title" style="margin:0;">${escapeHtml(h.name || 'Sin nombre')}</h3>
        <span class="value-badge">v${escapeHtml(verStr(h.version))}</span>
      </div>
      <div class="small" style="margin-top:4px;">${escapeHtml(h.description || '')}</div>
      <div class="facts" style="margin-top:12px;">
        <span class="fact">format_version <b>${escapeHtml(String(m.format_version ?? '—'))}</b></span>
        <span class="fact">min_engine <b>${escapeHtml(verStr(h.min_engine_version) || '—')}</b></span>
        <span class="fact">UUID <b class="mono">${escapeHtml(h.uuid || '—')}</b></span>
      </div>
      <table class="data" style="margin-top:14px;"><thead><tr><th>Módulo</th><th>Versión</th><th>UUID</th></tr></thead><tbody>
        ${(m.modules || []).map(mod => `<tr><td>${escapeHtml(mod.type || '?')}</td><td>${escapeHtml(verStr(mod.version))}</td><td class="mono small">${escapeHtml(mod.uuid || '')}</td></tr>`).join('')}
      </tbody></table>
      ${(m.dependencies || []).length ? `<div class="label" style="margin-top:14px;">Dependencias</div><div class="small mono">${(m.dependencies).map(d => escapeHtml(d.uuid || d.module_name || JSON.stringify(d))).join('<br>')}</div>` : ''}
      <div style="margin-top:14px;" class="${issues.length ? 'warn' : 'success'} small">${issues.length ? issues.map(escapeHtml).join('<br>') : '✓ Manifest válido'}</div>`;
  }

  const update = (m) => { src.value = JSON.stringify(m, null, 2); render(m); };

  async function open(file) {
    const r = await window.ctk.file.readText(file);
    if (!r.ok) { statusText(result, `No se pudo abrir: ${r.error}`, 'warn'); return; }
    fileInput.value = file;
    src.value = r.text;
    const m = parse(); if (m) render(m);
  }

  $('#mf-browse', root).addEventListener('click', async () => {
    const f = await window.ctk.chooseFile([{ name: 'manifest.json', extensions: ['json'] }]);
    if (f) open(f);
  });
  $('#mf-open', root).addEventListener('click', () => { if (fileInput.value.trim()) open(fileInput.value.trim()); });
  $('#mf-parse', root).addEventListener('click', () => { const m = parse(); if (m) render(m); });
  $('#mf-format', root).addEventListener('click', () => { const m = parse(); if (m) update(m); });
  $('#mf-uuids', root).addEventListener('click', () => {
    const m = parse(); if (!m) return;
    m.header = m.header || {};
    m.header.uuid = crypto.randomUUID();
    (m.modules || []).forEach(mod => { mod.uuid = crypto.randomUUID(); });
    update(m);
  });
  $('#mf-bump', root).addEventListener('click', () => {
    const m = parse(); if (!m) return;
    const v = Array.isArray(m.header?.version) ? [...m.header.version] : [1, 0, 0];
    v[2] = (Number(v[2]) || 0) + 1;
    m.header.version = v;
    (m.modules || []).forEach(mod => { if (Array.isArray(mod.version)) mod.version = [...v]; });
    update(m);
  });
  $('#mf-save', root).addEventListener('click', async () => {
    const m = parse(); if (!m) return;
    const text = JSON.stringify(m, null, 2);
    const file = fileInput.value.trim();
    const r = file
      ? await window.ctk.file.writeText({ file, text })
      : await window.ctk.file.save({ title: 'Guardar manifest.json', defaultPath: 'manifest.json', filters: [{ name: 'JSON', extensions: ['json'] }], dataBase64: btoa(unescape(encodeURIComponent(text))) });
    if (r.ok) { render(m); result.insertAdjacentHTML('afterbegin', '<div class="small success" style="margin-bottom:10px;">Guardado.</div>'); }
    else if (!r.canceled) statusText(result, `Error: ${r.error}`, 'warn');
  });
}
