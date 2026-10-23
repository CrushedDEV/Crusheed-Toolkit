import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import { createWriteStream } from 'node:fs';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { getFfmpegPath } from './binaries.js';

// Long-running work (ffmpeg, yt-dlp, downloads, scans) registers here so the UI can cancel it.
const jobs = new Map(); // jobId -> { child?, abort?, cancelled }

export class CancelledError extends Error {
  constructor() { super('Cancelado'); this.cancelled = true; }
}

export function registerJob(jobId) {
  const job = { child: null, controller: new AbortController(), cancelled: false };
  if (jobId) jobs.set(jobId, job);
  return job;
}

export function finishJob(jobId) {
  if (jobId) jobs.delete(jobId);
}

// Kills the whole process tree: yt-dlp and ffmpeg spawn children of their own.
export function killTree(child) {
  if (!child || child.exitCode !== null) return;
  if (process.platform === 'win32') {
    spawn('taskkill', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true });
  } else {
    try { child.kill('SIGKILL'); } catch {}
  }
}

export function cancelJob(jobId) {
  const job = jobs.get(jobId);
  if (!job) return false;
  job.cancelled = true;
  job.controller.abort();
  killTree(job.child);
  return true;
}

export function isCancelled(job) {
  return Boolean(job?.cancelled);
}

function timeToSeconds(t) {
  const m = String(t).match(/(\d+):(\d+):(\d+(?:\.\d+)?)/);
  return m ? (+m[1]) * 3600 + (+m[2]) * 60 + parseFloat(m[3]) : null;
}

// Duration and basic stream info, parsed from `ffmpeg -i` (ffmpeg-static ships no ffprobe).
export function getMediaInfo(file) {
  return new Promise((resolve, reject) => {
    const ffmpeg = getFfmpegPath();
    if (!ffmpeg) return reject(new Error('FFmpeg no está disponible.'));
    const child = spawn(ffmpeg, ['-hide_banner', '-i', file], { windowsHide: true });
    let err = '';
    child.stderr.on('data', d => err += d.toString());
    child.on('error', reject);
    child.on('close', () => {
      const dur = err.match(/Duration:\s*([\d:.]+)/);
      const video = err.match(/Stream #.*Video:.*?(\d{2,5})x(\d{2,5})/);
      const fps = err.match(/(\d+(?:\.\d+)?)\s*fps/);
      const audio = /Stream #.*Audio:/.test(err);
      if (!dur && !video && !audio) return reject(new Error('No se pudo leer el archivo multimedia.'));
      resolve({
        duration: dur ? timeToSeconds(dur[1]) : null,
        width: video ? +video[1] : null,
        height: video ? +video[2] : null,
        fps: fps ? parseFloat(fps[1]) : null,
        hasVideo: Boolean(video),
        hasAudio: audio
      });
    });
  });
}

// Runs ffmpeg reporting 0..1 progress through `-progress pipe:1`.
export function runFfmpeg(args, { job, duration, onProgress } = {}) {
  return new Promise((resolve, reject) => {
    const ffmpeg = getFfmpegPath();
    if (!ffmpeg) return reject(new Error('FFmpeg no está disponible.'));
    if (job?.cancelled) return reject(new CancelledError());
    const child = spawn(ffmpeg, ['-hide_banner', '-nostdin', '-y', '-progress', 'pipe:1', '-nostats', ...args], { windowsHide: true });
    if (job) job.child = child;
    let errTail = '';
    child.stdout.on('data', (d) => {
      const m = d.toString().match(/out_time_us=(\d+)/g);
      if (m && duration && onProgress) {
        const us = parseInt(m[m.length - 1].split('=')[1], 10);
        onProgress(Math.max(0, Math.min(1, us / 1e6 / duration)));
      }
    });
    child.stderr.on('data', (d) => { errTail = (errTail + d.toString()).slice(-4000); });
    child.on('error', reject);
    child.on('close', (code) => {
      if (job) job.child = null;
      if (job?.cancelled) return reject(new CancelledError());
      if (code === 0) return resolve();
      const lines = errTail.trim().split(/\r?\n/).filter(Boolean);
      reject(new Error(lines.slice(-3).join('\n') || `ffmpeg salió con código ${code}`));
    });
  });
}

// Streams a URL to disk with progress; writes to a temp file and renames when complete.
export async function downloadToFile(url, dest, { job, onProgress, headers } = {}) {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'crushed-toolkit (github.com/CrushedDEV/Crusheed-Toolkit)', ...headers },
    signal: job?.controller.signal
  });
  if (!res.ok || !res.body) throw new Error(`HTTP ${res.status} al descargar ${url}`);
  const total = Number(res.headers.get('content-length')) || 0;
  let received = 0;
  const tmp = dest + '.part';
  const body = Readable.fromWeb(res.body);
  body.on('data', (chunk) => {
    received += chunk.length;
    if (onProgress) onProgress(total ? received / total : null, received, total);
  });
  try {
    await pipeline(body, createWriteStream(tmp));
    await fs.rename(tmp, dest);
  } catch (err) {
    await fs.unlink(tmp).catch(() => {});
    if (job?.cancelled) throw new CancelledError();
    throw err;
  }
  return dest;
}

export async function fetchJson(url) {
  const res = await fetch(url, { headers: { 'User-Agent': 'crushed-toolkit (github.com/CrushedDEV/Crusheed-Toolkit)' } });
  if (!res.ok) throw new Error(`HTTP ${res.status} en ${url}`);
  return res.json();
}

export function formatClock(seconds) {
  const s = Math.max(0, Number(seconds) || 0);
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = (s % 60).toFixed(2);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${sec.padStart(5, '0')}`;
}

// Accepts "90", "1:30", "00:01:30.5" -> seconds; empty -> null
export function parseTime(v) {
  if (v == null || String(v).trim() === '') return null;
  const parts = String(v).trim().split(':').map(Number);
  if (parts.some(n => Number.isNaN(n))) throw new Error(`Tiempo no válido: ${v}`);
  return parts.reduce((acc, n) => acc * 60 + n, 0);
}
