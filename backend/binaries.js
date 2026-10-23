import path from 'node:path';
import { existsSync } from 'node:fs';
import ffmpegStatic from 'ffmpeg-static';

export function which(cmd) {
  const SEP = process.platform === 'win32' ? ';' : ':';
  // '' first so names that already carry an extension (yt-dlp.exe) also match
  const exts = process.platform === 'win32' ? ['', ...(process.env.PATHEXT || '').split(';')] : [''];
  const paths = (process.env.PATH || '').split(SEP).filter(Boolean);
  for (const p of paths) {
    for (const e of exts) {
      const full = path.join(p, cmd + e);
      if (existsSync(full)) return full;
    }
  }
  return null;
}

// Bundled ffmpeg (ffmpeg-static) first; inside a packaged app it lives in app.asar.unpacked.
// Falls back to an ffmpeg found in PATH.
export function getFfmpegPath() {
  if (ffmpegStatic) {
    const unpacked = ffmpegStatic.replace(`app.asar${path.sep}`, `app.asar.unpacked${path.sep}`);
    if (existsSync(unpacked)) return unpacked;
  }
  return which('ffmpeg');
}
