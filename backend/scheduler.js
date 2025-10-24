import path from 'node:path';
import fs from 'node:fs/promises';
import cron from 'node-cron';
import { spawn } from 'node:child_process';

const jobs = new Map(); // id -> { def, task, lastRun, lastExit, logs: [] }
let storePath = null;

function nowIso(){ return new Date().toISOString(); }

export async function initScheduler(storageDir){
  storePath = path.join(storageDir, 'scheduler.json');
  await fs.mkdir(storageDir, { recursive: true });
  try {
    const raw = await fs.readFile(storePath, 'utf-8');
    const arr = JSON.parse(raw);
    if (Array.isArray(arr)) {
      for (const def of arr) {
        try { await createJob(def, false); } catch {}
      }
    }
  } catch {}
}

async function persist(){
  if (!storePath) return;
  const arr = Array.from(jobs.values()).map(j => j.def);
  await fs.writeFile(storePath, JSON.stringify(arr, null, 2), 'utf-8');
}

export function listJobs(){
  return Array.from(jobs.values()).map(j => ({
    id: j.def.id,
    name: j.def.name,
    cron: j.def.cron,
    cmd: j.def.cmd,
    args: j.def.args,
    cwd: j.def.cwd,
    env: j.def.env,
    enabled: !!j.def.enabled,
    jitter: j.def.jitter || 0,
    timeoutSec: j.def.timeoutSec || 0,
    lastRun: j.lastRun || null,
    lastExit: j.lastExit ?? null,
    nextRun: j.task ? j.task.getNextDates().toDate() : null,
  }));
}

export async function removeJob(id){
  const j = jobs.get(id);
  if (!j) return false;
  if (j.task) try { j.task.stop(); } catch {}
  jobs.delete(id);
  await persist();
  return true;
}

export async function toggleJob(id, enabled){
  const j = jobs.get(id);
  if (!j) return false;
  j.def.enabled = !!enabled;
  if (enabled) {
    if (!j.task) j.task = scheduleTask(j.def);
    else j.task.start();
  } else {
    if (j.task) j.task.stop();
  }
  await persist();
  return true;
}

function scheduleTask(def){
  const t = cron.schedule(def.cron, () => runNow(def.id), { scheduled: !!def.enabled, timezone: def.timezone || undefined });
  return t;
}

export async function createJob(def, persistAfter=true){
  if (!def || !def.id) throw new Error('def.id requerido');
  const existing = jobs.get(def.id);
  if (existing && existing.task) existing.task.stop();
  const merged = existing ? { ...existing.def, ...def } : { ...def };
  const job = {
    def: {
      id: merged.id,
      name: merged.name || merged.id,
      cron: merged.cron || '* * * * *',
      cmd: merged.cmd || '',
      args: Array.isArray(merged.args) ? merged.args : (merged.args ? String(merged.args).split(' ') : []),
      cwd: merged.cwd || undefined,
      env: merged.env || {},
      enabled: merged.enabled !== false,
      jitter: merged.jitter || 0,
      timeoutSec: merged.timeoutSec || 0,
      timezone: merged.timezone || undefined,
    },
    task: null,
    lastRun: null,
    lastExit: null,
    logs: existing?.logs || [],
  };
  job.task = scheduleTask(job.def);
  jobs.set(job.def.id, job);
  if (persistAfter) await persist();
  return job.def;
}

export async function runNow(id){
  const j = jobs.get(id);
  if (!j) throw new Error('Job no encontrado');
  const def = j.def;
  const jitter = Math.max(0, def.jitter || 0);
  const delay = jitter ? Math.floor(Math.random()*jitter*1000) : 0;
  setTimeout(() => doSpawn(j).catch(()=>{}), delay);
}

async function doSpawn(job){
  const def = job.def;
  job.lastRun = nowIso();
  const start = Date.now();
  const child = spawn(def.cmd, def.args || [], {
    cwd: def.cwd || undefined,
    env: { ...process.env, ...(def.env || {}) },
    windowsHide: true,
    shell: true,
    stdio: ['ignore', 'pipe', 'pipe']
  });
  const chunks = [];
  const errChunks = [];
  let killedByTimeout = false;
  const killTimer = def.timeoutSec > 0 ? setTimeout(() => { try { killedByTimeout = true; child.kill('SIGTERM'); } catch {} }, def.timeoutSec*1000) : null;
  child.stdout.on('data', d => chunks.push(d));
  child.stderr.on('data', d => errChunks.push(d));
  child.on('close', (code) => {
    if (killTimer) clearTimeout(killTimer);
    const out = Buffer.concat(chunks).toString();
    const err = Buffer.concat(errChunks).toString();
    job.lastExit = code;
    job.logs.push({ ts: nowIso(), durationMs: Date.now()-start, code, out, err, killedByTimeout });
    job.logs = job.logs.slice(-100);
  });
}

export function getLogs(id){
  const j = jobs.get(id);
  return j ? (j.logs || []) : [];
}
