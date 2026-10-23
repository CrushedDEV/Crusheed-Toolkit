import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { registerJob, finishJob, downloadToFile, fetchJson } from '../jobs.js';
import { registerAction, createJob as schedCreate } from '../scheduler.js';

const errMsg = (err) => err?.message || String(err);
const isStable = (v) => /^\d+(\.\d+)+$/.test(v);
const compareVersions = (a, b) => {
  const pa = a.split('.').map(Number), pb = b.split('.').map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pb[i] || 0) - (pa[i] || 0);
    if (d) return d;
  }
  return 0;
};

// ---------- Server jars ----------
async function listVersions(type) {
  if (type === 'paper') {
    const data = await fetchJson('https://fill.papermc.io/v3/projects/paper');
    return Object.values(data.versions).flat().filter(isStable).sort(compareVersions);
  }
  if (type === 'purpur') {
    const data = await fetchJson('https://api.purpurmc.org/v2/purpur');
    return data.versions.filter(isStable).sort(compareVersions);
  }
  if (type === 'fabric') {
    const data = await fetchJson('https://meta.fabricmc.net/v2/versions/game');
    return data.filter(v => v.stable).map(v => v.version);
  }
  if (type === 'vanilla') {
    const data = await fetchJson('https://piston-meta.mojang.com/mc/game/version_manifest_v2.json');
    return data.versions.filter(v => v.type === 'release').map(v => v.id);
  }
  throw new Error(`Tipo de servidor desconocido: ${type}`);
}

async function resolveJarUrl(type, version) {
  if (type === 'paper') {
    const build = await fetchJson(`https://fill.papermc.io/v3/projects/paper/versions/${encodeURIComponent(version)}/builds/latest`);
    const dl = build.downloads?.['server:default'];
    if (!dl?.url) throw new Error('Paper no tiene build para esa versión');
    return { url: dl.url, name: dl.name };
  }
  if (type === 'purpur') {
    return { url: `https://api.purpurmc.org/v2/purpur/${encodeURIComponent(version)}/latest/download`, name: `purpur-${version}.jar` };
  }
  if (type === 'fabric') {
    const [loaders, installers] = await Promise.all([
      fetchJson('https://meta.fabricmc.net/v2/versions/loader'),
      fetchJson('https://meta.fabricmc.net/v2/versions/installer'),
    ]);
    const loader = loaders.find(l => l.stable) || loaders[0];
    const installer = installers.find(i => i.stable) || installers[0];
    return {
      url: `https://meta.fabricmc.net/v2/versions/loader/${encodeURIComponent(version)}/${loader.version}/${installer.version}/server/jar`,
      name: `fabric-server-${version}.jar`
    };
  }
  if (type === 'vanilla') {
    const manifest = await fetchJson('https://piston-meta.mojang.com/mc/game/version_manifest_v2.json');
    const entry = manifest.versions.find(v => v.id === version);
    if (!entry) throw new Error('Versión no encontrada');
    const meta = await fetchJson(entry.url);
    if (!meta.downloads?.server?.url) throw new Error('Esa versión no tiene servidor oficial');
    return { url: meta.downloads.server.url, name: `minecraft_server-${version}.jar` };
  }
  throw new Error(`Tipo de servidor desconocido: ${type}`);
}

