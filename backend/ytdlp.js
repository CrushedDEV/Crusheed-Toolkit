import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs/promises';
import { createWriteStream } from 'node:fs';
import { spawn } from 'node:child_process';
import https from 'node:https';
import { which, getFfmpegPath } from './binaries.js';

const BIN_DIR = path.join(os.homedir(), '.crushed-toolkit', 'bin');
const YT_WIN_URL = 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe';
const YT_NIX_URL = 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp';
const UPDATE_STAMP = path.join(BIN_DIR, '.last-update');
const UPDATE_INTERVAL_MS = 24 * 60 * 60 * 1000;
// A real yt-dlp binary is well above this; anything smaller is a truncated/failed download
const MIN_BINARY_SIZE = 1024 * 1024;

function isWindows() { return process.platform === 'win32'; }

function localBinaryPath() {
  return path.join(BIN_DIR, isWindows() ? 'yt-dlp.exe' : 'yt-dlp');
}

// Streams url to dest following redirects; rejects on non-200 (GitHub "latest" links redirect).
function downloadFile(url, dest, redirects = 5) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'crushed-toolkit' } }, (response) => {
      const { statusCode, headers } = response;
      if (statusCode >= 300 && statusCode < 400 && headers.location) {
        response.resume();
        if (redirects <= 0) return reject(new Error('Demasiadas redirecciones'));
        downloadFile(new URL(headers.location, url).toString(), dest, redirects - 1).then(resolve, reject);
        return;
      }
      if (statusCode !== 200) {
        response.resume();
        reject(new Error(`HTTP ${statusCode} al descargar yt-dlp`));
        return;
      }
      const file = createWriteStream(dest);
      response.pipe(file);
      file.on('finish', () => file.close(() => resolve(dest)));
      file.on('error', reject);
      response.on('error', reject);
    }).on('error', reject);
  });
}

async function isUsableBinary(p) {
  try { return (await fs.stat(p)).size >= MIN_BINARY_SIZE; } catch { return false; }
}

// Prefers our own managed copy (it can self-update); falls back to one in PATH if the download fails.
export async function ensureYtDlp() {
  const localPath = localBinaryPath();
  if (await isUsableBinary(localPath)) return localPath;

  await fs.mkdir(BIN_DIR, { recursive: true });
  const tmp = localPath + '.download';
  try {
    await downloadFile(isWindows() ? YT_WIN_URL : YT_NIX_URL, tmp);
    if (!(await isUsableBinary(tmp))) throw new Error('Descarga de yt-dlp incompleta');
    await fs.rename(tmp, localPath);
    if (!isWindows()) await fs.chmod(localPath, 0o755);
    await fs.writeFile(UPDATE_STAMP, new Date().toISOString());
    return localPath;
  } catch (err) {
    await fs.unlink(tmp).catch(() => {});
    const inPath = which(isWindows() ? 'yt-dlp.exe' : 'yt-dlp');
    if (inPath) return inPath;
    throw new Error(`No se pudo obtener yt-dlp: ${err?.message || err}`);
  }
}

