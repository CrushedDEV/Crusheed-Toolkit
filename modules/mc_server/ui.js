import { $, $$, createJobPanel, formatBytes, escapeHtml, statusText, smallButton } from '../shared.js';

const FOLDER_KEY = 'ctkMcServerFolder';

// Common server.properties keys shown as a form; everything else lives in "Todas las propiedades"
const COMMON = [
  { key: 'motd', label: 'MOTD (mensaje del servidor)', type: 'text', wide: true },
  { key: 'max-players', label: 'Jugadores máx.', type: 'number' },
  { key: 'server-port', label: 'Puerto', type: 'number' },
  { key: 'difficulty', label: 'Dificultad', type: 'select', options: ['peaceful', 'easy', 'normal', 'hard'] },
  { key: 'gamemode', label: 'Modo de juego', type: 'select', options: ['survival', 'creative', 'adventure', 'spectator'] },
  { key: 'view-distance', label: 'Distancia de visión', type: 'number' },
  { key: 'simulation-distance', label: 'Distancia de simulación', type: 'number' },
  { key: 'spawn-protection', label: 'Protección del spawn', type: 'number' },
  { key: 'pvp', label: 'PvP', type: 'bool' },
  { key: 'online-mode', label: 'Modo online (premium)', type: 'bool' },
  { key: 'white-list', label: 'Lista blanca', type: 'bool' },
  { key: 'allow-flight', label: 'Permitir volar', type: 'bool' },
];