// ---------- server.properties ----------
async function readProps(folder) {
  const file = path.join(folder, 'server.properties');
  if (!existsSync(file)) return { exists: false, entries: [] };
  const text = await fs.readFile(file, 'utf-8');
  const entries = [];
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^\s*([^#!=:\s][^=:]*?)\s*[=:]\s*(.*)$/);
    if (m) entries.push({ key: m[1], value: m[2] });
  }
  return { exists: true, entries };
}

async function writeProps(folder, values) {
  const file = path.join(folder, 'server.properties');
  const lines = existsSync(file) ? (await fs.readFile(file, 'utf-8')).split(/\r?\n/) : ['#Minecraft server properties'];
  if (existsSync(file)) await fs.copyFile(file, file + '.bak');
  const pending = new Map(Object.entries(values));
  // Update keys in place so comments and order survive
  const out = lines.map(line => {
    const m = line.match(/^\s*([^#!=:\s][^=:]*?)\s*[=:]/);
    if (m && pending.has(m[1])) {
      const v = pending.get(m[1]);
      pending.delete(m[1]);
      return `${m[1]}=${v}`;
    }
    return line;
  });
  while (out.length && out[out.length - 1] === '') out.pop();
  for (const [k, v] of pending) out.push(`${k}=${v}`);
  await fs.writeFile(file, out.join('\n') + '\n', 'utf-8');
}

// ---------- Backups ----------
async function findWorlds(folder) {
  const items = await fs.readdir(folder, { withFileTypes: true });
  return items.filter(d => d.isDirectory() && existsSync(path.join(folder, d.name, 'level.dat'))).map(d => d.name);
}

function stamp() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}-${p(d.getMinutes())}-${p(d.getSeconds())}`;
}

// bsdtar (bundled with Windows 10+) streams to zip without loading the world in memory
function tarZip(cwd, out, entries, job) {
  return new Promise((resolve, reject) => {
    // Full path on Windows: a GNU tar from Git/MSYS earlier in PATH would read "C:" as a remote host
    const tar = process.platform === 'win32' ? path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'tar.exe') : 'tar';
    const child = spawn(tar, ['-a', '-c', '-f', out, '--exclude', 'session.lock', ...entries], { cwd, windowsHide: true });
    if (job) job.child = child;
    let err = '';
    child.stderr.on('data', d => err += d.toString());
    child.on('error', reject);
    child.on('close', (code) => {
      if (job) job.child = null;
      if (job?.cancelled) return reject(Object.assign(new Error('Cancelado'), { cancelled: true }));
      code === 0 ? resolve() : reject(new Error(err.trim() || `tar salió con código ${code}`));
    });
  });
}

async function listBackups(folder) {
  const dir = path.join(folder, 'backups');
  if (!existsSync(dir)) return [];
  const names = (await fs.readdir(dir)).filter(n => /\.zip$/i.test(n));
  const out = [];
  for (const n of names) {
    const st = await fs.stat(path.join(dir, n));
    out.push({ file: path.join(dir, n), name: n, size: st.size, mtime: st.mtimeMs });
  }
  return out.sort((a, b) => b.mtime - a.mtime);
}

export async function backupWorlds({ folder, keep = 7 }, job) {
  if (!folder || !existsSync(folder)) throw new Error('La carpeta del servidor no existe');
  const worlds = await findWorlds(folder);
  if (!worlds.length) throw new Error('No se encontró ningún mundo (carpeta con level.dat)');
  const dir = path.join(folder, 'backups');
  await fs.mkdir(dir, { recursive: true });
  const out = path.join(dir, `world-${stamp()}.zip`);
  try {
    await tarZip(folder, out, worlds, job);
  } catch (err) {
    await fs.unlink(out).catch(() => {});
    throw err;
  }
  // Keep only the newest N backups
  const all = await listBackups(folder);
  const removed = [];
  for (const b of all.slice(Math.max(1, Number(keep) || 7))) {
    await fs.unlink(b.file).catch(() => {});
    removed.push(b.name);
  }
  return { file: out, size: (await fs.stat(out)).size, worlds, removed };
}

// ---------- options.txt ----------
const defaultOptionsPath = () => path.join(process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'), '.minecraft', 'options.txt');

export function register({ ipcMain, send }) {
  registerAction('mc-backup', 'Copia de seguridad de mundo (Minecraft)', async (args) => {
    const r = await backupWorlds(args);
    return `Backup creado: ${r.file} (${r.worlds.join(', ')})${r.removed.length ? ` · borrados ${r.removed.length} antiguos` : ''}`;
  });

  const wrap = (fn) => async (_evt, payload) => {
    try { return { ok: true, ...(await fn(payload)) }; } catch (err) { return { ok: false, error: errMsg(err) }; }
  };

  ipcMain.handle('mc:versions', wrap(async (type) => ({ versions: await listVersions(type) })));

  ipcMain.handle('mc:downloadJar', async (_evt, { jobId, type, version, folder, fileName }) => {
    const job = registerJob(jobId);
    try {
      if (!folder) throw new Error('Elige la carpeta del servidor');
      await fs.mkdir(folder, { recursive: true });
      send('job:progress', { jobId, fraction: 0, message: 'Buscando la descarga…' });
      const { url, name } = await resolveJarUrl(type, version);
      const dest = path.join(folder, fileName?.trim() || name);
      await downloadToFile(url, dest, {
        job,
        onProgress: (f, received) => send('job:progress', { jobId, fraction: f, message: `Descargando ${name} · ${(received / 1048576).toFixed(1)} MB` })
      });
      send('job:progress', { jobId, fraction: 1, message: 'Descargado' });
      return { ok: true, file: dest };
    } catch (err) {
      return { ok: false, cancelled: Boolean(job.cancelled), error: errMsg(err) };
    } finally {
      finishJob(jobId);
    }
  });

  ipcMain.handle('mc:inspect', wrap(async (folder) => {
    const exists = Boolean(folder) && existsSync(folder);
    if (!exists) return { exists };
    const files = await fs.readdir(folder);
    const eula = existsSync(path.join(folder, 'eula.txt')) && /eula\s*=\s*true/i.test(await fs.readFile(path.join(folder, 'eula.txt'), 'utf-8'));
    return {
      exists,
      jars: files.filter(f => /\.jar$/i.test(f)),
      hasStartBat: files.some(f => /^start\.bat$/i.test(f)),
      eula,
      worlds: await findWorlds(folder),
      backups: await listBackups(folder),
    };
  }));

  ipcMain.handle('mc:readProps', wrap(readProps));
  ipcMain.handle('mc:writeProps', wrap(async ({ folder, values }) => { await writeProps(folder, values); return {}; }));
  ipcMain.handle('mc:acceptEula', wrap(async (folder) => {
    await fs.writeFile(path.join(folder, 'eula.txt'), `#Aceptado desde Crushed Toolkit (https://aka.ms/MinecraftEULA)\neula=true\n`, 'utf-8');
    return {};
  }));
  ipcMain.handle('mc:writeStartBat', wrap(async ({ folder, content }) => {
    const file = path.join(folder, 'start.bat');
    await fs.writeFile(file, content.replace(/\r?\n/g, '\r\n'), 'utf-8');
    return { file };
  }));

  ipcMain.handle('mc:backup', async (_evt, { jobId, folder, keep }) => {
    const job = registerJob(jobId);
    try {
      send('job:progress', { jobId, fraction: null, message: 'Comprimiendo mundos…' });
      const r = await backupWorlds({ folder, keep }, job);
      send('job:progress', { jobId, fraction: 1, message: 'Backup creado' });
      return { ok: true, ...r };
    } catch (err) {
      return { ok: false, cancelled: Boolean(err?.cancelled), error: errMsg(err) };
    } finally {
      finishJob(jobId);
    }
  });

  ipcMain.handle('mc:scheduleBackup', wrap(async ({ folder, keep, time }) => {
    const [hh, mm] = String(time || '04:00').split(':').map(n => parseInt(n, 10));
    const id = `mc-backup-${path.basename(folder).replace(/\W+/g, '-')}`;
    const def = await schedCreate({
      id, name: `Backup Minecraft · ${path.basename(folder)}`,
      cron: `${mm || 0} ${hh || 0} * * *`, action: 'mc-backup', actionArgs: { folder, keep }, enabled: true,
    });
    return { id: def.id };
  }));

  ipcMain.handle('mc:readOptions', wrap(async (file) => {
    const p = file || defaultOptionsPath();
    if (!existsSync(p)) return { file: p, exists: false, text: '' };
    return { file: p, exists: true, text: await fs.readFile(p, 'utf-8') };
  }));
  ipcMain.handle('mc:writeOptions', wrap(async ({ file, text }) => {
    if (existsSync(file)) await fs.copyFile(file, file + '.bak');
    await fs.writeFile(file, text, 'utf-8');
    return { file };
  }));
}
