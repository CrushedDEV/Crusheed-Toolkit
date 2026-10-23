import { $, escapeHtml, statusText } from '../shared.js';

// Ports people usually go looking for
const KNOWN = { 80: 'HTTP', 443: 'HTTPS', 3000: 'Dev server', 3306: 'MySQL', 5173: 'Vite', 5432: 'PostgreSQL', 6379: 'Redis', 8080: 'HTTP alt', 25565: 'Minecraft', 19132: 'Minecraft Bedrock', 27017: 'MongoDB', 5000: 'Dev server', 4200: 'Angular', 8000: 'Dev server' };

export function mountPortsModule(root) {
  root.innerHTML = `
  <div class="card">
    <div class="row" style="justify-content:space-between;">
      <div class="row" style="gap:10px;">
        <input id="pt-filter" type="search" placeholder="Puerto, programa o PID…" style="width:280px;" />
        <label class="small"><input id="pt-tcp" type="checkbox" checked /> Solo TCP</label>
        <label class="small"><input id="pt-sys" type="checkbox" /> Mostrar procesos del sistema</label>
      </div>
      <button id="pt-refresh" class="ghost sm">Actualizar</button>
    </div>
    <div id="pt-status" class="status" style="margin-top:10px;"></div>
    <div id="pt-table" class="well" style="max-height:560px; margin-top:12px; padding:0;"></div>
  </div>
  `;

  const status = $('#pt-status', root);
  const host = $('#pt-table', root);
  let ports = [];
  const SYSTEM = /^(svchost|System|lsass|wininit|services|spoolsv|Idle)\b/i;

  async function load() {
    status.textContent = 'Cargando…';
    const r = await window.ctk.sys.ports();
    if (!r.ok) { statusText(status, `Error: ${r.error}`, 'warn'); return; }
    ports = r.ports;
    status.textContent = `${ports.length} puertos en escucha · ${new Date().toLocaleTimeString()}`;
    render();
  }

  function render() {
    const q = $('#pt-filter', root).value.trim().toLowerCase();
    const onlyTcp = $('#pt-tcp', root).checked;
    const showSys = $('#pt-sys', root).checked;
    const list = ports.filter(p =>
      (!onlyTcp || p.proto === 'TCP') &&
      (showSys || !SYSTEM.test(p.process) || q) &&
      (!q || String(p.port).includes(q) || p.process.toLowerCase().includes(q) || String(p.pid) === q));
    if (!list.length) { host.innerHTML = '<div class="empty">Nada coincide.</div>'; return; }
    host.innerHTML = `<table class="data"><thead><tr><th>Puerto</th><th>Proto</th><th>Dirección</th><th>Programa</th><th>PID</th><th></th></tr></thead><tbody>${list.map(p => `
      <tr>
        <td><b>${p.port}</b>${KNOWN[p.port] ? ` <span class="small">${KNOWN[p.port]}</span>` : ''}</td>
        <td class="small">${p.proto}</td>
        <td class="mono small">${escapeHtml(p.address)}</td>
        <td>${escapeHtml(p.process)}</td>
        <td class="mono small">${p.pid}</td>
        <td class="actions-cell">${p.pid > 4 ? `<button class="danger sm" data-pid="${p.pid}" data-name="${escapeHtml(p.process)}">Cerrar</button>` : ''}</td>
      </tr>`).join('')}</tbody></table>`;
  }

  host.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-pid]');
    if (!btn) return;
    if (!confirm(`¿Cerrar ${btn.dataset.name} (PID ${btn.dataset.pid})? Se perderá lo que no esté guardado en ese programa.`)) return;
    const r = await window.ctk.sys.kill(Number(btn.dataset.pid));
    if (!r.ok) { statusText(status, `Error: ${r.error}`, 'warn'); return; }
    statusText(status, `${btn.dataset.name} cerrado.`, 'success');
    setTimeout(load, 500);
  });

  $('#pt-filter', root).addEventListener('input', render);
  $('#pt-tcp', root).addEventListener('change', render);
  $('#pt-sys', root).addEventListener('change', render);
  $('#pt-refresh', root).addEventListener('click', load);
  load();
}