export function mountMcServerModule(root) {
  root.innerHTML = `
  <div class="card">
    <div class="field">
      <div class="label">Carpeta del servidor</div>
      <div class="input-group">
        <input id="ms-folder" type="text" placeholder="Carpeta donde está (o estará) el servidor" />
        <button id="ms-browse" class="ghost">Elegir…</button>
        <button id="ms-load" class="primary">Abrir</button>
      </div>
    </div>
    <div id="ms-facts" class="facts" hidden></div>
    <div id="ms-eula" class="actions" hidden>
      <span class="small warn">No has aceptado el EULA de Minecraft: el servidor no arrancará.</span>
      <button id="ms-eula-btn" class="ghost sm">Leer y aceptar EULA</button>
    </div>
  </div>

  <div class="card">
    <h3 class="section-title">Descargar servidor</h3>
    <div class="grid" style="grid-template-columns:auto 200px auto; align-items:end; justify-content:start;">
      <div class="field">
        <div class="label">Tipo</div>
        <div class="segmented" id="ms-type">
          <button data-type="paper" class="active">Paper</button>
          <button data-type="purpur">Purpur</button>
          <button data-type="fabric">Fabric</button>
          <button data-type="vanilla">Vanilla</button>
        </div>
      </div>
      <div class="field">
        <div class="label">Versión</div>
        <select id="ms-version"><option>Cargando…</option></select>
      </div>
      <div><button id="ms-download" class="primary">Descargar jar</button></div>
    </div>
    <div class="small" id="ms-type-help" style="margin-top:8px;"></div>
  </div>

  <div class="card" id="ms-progress"></div>

  <div class="card">
    <div class="row" style="justify-content:space-between;">
      <h3 class="section-title" style="margin:0;">server.properties</h3>
      <span class="small" id="ms-props-state"></span>
    </div>
    <div id="ms-props" class="grid grid-3"></div>
    <details id="ms-all" style="margin-top:14px;">
      <summary class="small" style="cursor:pointer;">Todas las propiedades</summary>
      <div id="ms-all-list" class="well" style="max-height:300px; margin-top:10px;"></div>
    </details>
    <div class="actions">
      <button id="ms-save" class="primary">Guardar propiedades</button>
      <span class="small">Se guarda una copia en server.properties.bak</span>
    </div>
  </div>

  <div class="card">
    <h3 class="section-title">Copias de seguridad del mundo</h3>
    <div class="grid" style="grid-template-columns:160px 160px auto; align-items:end; justify-content:start;">
      <div class="field">
        <div class="label">Conservar las últimas</div>
        <input id="ms-keep" type="number" min="1" value="7" />
      </div>
      <div class="field">
        <div class="label">Backup diario a las</div>
        <input id="ms-time" type="time" value="04:00" />
      </div>
      <div class="actions" style="margin:0;">
        <button id="ms-backup" class="primary">Hacer backup ahora</button>
        <button id="ms-schedule" class="ghost">Programar diario</button>
      </div>
    </div>
    <div class="small" style="margin-top:8px;">Se guardan como ZIP en la carpeta <code>backups</code> del servidor. El backup programado solo corre con la app abierta.</div>
    <div id="ms-backups" class="well" style="max-height:220px; margin-top:12px;"></div>
  </div>
  `;

  const folderInput = $('#ms-folder', root);
  const versionSel = $('#ms-version', root);
  const panel = createJobPanel($('#ms-progress', root), { idleText: 'Elige carpeta, tipo y versión.' });
  let type = 'paper';
  let props = null; // { exists, entries }

  const HELP = {
    paper: 'Paper: el más usado, rápido y compatible con plugins de Bukkit/Spigot.',
    purpur: 'Purpur: Paper con muchas opciones extra de configuración.',
    fabric: 'Fabric: para mods de Fabric (descarga el lanzador del servidor).',
    vanilla: 'Vanilla: el servidor oficial de Mojang, sin plugins ni mods.',
  };

  try { folderInput.value = localStorage.getItem(FOLDER_KEY) || ''; } catch {}
  const folder = () => folderInput.value.trim();

  async function loadVersions() {
    versionSel.innerHTML = '<option>Cargando…</option>';
    $('#ms-type-help', root).textContent = HELP[type];
    const r = await window.ctk.mc.versions(type);
    if (!r.ok) { versionSel.innerHTML = '<option value="">Error al cargar</option>'; statusText(panel.msg, `No se pudieron cargar las versiones: ${r.error}`, 'warn'); return; }
    versionSel.innerHTML = r.versions.map(v => `<option>${escapeHtml(v)}</option>`).join('');
  }

  $$('#ms-type button', root).forEach(b => b.addEventListener('click', () => {
    type = b.dataset.type;
    $$('#ms-type button', root).forEach(x => x.classList.toggle('active', x === b));
    loadVersions();
  }));

  $('#ms-browse', root).addEventListener('click', async () => {
    const d = await window.ctk.chooseDirectory();
    if (d) { folderInput.value = d; refresh(); }
  });
  $('#ms-load', root).addEventListener('click', refresh);

  async function refresh() {
    const f = folder();
    if (!f) return;
    try { localStorage.setItem(FOLDER_KEY, f); } catch {}
    const r = await window.ctk.mc.inspect(f);
    const facts = $('#ms-facts', root);
    facts.hidden = false;
    if (!r.ok || !r.exists) {
      facts.innerHTML = '<span class="fact">La carpeta no existe todavía: se creará al descargar el jar.</span>';
      $('#ms-eula', root).hidden = true;
      renderBackups([]);
      props = null; renderProps();
      return;
    }
    const fact = (k, v) => `<span class="fact">${k} <b>${escapeHtml(v)}</b></span>`;
    facts.innerHTML = fact('Jars', r.jars.join(', ') || 'ninguno') + fact('Mundos', r.worlds.join(', ') || 'ninguno') + fact('EULA', r.eula ? 'aceptado' : 'no') + fact('start.bat', r.hasStartBat ? 'sí' : 'no');
    if (r.jars.length && !r.hasStartBat) {
      facts.appendChild(smallButton('Crear start.bat', () => window.dispatchEvent(new CustomEvent('ctk:navigate', { detail: { module: 'mc_startbat', params: { folder: f, jar: r.jars[0] } } }))));
    }
    $('#ms-eula', root).hidden = r.eula || !r.jars.length;
    renderBackups(r.backups);
    const p = await window.ctk.mc.readProps(f);
    props = p.ok ? p : null;
    renderProps();
  }

  function renderProps() {
    const host = $('#ms-props', root);
    const state = $('#ms-props-state', root);
    const values = Object.fromEntries((props?.entries || []).map(e => [e.key, e.value]));
    state.textContent = !folder() ? '' : props?.exists ? '' : 'No existe aún (se genera al arrancar el servidor por primera vez; puedes crearlo ya).';
    host.innerHTML = COMMON.map(c => {
      const v = values[c.key] ?? '';
      let input;
      if (c.type === 'select') input = `<select data-key="${c.key}"><option value="">(por defecto)</option>${c.options.map(o => `<option ${o === v ? 'selected' : ''}>${o}</option>`).join('')}</select>`;
      else if (c.type === 'bool') input = `<select data-key="${c.key}"><option value="">(por defecto)</option><option value="true" ${v === 'true' ? 'selected' : ''}>Sí</option><option value="false" ${v === 'false' ? 'selected' : ''}>No</option></select>`;
      else input = `<input data-key="${c.key}" type="${c.type}" value="${escapeHtml(v)}" />`;
      return `<div class="field" ${c.wide ? 'style="grid-column:1 / -1;"' : ''}><div class="label">${c.label}</div>${input}</div>`;
    }).join('');
    const commonKeys = new Set(COMMON.map(c => c.key));
    const rest = (props?.entries || []).filter(e => !commonKeys.has(e.key));
    $('#ms-all-list', root).innerHTML = rest.length
      ? `<table class="data"><tbody>${rest.map(e => `<tr><td class="mono" style="width:45%;">${escapeHtml(e.key)}</td><td><input data-key="${escapeHtml(e.key)}" type="text" value="${escapeHtml(e.value)}" style="padding:6px 10px;" /></td></tr>`).join('')}</tbody></table>`
      : '<div class="empty">Sin más propiedades.</div>';
  }

  $('#ms-save', root).addEventListener('click', async () => {
    if (!folder()) { statusText(panel.msg, 'Elige la carpeta del servidor.', 'warn'); return; }
    const values = {};
    const original = Object.fromEntries((props?.entries || []).map(e => [e.key, e.value]));
    for (const el of $$('[data-key]', root)) {
      const k = el.dataset.key, v = el.value;
      // Leave untouched keys alone; "(por defecto)" on a key that does not exist yet means "don't write it"
      if (v === '' && !(k in original)) continue;
      if (original[k] !== v) values[k] = v;
    }
    if (!Object.keys(values).length) { statusText(panel.msg, 'No hay cambios que guardar.'); return; }
    const r = await window.ctk.mc.writeProps({ folder: folder(), values });
    statusText(panel.msg, r.ok ? `server.properties guardado (${Object.keys(values).length} cambios). Reinicia el servidor para aplicarlo.` : `Error: ${r.error}`, r.ok ? 'success' : 'warn');
    refresh();
  });

  $('#ms-download', root).addEventListener('click', async () => {
    const f = folder();
    if (!f) { statusText(panel.msg, 'Elige la carpeta del servidor.', 'warn'); return; }
    if (!versionSel.value || panel.busy) return;
    const res = await panel.run((jobId) => window.ctk.mc.downloadJar({ jobId, type, version: versionSel.value, folder: f }));
    if (res?.ok) {
      statusText(panel.msg, `Descargado: ${res.file}`, 'success');
      refresh();
    }
  });

  $('#ms-eula-btn', root).addEventListener('click', async () => {
    window.open('https://aka.ms/MinecraftEULA', '_blank');
    if (!confirm('¿Aceptas el EULA de Minecraft (se acaba de abrir en tu navegador)?')) return;
    const r = await window.ctk.mc.acceptEula(folder());
    statusText(panel.msg, r.ok ? 'EULA aceptado.' : `Error: ${r.error}`, r.ok ? 'success' : 'warn');
    refresh();
  });

  function renderBackups(list) {
    const host = $('#ms-backups', root);
    if (!list.length) { host.innerHTML = '<div class="empty">Sin copias todavía.</div>'; return; }
    host.innerHTML = '';
    for (const b of list) {
      const row = document.createElement('div');
      row.className = 'row'; row.style.padding = '6px 2px';
      row.innerHTML = `<div style="flex:1;" class="mono small">${escapeHtml(b.name)}</div><span class="small">${formatBytes(b.size)} · ${new Date(b.mtime).toLocaleString()}</span>`;
      row.appendChild(smallButton('Mostrar', () => window.ctk.shell.showItemInFolder(b.file)));
      host.appendChild(row);
    }
  }

  $('#ms-backup', root).addEventListener('click', async () => {
    if (!folder() || panel.busy) return;
    const res = await panel.run((jobId) => window.ctk.mc.backup({ jobId, folder: folder(), keep: Number($('#ms-keep', root).value) || 7 }));
    if (res?.ok) {
      statusText(panel.msg, `Backup de ${res.worlds.join(', ')} · ${formatBytes(res.size)}${res.removed.length ? ` · ${res.removed.length} antiguos borrados` : ''}`, 'success');
      refresh();
    }
  });

  $('#ms-schedule', root).addEventListener('click', async () => {
    if (!folder()) return;
    const r = await window.ctk.mc.scheduleBackup({ folder: folder(), keep: Number($('#ms-keep', root).value) || 7, time: $('#ms-time', root).value });
    statusText(panel.msg, r.ok ? `Backup diario programado a las ${$('#ms-time', root).value}. Lo verás en el Programador de tareas.` : `Error: ${r.error}`, r.ok ? 'success' : 'warn');
  });

  loadVersions();
  renderProps();
  if (folder()) refresh(); else renderBackups([]);
  root._cleanup = () => panel.dispose();
}
