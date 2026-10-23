import { app, BrowserWindow, ipcMain, dialog, shell } from 'electron';
import updaterPkg from 'electron-updater';
const { autoUpdater } = updaterPkg;
import path from 'node:path';
import url from 'node:url';
import os from 'node:os';
import fs from 'node:fs/promises';
import { spawn } from 'node:child_process';
import JSZip from 'jszip';
import mammoth from 'mammoth';
import { ensureYtDlp, updateYtDlp, downloadWithYtDlp } from './ytdlp.js';
import { analyzeAudio, writeTags } from './analyze.js';
import { scanLibrary, recommendTracks } from './library.js';
import { getFfmpegPath } from './binaries.js';
import { registerJob, finishJob, cancelJob } from './jobs.js';
import { register as registerMedia } from './tools/media.js';
import { register as registerOrganizer } from './tools/organizer.js';
import { register as registerMinecraft } from './tools/minecraft.js';
import { register as registerSystem } from './tools/system.js';
import { initScheduler, listJobs as schedList, createJob as schedCreate, removeJob as schedRemove, toggleJob as schedToggle, runNow as schedRunNow, getLogs as schedGetLogs } from './scheduler.js';

const isDev = !app.isPackaged;
const __dirname = path.dirname(url.fileURLToPath(import.meta.url));

let mainWindow = null;
let ytDlpReady = null;

const errMsg = (err) => err?.message || String(err);

function sendToRenderer(channel, payload) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, payload ?? {});
  }
}

// Downloads yt-dlp if missing and updates it in the background, without blocking the window.
function prepareYtDlp() {
  if (!ytDlpReady) {
    ytDlpReady = ensureYtDlp()
      .then(async (p) => {
        const r = await updateYtDlp(p).catch((err) => ({ updated: false, error: errMsg(err) }));
        sendToRenderer('youtube:toolStatus', { ready: true, ...r });
        return p;
      })
      .catch((err) => {
        ytDlpReady = null; // allow retry on next download
        sendToRenderer('youtube:toolStatus', { ready: false, error: errMsg(err) });
        throw err;
      });
  }
  return ytDlpReady;
}

async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1100,
    height: 720,
    minWidth: 900,
    minHeight: 600,
    title: 'Crushed Toolkit',
    autoHideMenuBar: true,
    backgroundColor: '#0b0f14',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: path.join(__dirname, 'preload.cjs')
    }
  });

  // Web links open in the system browser; about:blank stays in-app (DOCX preview window)
  mainWindow.webContents.setWindowOpenHandler(({ url: target }) => {
    if (/^https?:\/\//i.test(target)) {
      shell.openExternal(target);
      return { action: 'deny' };
    }
    return { action: target === 'about:blank' ? 'allow' : 'deny', overrideBrowserWindowOptions: { autoHideMenuBar: true, backgroundColor: '#ffffff' } };
  });

  await mainWindow.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));

  if (isDev) {
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  }
}

function setupUpdater() {
  autoUpdater.removeAllListeners();
  autoUpdater.on('checking-for-update', () => sendToRenderer('updater:checking'));
  autoUpdater.on('update-available', (info) => sendToRenderer('updater:available', info));
  autoUpdater.on('update-not-available', (info) => sendToRenderer('updater:not_available', info));
  autoUpdater.on('error', (err) => sendToRenderer('updater:error', { message: errMsg(err) }));
  autoUpdater.on('download-progress', (p) => sendToRenderer('updater:progress', p));
  autoUpdater.on('update-downloaded', (info) => sendToRenderer('updater:downloaded', info));
  if (!isDev) {
    autoUpdater.autoDownload = true;
    autoUpdater.autoInstallOnAppQuit = true;
    autoUpdater.checkForUpdates().catch(() => {});
  }
}