// Runs `yt-dlp -U` on the managed copy at most once a day. YouTube breaks old versions often.
export async function updateYtDlp(ytDlpPath, { force = false } = {}) {
  if (path.dirname(ytDlpPath) !== BIN_DIR) return { updated: false, skipped: 'external' };
  if (!force) {
    try {
      const last = new Date(await fs.readFile(UPDATE_STAMP, 'utf-8')).getTime();
      if (Date.now() - last < UPDATE_INTERVAL_MS) return { updated: false, skipped: 'recent' };
    } catch {}
  }
  const out = await new Promise((resolve, reject) => {
    const child = spawn(ytDlpPath, ['-U'], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let buf = '';
    child.stdout.on('data', d => buf += d.toString());
    child.stderr.on('data', d => buf += d.toString());
    child.on('error', reject);
    child.on('close', (code) => code === 0 ? resolve(buf) : reject(new Error(buf.trim() || `yt-dlp -U salió con código ${code}`)));
  });
  await fs.writeFile(UPDATE_STAMP, new Date().toISOString());
  const m = out.match(/Updated yt-dlp to\s+\S*?([\d.]+)/i);
  return { updated: Boolean(m), version: m ? m[1] : undefined };
}

const VIDEO_QUALITY = {
  best: 'bv*+ba/b',
  '2160': 'bv*[height<=2160]+ba/b[height<=2160]',
  '1440': 'bv*[height<=1440]+ba/b[height<=1440]',
  '1080': 'bv*[height<=1080]+ba/b[height<=1080]',
  '720': 'bv*[height<=720]+ba/b[height<=720]',
  '480': 'bv*[height<=480]+ba/b[height<=480]',
};
const AUDIO_QUALITY = { best: '0', '320': '320K', '192': '192K', '128': '128K' };

export function downloadWithYtDlp({ ytDlpPath, url, format, quality = 'best', playlist = false, outputDir, job, onProgress, onLog }) {
  return new Promise((resolve, reject) => {
    const outTemplate = playlist
      ? path.join(outputDir, '%(playlist_title|Playlist)s', '%(playlist_index|0)03d - %(title)s.%(ext)s')
      : path.join(outputDir, '%(title)s.%(ext)s');

    const args = [
      url,
      '-o', outTemplate,
      playlist ? '--yes-playlist' : '--no-playlist',
      '--newline',
      '--no-color',
      '--no-mtime',
      '--progress',
      '--progress-template', '[download] %(progress._percent_str)s at %(progress._speed_str)s ETA %(progress._eta_str)s',
      '--print', 'after_move:filepath'
    ];
    if (playlist) args.push('--ignore-errors');

    const ffmpeg = getFfmpegPath();
    if (ffmpeg) args.push('--ffmpeg-location', ffmpeg);

    if (format === 'mp3') {
      args.push('--extract-audio', '--audio-format', 'mp3', '--audio-quality', AUDIO_QUALITY[quality] || '0', '--embed-thumbnail', '--embed-metadata');
    } else {
      args.push('-f', VIDEO_QUALITY[quality] || VIDEO_QUALITY.best, '--merge-output-format', 'mp4');
    }

    // Force UTF-8 output so titles with accents produce a correct file path
    const child = spawn(ytDlpPath, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
      env: { ...process.env, PYTHONIOENCODING: 'utf-8', PYTHONUTF8: '1' }
    });
    if (job) job.child = child;

    const outputFiles = [];
    let errBuf = '';

    function handleLine(stream, line) {
      if (!line) return;
      if (onLog) onLog({ stream, line });
      // after_move:filepath prints each final absolute path on its own line
      if (stream === 'stdout' && (/^[a-zA-Z]:\\/.test(line) || /^\//.test(line))) {
        outputFiles.push(line.trim());
        if (onProgress) onProgress({ stage: 'done-item', file: line.trim(), count: outputFiles.length });
        return;
      }
      const item = line.match(/Downloading item (\d+) of (\d+)/i);
      if (item && onProgress) onProgress({ stage: 'item', index: +item[1], total: +item[2] });
      const m = line.match(/\[download\]\s+((?:\d+[\.,]\d+)|\d+)%/);
      if (m && onProgress) {
        const percent = parseFloat(String(m[1]).replace(',', '.'));
        const speedMatch = line.match(/\bat\s+(\S+\/s)/i);
        const etaMatch = line.match(/ETA\s+([0-9:]+)/i);
        onProgress({ percent, stage: 'download', speed: speedMatch?.[1], eta: etaMatch?.[1] });
      }
      if (onProgress) {
        if (/\[ExtractAudio\]/.test(line)) onProgress({ stage: 'postprocess', step: 'extract-audio' });
        if (/\[Merger\]/.test(line)) onProgress({ stage: 'postprocess', step: 'merge' });
      }
    }

    const splitLines = (chunk) => chunk.toString('utf-8').replace(/\r/g, '\n').split('\n');
    child.stdout.on('data', (chunk) => splitLines(chunk).forEach(l => handleLine('stdout', l)));
    child.stderr.on('data', (chunk) => {
      errBuf += chunk.toString('utf-8');
      splitLines(chunk).forEach(l => handleLine('stderr', l));
    });

    child.on('error', (err) => reject(err));
    child.on('close', (code) => {
      if (job) job.child = null;
      if (job?.cancelled) return reject(Object.assign(new Error('Cancelado'), { cancelled: true }));
      // With --ignore-errors a playlist can exit non-zero while still downloading most items
      if (code === 0 || (playlist && outputFiles.length)) {
        resolve({ outputFile: outputFiles[outputFiles.length - 1] || null, outputFiles });
      } else {
        const errorLines = errBuf.split(/\r?\n/).filter(l => /^ERROR:/.test(l));
        reject(new Error(errorLines.join('\n') || errBuf.trim() || `yt-dlp salió con código ${code}`));
      }
    });
  });
}
