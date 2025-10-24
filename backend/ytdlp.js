import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs/promises';
import { existsSync, createWriteStream } from 'node:fs';
import { spawn } from 'node:child_process';
import https from 'node:https';

const BIN_DIR = path.join(os.homedir(), '.crushed-toolkit', 'bin');
const YT_WIN_URL = 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe';
const YT_NIX_URL = 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp';

function isWindows() { return process.platform === 'win32'; }

async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true });
}

function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    const file = createWriteStream(dest);
    https.get(url, (response) => {
      if (response.statusCode && response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
        // Follow redirects
        downloadFile(response.headers.location, dest).then(resolve).catch(reject);
        return;
      }
      if (response.statusCode !== 200) {
        reject(new Error(`HTTP ${response.statusCode}`));
        return;
      }
      response.pipe(file);
      file.on('finish', () => file.close(() => resolve(dest)));
    }).on('error', (err) => {
      fs.unlink(dest).catch(() => {});
      reject(err);
    });
  });
}

function which(cmd) {
  const SEP = isWindows() ? ';' : ':';
  const exts = isWindows() ? (process.env.PATHEXT || '').split(';') : [''];
  const paths = (process.env.PATH || '').split(SEP);
  for (const p of paths) {
    const fulls = exts.map((e) => path.join(p, cmd + e));
    for (const full of fulls) {
      if (existsSync(full)) return full;
    }
  }
  return null;
}

export async function ensureYtDlp() {
  // 1) If in PATH, use it
  const inPath = which(isWindows() ? 'yt-dlp.exe' : 'yt-dlp');
  if (inPath) return inPath;

  // 2) Otherwise, ensure local binary exists
  await ensureDir(BIN_DIR);
  const localPath = path.join(BIN_DIR, isWindows() ? 'yt-dlp.exe' : 'yt-dlp');
  if (!existsSync(localPath)) {
    const url = isWindows() ? YT_WIN_URL : YT_NIX_URL;
    await downloadFile(url, localPath);
    if (!isWindows()) {
      await fs.chmod(localPath, 0o755);
    }
  }
  return localPath;
}

export async function checkFfmpegAvailable() {
  const ff = which('ffmpeg');
  return Boolean(ff);
}

export function downloadWithYtDlp({ ytDlpPath, url, format, outputDir, onProgress, onLog }) {
  return new Promise((resolve, reject) => {
    const outTemplate = path.join(outputDir, '%(title)s.%(ext)s');

    const args = [
      url,
      '-o', outTemplate,
      '--no-playlist',
      '--newline',
      '--no-color',
      '--progress',
      '--progress-template', '[download] %(progress._percent_str)s',
      '--print', 'after_move:%(filepath)s'
    ];

    if (format === 'mp3') {
      args.push('--extract-audio', '--audio-format', 'mp3');
    } else {
      // mp4 bestvideo+audio merged
      args.push('-f', 'bv*+ba/best', '--merge-output-format', 'mp4');
    }

    const child = spawn(ytDlpPath, args, { stdio: ['ignore', 'pipe', 'pipe'] });

    let lastOutputFile = null;

    child.stdout.on('data', (chunk) => {
      const text = chunk.toString();
      const lines = text.replace(/\r/g, '\n').split(/\n/);
      for (const line of lines) {
        if (!line) continue;
        if (onLog) onLog({ stream: 'stdout', line });
        // Capture explicit printed final path
        // If yt-dlp printed the final filepath, prefer it
        if (!lastOutputFile) {
          const winAbs = /^[a-zA-Z]:\\/;
          const nixAbs = /^\//;
          if (winAbs.test(line) || nixAbs.test(line)) {
            lastOutputFile = line.trim();
          }
        }
        // Progress lines like: [download]  12.3% ...
        let m = line.match(/\[download\]\s+((?:\d+[\.,]\d+)|\d+)%/);
        if (!m) m = line.match(/((?:\d+[\.,]\d+)|\d+)%/);
        if (m && onProgress) {
          const percent = parseFloat(String(m[1]).replace(',', '.'));
          // Try to capture speed and ETA from the same line
          const speedMatch = line.match(/\bat\s+([\d\.]+\w+\/s)\b/i);
          const etaMatch = line.match(/ETA\s+([0-9:]+)/i);
          onProgress({ percent, stage: 'download', speed: speedMatch ? speedMatch[1] : undefined, eta: etaMatch ? etaMatch[1] : undefined });
        }
        // Post-processing cues
        if (onProgress) {
          if (/\[ExtractAudio\]/.test(line)) onProgress({ stage: 'postprocess', step: 'extract-audio' });
          if (/\[Merger\]/.test(line)) onProgress({ stage: 'postprocess', step: 'merge' });
        }
        // Fallback parsing for output path lines
        if (!lastOutputFile) {
          const f1 = line.match(/Destination:\s(.+)/);
          const f2 = line.match(/\[Merger\].+Merging formats into\s\"(.+)\"/);
          const candidate = (f1 && f1[1]) || (f2 && f2[1]);
          if (candidate) lastOutputFile = candidate;
        }
      }
    });

    let errBuf = '';
    child.stderr.on('data', (chunk) => {
      errBuf += chunk.toString();
      const text = chunk.toString().replace(/\r/g, '\n');
      text.split(/\n/).forEach(l => { if (l && onLog) onLog({ stream: 'stderr', line: l }); });
      let m = text.match(/\[download\]\s+((?:\d+[\.,]\d+)|\d+)%/);
      if (!m) m = text.match(/((?:\d+[\.,]\d+)|\d+)%/);
      if (m && onProgress) {
        const percent = parseFloat(String(m[1]).replace(',', '.'));
        const speedMatch = text.match(/\bat\s+([\d\.]+\w+\/s)\b/i);
        const etaMatch = text.match(/ETA\s+([0-9:]+)/i);
        onProgress({ percent, stage: 'download', speed: speedMatch ? speedMatch[1] : undefined, eta: etaMatch ? etaMatch[1] : undefined });
      }
      if (onProgress) {
        if (/\[ExtractAudio\]/.test(text)) onProgress({ stage: 'postprocess', step: 'extract-audio' });
        if (/\[Merger\]/.test(text)) onProgress({ stage: 'postprocess', step: 'merge' });
      }
    });

    child.on('error', (err) => reject(err));
    child.on('close', (code) => {
      if (code === 0) {
        resolve({ outputFile: lastOutputFile });
      } else {
        reject(new Error(errBuf || `yt-dlp exited with code ${code}`));
      }
    });
  });
}