// Windows Task Scheduler (schtasks)
function runProcess(cmd, args, opts = {}) {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { windowsHide: true, ...opts });
    let out = ''; let err = '';
    child.stdout.on('data', d => out += d.toString());
    child.stderr.on('data', d => err += d.toString());
    child.on('error', (e) => resolve({ code: -1, out, err: errMsg(e) }));
    child.on('close', (code) => resolve({ code, out, err }));
  });
}

function parseCsvLine(line) {
  const out = []; let cur = ''; let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') { if (inQ && line[i + 1] === '"') { cur += '"'; i++; } else { inQ = !inQ; } }
    else if (ch === ',' && !inQ) { out.push(cur); cur = ''; }
    else cur += ch;
  }
  out.push(cur);
  return out;
}

const WEEKDAYS = { workdays: 'MON,TUE,WED,THU,FRI', weekend: 'SAT,SUN' };

function buildSchTasksSchedule(schedule, startTime) {
  const st = startTime && /^\d{2}:\d{2}$/.test(startTime) ? ['/ST', startTime] : [];
  const every = Math.max(1, parseInt(schedule?.every, 10) || 1);
  switch (schedule?.type) {
    case 'MINUTE': return ['/SC', 'MINUTE', '/MO', String(Math.min(every, 1439))];
    case 'HOURLY': return ['/SC', 'HOURLY', '/MO', String(Math.min(every, 23))];
    case 'DAILY': return ['/SC', 'DAILY', ...st];
    case 'WEEKLY': return ['/SC', 'WEEKLY', '/D', WEEKDAYS[schedule.days] || WEEKDAYS.workdays, ...st];
    case 'MONTHLY': return ['/SC', 'MONTHLY', '/D', String(Math.min(31, every)), ...st];
    default: return ['/SC', 'ONCE', ...(st.length ? st : ['/ST', '09:00'])];
  }
}

