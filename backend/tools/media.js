import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { registerJob, finishJob, getMediaInfo, runFfmpeg, parseTime } from '../jobs.js';

const errMsg = (err) => err?.message || String(err);

// name.ext -> dir/name<suffix>.newExt, never overwriting the input or an existing file
function outputPath(input, { dir, suffix = '', ext }) {
  const base = path.basename(input, path.extname(input));
  const folder = dir || path.dirname(input);
  let candidate = path.join(folder, `${base}${suffix}.${ext}`);
  for (let i = 2; existsSync(candidate) || path.resolve(candidate) === path.resolve(input); i++) {
    candidate = path.join(folder, `${base}${suffix}-${i}.${ext}`);
  }
  return candidate;
}

function trimArgs(start, end, duration) {
  const s = parseTime(start) ?? 0;
  const e = parseTime(end);
  if (e != null && e <= s) throw new Error('El final del recorte debe ser posterior al inicio.');
  const length = (e ?? duration) - s;
  if (!(length > 0)) throw new Error('El recorte queda vacío.');
  return { args: [...(s ? ['-ss', String(s)] : []), ...(e != null ? ['-t', String(length)] : [])], length };
}

// Picks a resolution the bitrate can actually sustain
function autoHeight(videoKbps) {
  if (videoKbps >= 4000) return 1080;
  if (videoKbps >= 1600) return 720;
  if (videoKbps >= 700) return 480;
  return 360;
}

async function compressVideo({ input, targetMB, maxHeight = 'auto', audioKbps = 96, start, end }, job, progress) {
  const info = await getMediaInfo(input);
  if (!info.hasVideo) throw new Error('El archivo no tiene pista de vídeo.');
  const { args: trim, length } = trimArgs(start, end, info.duration);

  const totalKbit = Number(targetMB) * 8 * 1024 * 0.94; // MiB -> kbit, ~6% margin for container overhead
  const aKbps = info.hasAudio ? Number(audioKbps) : 0;
  const videoKbps = Math.floor(totalKbit / length - aKbps);
  if (videoKbps < 80) {
    throw new Error(`Con ${length.toFixed(0)} s no cabe en ${targetMB} MB con calidad decente. Recorta el vídeo o elige un tamaño mayor.`);
  }
  const height = maxHeight === 'auto' ? autoHeight(videoKbps) : Number(maxHeight);
  const vf = info.height && info.height > height ? ['-vf', `scale=-2:${height}`] : [];

  const out = outputPath(input, { suffix: `-${targetMB}MB`, ext: 'mp4' });
  const passlog = path.join(os.tmpdir(), `ctk-pass-${Date.now()}`);
  const common = ['-c:v', 'libx264', '-preset', 'medium', '-b:v', `${videoKbps}k`, '-maxrate', `${Math.floor(videoKbps * 1.4)}k`, '-bufsize', `${videoKbps * 2}k`, ...vf, '-pix_fmt', 'yuv420p', '-passlogfile', passlog];
  try {
    progress(0, 'Analizando (pasada 1 de 2)…');
    await runFfmpeg([...trim, '-i', input, ...common, '-pass', '1', '-an', '-f', 'null', process.platform === 'win32' ? 'NUL' : '/dev/null'],
      { job, duration: length, onProgress: (f) => progress(f * 0.5, 'Analizando (pasada 1 de 2)…') });
    const audio = info.hasAudio ? ['-c:a', 'aac', '-b:a', `${aKbps}k`] : ['-an'];
    await runFfmpeg([...trim, '-i', input, ...common, '-pass', '2', ...audio, '-movflags', '+faststart', out],
      { job, duration: length, onProgress: (f) => progress(0.5 + f * 0.5, 'Comprimiendo (pasada 2 de 2)…') });
  } finally {
    for (const suffix of ['-0.log', '-0.log.mbtree']) await fs.unlink(passlog + suffix).catch(() => {});
  }
  const size = (await fs.stat(out)).size;
  return { file: out, size, height: Math.min(height, info.height || height), videoKbps, fits: size <= Number(targetMB) * 1024 * 1024 };
}

