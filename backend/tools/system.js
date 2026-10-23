import path from 'node:path';
import fs from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { registerJob, finishJob } from '../jobs.js';

const errMsg = (err) => err?.message || String(err);

function run(cmd, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { windowsHide: true });
    let out = '', err = '';
    child.stdout.on('data', d => out += d.toString());
    child.stderr.on('data', d => err += d.toString());
    child.on('error', reject);
    child.on('close', code => resolve({ code, out, err }));
  });
}

// ---------- Ports ----------
async function listPorts() {
  if (process.platform !== 'win32') throw new Error('Solo disponible en Windows');
  const [net, tasks] = await Promise.all([run('netstat', ['-ano']), run('tasklist', ['/FO', 'CSV', '/NH'])]);
  const names = new Map();
  for (const line of tasks.out.split(/\r?\n/)) {
    const m = line.match(/^"([^"]*)","(\d+)"/);
    if (m) names.set(Number(m[2]), m[1]);
  }
  const rows = [];
  const seen = new Set();
  for (const line of net.out.split(/\r?\n/)) {
    const parts = line.trim().split(/\s+/);
    if (parts[0] !== 'TCP' && parts[0] !== 'UDP') continue;
    const proto = parts[0];
    const local = parts[1];
    // TCP lines have a state column; UDP lines do not
    const state = proto === 'TCP' ? parts[3] : '';
    const pid = Number(proto === 'TCP' ? parts[4] : parts[3]);
    if (proto === 'TCP' && state !== 'LISTENING') continue;
    const port = Number(local.slice(local.lastIndexOf(':') + 1));
    const address = local.slice(0, local.lastIndexOf(':')).replace(/^\[|\]$/g, '');
    const key = `${proto}:${port}:${pid}`;
    if (seen.has(key)) continue; // IPv4 and IPv6 listeners of the same process collapse into one row
    seen.add(key);
    rows.push({ proto, port, address, pid, process: names.get(pid) || (pid === 4 ? 'System' : '?') });
  }
  return rows.sort((a, b) => a.port - b.port || a.proto.localeCompare(b.proto));
}

async function killPid(pid) {
  const n = Number(pid);
  if (!Number.isInteger(n) || n <= 4) throw new Error('No se puede cerrar ese proceso del sistema');
  const r = await run('taskkill', ['/PID', String(n), '/F']);
  if (r.code !== 0) throw new Error((r.err || r.out).trim() || 'No se pudo cerrar el proceso');
}

// ---------- Disk usage & duplicates ----------
function hashFile(file, { bytes } = {}) {
  return new Promise((resolve, reject) => {
    const h = crypto.createHash('sha1');
    const stream = createReadStream(file, bytes ? { start: 0, end: bytes - 1 } : {});
    stream.on('data', d => h.update(d));
    stream.on('error', reject);
    stream.on('end', () => resolve(h.digest('hex')));
  });
}

async function scanDisk({ folder, top = 150, minDupSize = 1024 * 1024, duplicates = true }, job, progress) {
  const root = path.resolve(folder);
  await fs.access(root);
  const largest = []; // kept sorted descending, max `top`
  const childSizes = new Map(); // immediate child name -> bytes
  const bySize = new Map(); // size -> [paths] (only >= minDupSize)
  let files = 0, totalBytes = 0, errors = 0;
  const stack = [root];

  while (stack.length) {
    if (job.cancelled) throw Object.assign(new Error('Cancelado'), { cancelled: true });
    const dir = stack.pop();
    let handle;
    try { handle = await fs.opendir(dir); } catch { errors++; continue; }
    for await (const ent of handle) {
      const full = path.join(dir, ent.name);
      if (ent.isSymbolicLink()) continue;
      if (ent.isDirectory()) { stack.push(full); continue; }
      if (!ent.isFile()) continue;
      let size;
      try { size = (await fs.stat(full)).size; } catch { errors++; continue; }
      files++; totalBytes += size;
      const child = path.relative(root, full).split(path.sep)[0];
      childSizes.set(child, (childSizes.get(child) || 0) + size);
      if (largest.length < top || size > largest[largest.length - 1].size) {
        largest.push({ file: full, size });
        largest.sort((a, b) => b.size - a.size);
        if (largest.length > top) largest.pop();
      }
      if (duplicates && size >= minDupSize) {
        const arr = bySize.get(size);
        if (arr) arr.push(full); else bySize.set(size, [full]);
      }
      if (files % 2000 === 0) progress(null, `Escaneando… ${files.toLocaleString('es')} archivos`);
    }
  }

  const folders = await Promise.all([...childSizes.entries()].map(async ([name, size]) => {
    const full = path.join(root, name);
    let isDir = false;
    try { isDir = (await fs.stat(full)).isDirectory(); } catch {}
    return { name, path: full, size, isDir };
  }));
  folders.sort((a, b) => b.size - a.size);

  const groups = [];
  if (duplicates) {
    const candidates = [...bySize.entries()].filter(([, arr]) => arr.length > 1);
    let done = 0;
    for (const [size, arr] of candidates) {
      if (job.cancelled) throw Object.assign(new Error('Cancelado'), { cancelled: true });
      progress(candidates.length ? done / candidates.length : 1, `Buscando duplicados… ${done}/${candidates.length} grupos`);
      done++;
      // Cheap pass on the first 64 KB, full hash only for files that still collide
      const partial = new Map();
      for (const f of arr) {
        try { const k = await hashFile(f, { bytes: 65536 }); (partial.get(k) || partial.set(k, []).get(k)).push(f); } catch { errors++; }
      }
      for (const same of partial.values()) {
        if (same.length < 2) continue;
        const full = new Map();
        for (const f of same) {
          try { const k = size <= 65536 ? 'small' : await hashFile(f); (full.get(k) || full.set(k, []).get(k)).push(f); } catch { errors++; }
        }
        for (const dupes of full.values()) if (dupes.length > 1) groups.push({ size, files: dupes, wasted: size * (dupes.length - 1) });
      }
    }
    groups.sort((a, b) => b.wasted - a.wasted);
  }
  progress(1, 'Terminado');
  return { root, files, totalBytes, errors, largest, folders, duplicates: groups.slice(0, 300) };
}

export function register({ ipcMain, send }) {
  ipcMain.handle('sys:ports', async () => {
    try { return { ok: true, ports: await listPorts() }; } catch (err) { return { ok: false, error: errMsg(err) }; }
  });
  ipcMain.handle('sys:kill', async (_evt, pid) => {
    try { await killPid(pid); return { ok: true }; } catch (err) { return { ok: false, error: errMsg(err) }; }
  });
  ipcMain.handle('disk:scan', async (_evt, payload) => {
    const jobId = payload?.jobId;
    const job = registerJob(jobId);
    try {
      return { ok: true, ...(await scanDisk(payload || {}, job, (fraction, message) => send('job:progress', { jobId, fraction, message }))) };
    } catch (err) {
      return { ok: false, cancelled: Boolean(err?.cancelled), error: errMsg(err) };
    } finally {
      finishJob(jobId);
    }
  });
}
