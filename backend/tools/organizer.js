import path from 'node:path';
import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import NodeID3 from 'node-id3';
import { scanLibrary } from '../library.js';
import { analyzeAudio } from '../analyze.js';
import { registerJob, finishJob } from '../jobs.js';

const errMsg = (err) => err?.message || String(err);
const isMp3 = (f) => /\.mp3$/i.test(f);

// Characters Windows does not allow in file names, plus trailing dots/spaces
function sanitizeName(name) {
  return String(name).replace(/[<>:"/\\|?*\u0000-\u001f]/g, '').replace(/\s+/g, ' ').replace(/[. ]+$/, '').trim().slice(0, 200);
}

async function renameFiles(items) {
  const results = [];
  for (const { from, to } of items) {
    try {
      const ext = path.extname(from);
      const base = sanitizeName(to);
      if (!base) throw new Error('El nombre queda vacío');
      const target = path.join(path.dirname(from), base + ext);
      if (path.resolve(target).toLowerCase() === path.resolve(from).toLowerCase() && path.basename(target) === path.basename(from)) {
        results.push({ from, to: from, ok: true, unchanged: true });
        continue;
      }
      // Case-only renames on Windows: the target "exists" because it is the same file
      const sameFileDifferentCase = path.resolve(target).toLowerCase() === path.resolve(from).toLowerCase();
      if (existsSync(target) && !sameFileDifferentCase) throw new Error('Ya existe un archivo con ese nombre');
      await fs.rename(from, target);
      results.push({ from, to: target, ok: true });
    } catch (err) {
      results.push({ from, ok: false, error: errMsg(err) });
    }
  }
  return results;
}

function writeTagsMp3(file, { title, artist, album, bpm, key }) {
  if (!isMp3(file)) throw new Error('Solo se pueden editar etiquetas de MP3');
  const tags = {};
  if (title != null) tags.title = String(title);
  if (artist != null) tags.artist = String(artist);
  if (album != null) tags.album = String(album);
  if (bpm != null && bpm !== '') tags.TBPM = String(bpm);
  if (key != null && key !== '') tags.TKEY = String(key);
  const res = NodeID3.update(tags, file);
  if (res !== true) throw new Error(res?.message || 'No se pudieron escribir las etiquetas');
}

export function register({ ipcMain, send }) {
  ipcMain.handle('organizer:scan', async (_evt, folder) => {
    try {
      if (!folder) throw new Error('Elige una carpeta');
      const tracks = await scanLibrary(folder);
      return { ok: true, tracks: tracks.map(t => ({ ...t, ext: path.extname(t.file).slice(1).toLowerCase() })) };
    } catch (err) { return { ok: false, error: errMsg(err) }; }
  });

  ipcMain.handle('organizer:rename', async (_evt, items) => {
    try { return { ok: true, results: await renameFiles(Array.isArray(items) ? items : []) }; }
    catch (err) { return { ok: false, error: errMsg(err) }; }
  });

  ipcMain.handle('organizer:writeTags', async (_evt, payload) => {
    try { writeTagsMp3(payload.file, payload); return { ok: true }; }
    catch (err) { return { ok: false, error: errMsg(err) }; }
  });

  ipcMain.handle('organizer:setCover', async (_evt, { files, image }) => {
    try {
      const imageBuffer = await fs.readFile(image);
      const mime = /\.png$/i.test(image) ? 'image/png' : 'image/jpeg';
      const results = [];
      for (const f of files || []) {
        if (!isMp3(f)) { results.push({ file: f, ok: false, error: 'Solo MP3' }); continue; }
        const res = NodeID3.update({ image: { mime, type: { id: 3, name: 'front cover' }, description: 'Cover', imageBuffer } }, f);
        results.push(res === true ? { file: f, ok: true } : { file: f, ok: false, error: res?.message || 'Error' });
      }
      return { ok: true, results };
    } catch (err) { return { ok: false, error: errMsg(err) }; }
  });

  // Analyse BPM + key for many files, writing tags to the MP3s
  ipcMain.handle('organizer:analyze', async (_evt, { jobId, files, write = true }) => {
    const job = registerJob(jobId);
    const results = [];
    try {
      for (let i = 0; i < files.length; i++) {
        if (job.cancelled) return { ok: false, cancelled: true, error: 'Cancelado', results };
        const f = files[i];
        send('job:progress', { jobId, fraction: i / files.length, message: `Analizando ${i + 1}/${files.length} · ${path.basename(f)}` });
        try {
          const r = await analyzeAudio(f);
          let written = false;
          if (write && isMp3(f) && (r.bpm || r.key)) { writeTagsMp3(f, { bpm: r.bpm, key: r.key }); written = true; }
          results.push({ file: f, ok: true, ...r, written });
        } catch (err) {
          results.push({ file: f, ok: false, error: errMsg(err) });
        }
        send('job:progress', { jobId, item: results[results.length - 1] });
      }
      send('job:progress', { jobId, fraction: 1, message: 'Análisis terminado' });
      return { ok: true, results };
    } finally {
      finishJob(jobId);
    }
  });
}