async function makeGif({ input, start, end, width = 480, fps = 15 }, job, progress) {
  const info = await getMediaInfo(input);
  if (!info.hasVideo) throw new Error('El archivo no tiene pista de vídeo.');
  const { args: trim, length } = trimArgs(start, end, info.duration);
  if (length > 60) throw new Error('Para un GIF recorta como mucho 60 segundos.');
  const out = outputPath(input, { ext: 'gif' });
  // palettegen/paletteuse in one graph gives far better colours than the default GIF palette
  const filter = `fps=${Number(fps)},scale=${Number(width)}:-1:flags=lanczos,split[a][b];[a]palettegen=stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=4`;
  await runFfmpeg([...trim, '-i', input, '-filter_complex', filter, '-loop', '0', out],
    { job, duration: length, onProgress: (f) => progress(f, 'Generando GIF…') });
  return { file: out, size: (await fs.stat(out)).size };
}

const AUDIO_CODECS = {
  mp3: (kbps) => ['-c:a', 'libmp3lame', '-b:a', `${kbps}k`],
  m4a: (kbps) => ['-c:a', 'aac', '-b:a', `${kbps}k`],
  ogg: (kbps) => ['-c:a', 'libvorbis', '-b:a', `${kbps}k`],
  opus: (kbps) => ['-c:a', 'libopus', '-b:a', `${kbps}k`],
  wav: () => ['-c:a', 'pcm_s16le'],
  flac: () => ['-c:a', 'flac'],
};

async function batchAudio({ files, format, bitrate = 320, start, end, normalize, outputDir }, job, progress, onItem) {
  const codec = AUDIO_CODECS[format];
  if (!codec) throw new Error(`Formato no soportado: ${format}`);
  if (!Array.isArray(files) || !files.length) throw new Error('No hay archivos.');
  const results = [];
  for (let i = 0; i < files.length; i++) {
    const input = files[i];
    const label = `${i + 1}/${files.length} · ${path.basename(input)}`;
    try {
      const info = await getMediaInfo(input);
      if (!info.hasAudio) throw new Error('No tiene pista de audio');
      const { args: trim, length } = trimArgs(start, end, info.duration);
      const out = outputPath(input, { dir: outputDir || undefined, ext: format });
      // loudnorm to -14 LUFS (streaming level), true peak -1 dB
      const af = normalize ? ['-af', 'loudnorm=I=-14:TP=-1:LRA=11'] : [];
      await runFfmpeg([...trim, '-i', input, '-map', '0:a:0', '-map_metadata', '0', ...af, ...codec(bitrate), out],
        { job, duration: length, onProgress: (f) => progress((i + f) / files.length, label) });
      results.push({ input, ok: true, file: out });
    } catch (err) {
      if (err?.cancelled) throw err;
      results.push({ input, ok: false, error: errMsg(err) });
    }
    onItem(results[results.length - 1]);
  }
  progress(1, 'Terminado');
  return { results };
}

export function register({ ipcMain, send }) {
  // Wraps a job handler: registers it for cancellation and streams progress to the renderer
  const handleJob = (channel, fn) => ipcMain.handle(channel, async (_evt, payload) => {
    const jobId = payload?.jobId;
    const job = registerJob(jobId);
    const progress = (fraction, message) => send('job:progress', { jobId, fraction, message });
    const onItem = (item) => send('job:progress', { jobId, item });
    try {
      return { ok: true, ...(await fn(payload || {}, job, progress, onItem)) };
    } catch (err) {
      return { ok: false, cancelled: Boolean(err?.cancelled), error: errMsg(err) };
    } finally {
      finishJob(jobId);
    }
  });

  ipcMain.handle('media:info', async (_evt, file) => {
    try { return { ok: true, info: await getMediaInfo(file) }; } catch (err) { return { ok: false, error: errMsg(err) }; }
  });
  handleJob('media:compressVideo', compressVideo);
  handleJob('media:makeGif', makeGif);
  handleJob('media:batchAudio', batchAudio);
}