function registerIpc() {
  const toolCtx = { ipcMain, send: sendToRenderer, getWindow: () => mainWindow };
  registerMedia(toolCtx);
  registerOrganizer(toolCtx);
  registerMinecraft(toolCtx);
  registerSystem(toolCtx);

  // In-app scheduler
  ipcMain.handle('scheduler:list', async () => {
    try { return { ok: true, jobs: schedList() }; } catch (err) { return { ok: false, error: errMsg(err) }; }
  });
  ipcMain.handle('scheduler:create', async (_e, def) => {
    try { const d = await schedCreate(def, true); return { ok: true, def: d }; } catch (err) { return { ok: false, error: errMsg(err) }; }
  });
  ipcMain.handle('scheduler:remove', async (_e, id) => {
    try { const r = await schedRemove(id); return { ok: r }; } catch (err) { return { ok: false, error: errMsg(err) }; }
  });
  ipcMain.handle('scheduler:toggle', async (_e, payload) => {
    try { const { id, enabled } = payload || {}; const r = await schedToggle(id, enabled); return { ok: r }; } catch (err) { return { ok: false, error: errMsg(err) }; }
  });
  ipcMain.handle('scheduler:runNow', async (_e, id) => {
    try { await schedRunNow(id); return { ok: true }; } catch (err) { return { ok: false, error: errMsg(err) }; }
  });
  ipcMain.handle('scheduler:logs', async (_e, id) => {
    try { return { ok: true, logs: schedGetLogs(id) }; } catch (err) { return { ok: false, error: errMsg(err) }; }
  });

  // Windows scheduler: only tasks in the root folder (user tasks), not \Microsoft\...
  ipcMain.handle('winsched:list', async () => {
    try {
      // chcp 65001 so accents come out as UTF-8 instead of the OEM codepage
      const r = await runProcess('cmd.exe', ['/d', '/s', '/c', 'chcp 65001>nul & schtasks /Query /FO CSV /NH']);
      if (r.code !== 0) return { ok: false, error: r.err || r.out };
      const tasks = r.out.split(/\r?\n/)
        .filter(Boolean)
        .map(parseCsvLine)
        .filter(cols => cols.length >= 3 && /^\\[^\\]+$/.test(cols[0]))
        .map(([name, nextRun, status]) => ({ name: name.slice(1), nextRun, status }));
      return { ok: true, tasks };
    } catch (err) { return { ok: false, error: errMsg(err) }; }
  });

  ipcMain.handle('winsched:create', async (_e, payload) => {
    try {
      const { name, cmd, schedule, startTime } = payload || {};
      if (!name || !cmd || !schedule) return { ok: false, error: 'Faltan el nombre o el comando' };
      // No shell: arguments go straight to schtasks, so the command can't inject extra flags
      const args = ['/Create', '/TN', name, '/TR', cmd, '/F', ...buildSchTasksSchedule(schedule, startTime)];
      const r = await runProcess('schtasks', args);
      if (r.code !== 0) return { ok: false, error: (r.err || r.out).trim() };
      return { ok: true };
    } catch (err) { return { ok: false, error: errMsg(err) }; }
  });

  ipcMain.handle('winsched:delete', async (_e, name) => {
    try {
      if (!name) return { ok: false, error: 'Nombre requerido' };
      const r = await runProcess('schtasks', ['/Delete', '/TN', name, '/F']);
      if (r.code !== 0) return { ok: false, error: (r.err || r.out).trim() };
      return { ok: true };
    } catch (err) { return { ok: false, error: errMsg(err) }; }
  });

  // Documents: DOCX conversions
  ipcMain.handle('doc:docxToHtml', async (_evt, filePath) => {
    try {
      const buf = await fs.readFile(filePath);
      const { value: html } = await mammoth.convertToHtml({ buffer: buf });
      return { ok: true, html };
    } catch (err) {
      return { ok: false, error: errMsg(err) };
    }
  });

  ipcMain.handle('doc:docxToPdf', async (_evt, filePath) => {
    let win = null;
    try {
      const buf = await fs.readFile(filePath);
      const { value: html } = await mammoth.convertToHtml({ buffer: buf });
      // Hidden window renders the HTML and prints it to PDF; scripts disabled since the content is untrusted
      win = new BrowserWindow({ show: false, webPreferences: { sandbox: true, javascript: false } });
      await win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(`<!doctype html><html><head><meta charset="utf-8"><style>body{font-family:Arial,Helvetica,sans-serif;}img{max-width:100%;}</style></head><body>${html}</body></html>`));
      const pdfData = await win.webContents.printToPDF({
        landscape: false,
        pageSize: 'A4',
        printBackground: true,
        margins: { marginType: 'default' }
      });
      const outPath = filePath.replace(/\.docx?$/i, '') + '.pdf';
      await fs.writeFile(outPath, pdfData);
      return { ok: true, filePath: outPath };
    } catch (err) {
      return { ok: false, error: errMsg(err) };
    } finally {
      try { win?.destroy(); } catch {}
    }
  });

  // Updater
  ipcMain.handle('updater:check', async () => {
    if (isDev) return { ok: false, error: 'Las actualizaciones solo funcionan en la app instalada' };
    try {
      await autoUpdater.checkForUpdates();
      return { ok: true };
    } catch (err) {
      return { ok: false, error: errMsg(err) };
    }
  });

  ipcMain.handle('updater:quitAndInstall', async () => {
    try {
      autoUpdater.quitAndInstall();
      return { ok: true };
    } catch (err) {
      return { ok: false, error: errMsg(err) };
    }
  });

  ipcMain.handle('dialog:chooseDirectory', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, { properties: ['openDirectory', 'createDirectory'] });
    if (canceled || !filePaths?.length) return null;
    return filePaths[0];
  });

  ipcMain.handle('dialog:chooseFile', async (_evt, filters) => {
    const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
      properties: ['openFile'],
      filters: Array.isArray(filters) && filters.length ? filters : [
        { name: 'Audio', extensions: ['mp3', 'wav', 'flac', 'm4a', 'aac', 'ogg'] }
      ]
    });
    if (canceled || !filePaths?.length) return null;
    return filePaths[0];
  });

  ipcMain.handle('dialog:chooseFiles', async (_evt, filters) => {
    const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
      properties: ['openFile', 'multiSelections'],
      filters: Array.isArray(filters) && filters.length ? filters : undefined
    });
    return canceled ? [] : filePaths;
  });

  ipcMain.handle('shell:trash', async (_evt, paths) => {
    const results = [];
    for (const p of Array.isArray(paths) ? paths : []) {
      try { await shell.trashItem(path.normalize(p)); results.push({ path: p, ok: true }); }
      catch (err) { results.push({ path: p, ok: false, error: errMsg(err) }); }
    }
    return { ok: results.every(r => r.ok), results };
  });

  ipcMain.handle('file:readText', async (_evt, p) => {
    try { return { ok: true, text: await fs.readFile(p, 'utf-8') }; } catch (err) { return { ok: false, error: errMsg(err) }; }
  });

  // Writes text, keeping a .bak of the previous content
  ipcMain.handle('file:writeText', async (_evt, { file, text, backup = true }) => {
    try {
      if (backup) await fs.copyFile(file, file + '.bak').catch(() => {});
      await fs.writeFile(file, text, 'utf-8');
      return { ok: true, file };
    } catch (err) { return { ok: false, error: errMsg(err) }; }
  });

  // Writes binary entries [{ name, data: Uint8Array }] into a folder (used by the texture optimizer)
  ipcMain.handle('file:writeMany', async (_evt, { dir, entries }) => {
    try {
      await fs.mkdir(dir, { recursive: true });
      const files = [];
      for (const e of entries || []) {
        const target = path.join(dir, path.basename(String(e.name)));
        await fs.writeFile(target, Buffer.from(e.data));
        files.push(target);
      }
      return { ok: true, files };
    } catch (err) { return { ok: false, error: errMsg(err) }; }
  });

  ipcMain.handle('shell:openPath', async (_evt, p) => {
    const error = await shell.openPath(path.normalize(String(p || '')));
    return error ? { ok: false, error } : { ok: true };
  });

  ipcMain.handle('system:getDefaults', async () => {
    return {
      appVersion: app.getVersion(),
      downloadsDir: app.getPath('downloads') || path.join(os.homedir(), 'Downloads'),
      ffmpegAvailable: Boolean(getFfmpegPath()),
    };
  });

  ipcMain.handle('youtube:download', async (_evt, payload) => {
    const { url: videoUrl, format, quality, playlist, outputDir, jobId } = payload || {};
    if (!videoUrl || !/^https?:\/\//i.test(videoUrl)) {
      return { ok: false, error: 'URL inválida' };
    }
    const job = registerJob(jobId);
    try {
      const yt = await prepareYtDlp();
      const result = await downloadWithYtDlp({
        ytDlpPath: yt,
        url: videoUrl,
        format,
        quality,
        playlist,
        outputDir,
        job,
        onProgress: (p) => sendToRenderer('youtube:progress', { jobId, ...p }),
        onLog: (entry) => sendToRenderer('youtube:log', { jobId, ...entry })
      });
      return { ok: true, file: result.outputFile, files: result.outputFiles };
    } catch (err) {
      return { ok: false, cancelled: Boolean(err?.cancelled), error: errMsg(err) };
    } finally {
      finishJob(jobId);
    }
  });

  ipcMain.handle('youtube:updateTool', async () => {
    try {
      const p = await prepareYtDlp();
      const r = await updateYtDlp(p, { force: true });
      return { ok: true, ...r };
    } catch (err) { return { ok: false, error: errMsg(err) }; }
  });

  ipcMain.handle('job:cancel', async (_evt, jobId) => ({ ok: cancelJob(jobId) }));

  ipcMain.handle('shell:showItemInFolder', async (_evt, filePath) => {
    try {
      if (!filePath) return { ok: false, error: 'Ruta vacía' };
      let p = filePath;
      if (String(p).startsWith('file://')) {
        try { p = url.fileURLToPath(p); } catch {}
      }
      p = path.normalize(p);
      try {
        await fs.access(p);
        shell.showItemInFolder(p);
        return { ok: true };
      } catch {
        // If file not found, try opening its directory
        const dir = path.dirname(p);
        try { await fs.access(dir); await shell.openPath(dir); return { ok: true, openedDir: dir }; } catch {}
        return { ok: false, error: 'Archivo no encontrado' };
      }
    } catch (err) {
      return { ok: false, error: errMsg(err) };
    }
  });

  ipcMain.handle('audio:analyze', async (_evt, filePath) => {
    if (!filePath) return { ok: false, error: 'Archivo no especificado' };
    try {
      const result = await analyzeAudio(filePath);
      return { ok: true, result };
    } catch (err) {
      return { ok: false, error: errMsg(err) };
    }
  });

  ipcMain.handle('audio:writeTags', async (_evt, payload) => {
    const { filePath, bpm, key } = payload || {};
    if (!filePath) return { ok: false, error: 'Archivo no especificado' };
    try {
      await writeTags(filePath, { bpm, key });
      return { ok: true };
    } catch (err) {
      return { ok: false, error: errMsg(err) };
    }
  });

  // Save file helper for renderer (images, etc.)
  ipcMain.handle('file:save', async (_evt, payload) => {
    try {
      const { defaultPath, dataBase64, filters, title } = payload || {};
      const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
        title: title || 'Guardar archivo',
        defaultPath: defaultPath || 'output.bin',
        filters: filters || [
          { name: 'Imágenes', extensions: ['png', 'jpg', 'jpeg', 'webp', 'avif'] },
          { name: 'Todos los archivos', extensions: ['*'] }
        ]
      });
      if (canceled || !filePath) return { ok: false, canceled: true };
      await fs.writeFile(filePath, Buffer.from(dataBase64 || '', 'base64'));
      return { ok: true, filePath };
    } catch (err) {
      return { ok: false, error: errMsg(err) };
    }
  });

  // Build a ZIP from renderer-provided entries [{ name, data: Uint8Array }] and save it
  ipcMain.handle('file:saveZip', async (_evt, payload) => {
    try {
      const { defaultPath, entries, title } = payload || {};
      if (!Array.isArray(entries) || !entries.length) return { ok: false, error: 'No hay archivos para comprimir' };
      const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
        title: title || 'Guardar ZIP',
        defaultPath: defaultPath || 'archivos.zip',
        filters: [{ name: 'ZIP', extensions: ['zip'] }]
      });
      if (canceled || !filePath) return { ok: false, canceled: true };
      const zip = new JSZip();
      for (const e of entries) zip.file(path.basename(String(e.name)), e.data);
      const buf = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
      await fs.writeFile(filePath, buf);
      return { ok: true, filePath };
    } catch (err) {
      return { ok: false, error: errMsg(err) };
    }
  });

  ipcMain.handle('library:scan', async (_evt, folder) => {
    if (!folder) return { ok: false, error: 'Carpeta no especificada' };
    try {
      const tracks = await scanLibrary(folder);
      return { ok: true, tracks };
    } catch (err) {
      return { ok: false, error: errMsg(err) };
    }
  });

  ipcMain.handle('library:recommend', async (_evt, payload) => {
    try {
      const { tracks, referenceFile, bpmTolerance } = payload || {};
      if (!Array.isArray(tracks) || !referenceFile) return { ok: false, error: 'Datos insuficientes' };
      const recs = recommendTracks(tracks, referenceFile, bpmTolerance ?? 3);
      return { ok: true, recommendations: recs };
    } catch (err) {
      return { ok: false, error: errMsg(err) };
    }
  });
}

app.whenReady().then(async () => {
  registerIpc();
  setupUpdater();
  try { await initScheduler(app.getPath('userData')); } catch (err) { console.error('Scheduler init failed:', err); }
  await createWindow();
  prepareYtDlp().catch(() => {});

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
