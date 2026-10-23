import { modules } from '../modules/index.js';

const container = document.getElementById('module-container');
const title = document.getElementById('module-title');
const desc = document.getElementById('module-desc');
const navButtons = Array.from(document.querySelectorAll('.nav-item'));
const categories = Array.from(document.querySelectorAll('.category'));
const catHeaders = Array.from(document.querySelectorAll('.cat-header'));

// --- Updater banner ---
function setupUpdaterBanner() {
  if (!window.ctk || !window.ctk.updater) return;
  const bar = document.createElement('div');
  bar.id = 'update-bar';
  const msg = document.createElement('span');
  msg.className = 'small';
  const btn = document.createElement('button');
  btn.className = 'primary sm';
  btn.style.display = 'none';
  btn.textContent = 'Reiniciar y actualizar';
  btn.addEventListener('click', () => window.ctk.updater.quitAndInstall());
  bar.appendChild(msg);
  bar.appendChild(btn);
  const topbar = document.querySelector('.topbar');
  topbar.after(bar);

  const show = (text) => { bar.style.display = 'flex'; msg.textContent = text; };
  const hide = () => { bar.style.display = 'none'; btn.style.display = 'none'; };

  window.ctk.updater.on('updater:checking', () => { show('Buscando actualizaciones…'); });
  window.ctk.updater.on('updater:available', (info) => { show(`Actualización ${info?.version || ''} disponible. Descargando…`); });
  window.ctk.updater.on('updater:not_available', () => { hide(); });
  window.ctk.updater.on('updater:error', (e) => { show(`Error de actualización: ${e?.message || e}`); });
  window.ctk.updater.on('updater:progress', (p) => {
    const pct = typeof p?.percent === 'number' ? Math.max(0, Math.min(100, Math.round(p.percent))) : null;
    if (pct != null) show(`Descargando actualización… ${pct}%`);
  });
  window.ctk.updater.on('updater:downloaded', () => {
    show('Actualización descargada. Listo para instalar.');
    btn.style.display = 'inline-flex';
  });

  // Kick off a check (will be no-op in dev)
  try { window.ctk.updater.check(); } catch {}
  return { show, hide };
}

// Initialize updater banner
const updateBanner = setupUpdaterBanner();

const btnUpdate = document.getElementById('btn-update-check');
if (btnUpdate && window.ctk && window.ctk.updater) {
  btnUpdate.addEventListener('click', async () => {
    const r = await window.ctk.updater.check();
    if (!r?.ok && updateBanner) {
      updateBanner.show(r?.error || 'No se pudo buscar actualizaciones');
      setTimeout(updateBanner.hide, 4000);
    }
  });
}

window.ctk?.getDefaults().then(({ appVersion }) => {
  const v = document.getElementById('app-version');
  if (v && appVersion) v.textContent = `v${appVersion}`;
}).catch(() => {});

if (window.ctk && window.ctk.updater) {
  setInterval(() => {
    try { window.ctk.updater.check(); } catch {}
  }, 10 * 60 * 1000);
}

const STORAGE_KEYS = {
  openCats: 'ctkOpenCats',
  lastModule: 'ctkLastModule',
};

function saveOpenCategories() {
  const open = categories
    .filter(c => c.classList.contains('open') && c.dataset.category)
    .map(c => c.dataset.category);
  try { localStorage.setItem(STORAGE_KEYS.openCats, JSON.stringify(open)); } catch {}
}

function loadOpenCategories() {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.openCats);
    if (!raw) return null;
    const arr = JSON.parse(raw);
    if (Array.isArray(arr)) return arr;
  } catch {}
  return null;
}

let currentCleanup = null;

function switchModule(key, params) {
  const mod = modules[key];
  if (!mod) return;
  // call previous cleanup to remove listeners, timers, etc.
  try { if (typeof currentCleanup === 'function') currentCleanup(); } catch {}
  currentCleanup = null;
  navButtons.forEach(b => b.classList.toggle('active', b.dataset.module === key));
  // Ensure the corresponding category is open
  const activeBtn = navButtons.find(b => b.dataset.module === key);
  if (activeBtn) {
    const cat = activeBtn.closest('.category');
    if (cat && !cat.classList.contains('open')) cat.classList.add('open');
    saveOpenCategories();
  }
  title.textContent = mod.title;
  desc.textContent = mod.description || '';
  container.innerHTML = '';
  // Fresh host per mount: async work a module started keeps writing into its own (now detached) host
  // instead of finding the next module's elements by id
  const host = document.createElement('div');
  host.className = 'module-host';
  container.appendChild(host);
  mod.mount(host, params || {});
  for (const child of host.children) child.classList.add('module-enter');
  // capture cleanup provided by module
  try { if (typeof host._cleanup === 'function') currentCleanup = host._cleanup; } catch {}
  try { localStorage.setItem(STORAGE_KEYS.lastModule, key); } catch {}
}

navButtons.forEach(btn => btn.addEventListener('click', () => switchModule(btn.dataset.module)));

window.addEventListener('ctk:navigate', (e) => {
  const { module, params } = e.detail || {};
  if (module) switchModule(module, params);
});

// Category accordion toggles
catHeaders.forEach(h => {
  h.addEventListener('click', () => {
    const section = h.closest('.category');
    if (!section) return;
    section.classList.toggle('open');
    saveOpenCategories();
  });
  h.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      h.click();
    }
  });
});

// Initial
// restore open categories
const stored = loadOpenCategories();
if (stored && stored.length) {
  categories.forEach(c => {
    if (c.dataset.category && stored.includes(c.dataset.category)) c.classList.add('open');
    else c.classList.remove('open');
  });
}
// restore last module
let initialModule = 'youtube';
try {
  const last = localStorage.getItem(STORAGE_KEYS.lastModule);
  if (last && modules[last]) initialModule = last;
} catch {}
switchModule(initialModule);
