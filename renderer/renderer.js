import { modules } from '../modules/index.js';

const container = document.getElementById('module-container');
const title = document.getElementById('module-title');
const navButtons = Array.from(document.querySelectorAll('.nav-item'));
const categories = Array.from(document.querySelectorAll('.category'));
const catHeaders = Array.from(document.querySelectorAll('.cat-header'));

// --- Updater banner ---
function setupUpdaterBanner() {
  if (!window.ctk || !window.ctk.updater) return;
  const bar = document.createElement('div');
  bar.id = 'update-bar';
  bar.style.cssText = 'position:sticky;top:0;z-index:1000;background:#102a43;color:#e6f1ff;border-bottom:1px solid #0b2239;padding:8px 12px;display:none;align-items:center;gap:12px;';
  const msg = document.createElement('span');
  msg.className = 'small';
  const btn = document.createElement('button');
  btn.className = 'primary';
  btn.style.display = 'none';
  btn.textContent = 'Reiniciar y actualizar';
  btn.addEventListener('click', () => window.ctk.updater.quitAndInstall());
  bar.appendChild(msg);
  bar.appendChild(btn);
  const content = document.querySelector('main.content') || document.body;
  content.prepend(bar);

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
}

// Initialize updater banner
setupUpdaterBanner();

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

function switchModule(key, params) {
  const mod = modules[key];
  if (!mod) return;
  navButtons.forEach(b => b.classList.toggle('active', b.dataset.module === key));
  // Ensure the corresponding category is open
  const activeBtn = navButtons.find(b => b.dataset.module === key);
  if (activeBtn) {
    const cat = activeBtn.closest('.category');
    if (cat && !cat.classList.contains('open')) cat.classList.add('open');
    saveOpenCategories();
  }
  title.textContent = mod.title;
  container.innerHTML = '';
  mod.mount(container, params || {});
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
