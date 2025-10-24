import { app, BrowserWindow, ipcMain, dialog, shell } from 'electron';
import updaterPkg from 'electron-updater';
const { autoUpdater } = updaterPkg;
import path from 'node:path';
import url from 'node:url';
import os from 'node:os';
import fs from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { ensureYtDlp, downloadWithYtDlp, checkFfmpegAvailable } from './ytdlp.js';
import { analyzeAudio, writeTags } from './analyze.js';
import { scanLibrary, recommendTracks } from './library.js';
import mammoth from 'mammoth';
import { initScheduler, listJobs as schedList, createJob as schedCreate, removeJob as schedRemove, toggleJob as schedToggle, runNow as schedRunNow, getLogs as schedGetLogs } from './scheduler.js';

const isDev = !app.isPackaged;

let mainWindow = null;

function getPreloadPath() {
  const base = app.isPackaged ? app.getAppPath() : process.cwd();
  return path.join(base, 'backend', 'preload.cjs');
}

async function createWindow() {
  await ensureYtDlp();

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
      preload: getPreloadPath(),
      sandbox: false
    }
  });

// In-app scheduler IPC
ipcMain.handle('scheduler:list', async () => {
  try { return { ok:true, jobs: schedList() }; } catch (err) { return { ok:false, error: err?.message || String(err) }; }
});
ipcMain.handle('scheduler:create', async (_e, def) => {
  try { const d = await schedCreate(def, true); return { ok:true, def: d }; } catch (err) { return { ok:false, error: err?.message || String(err) }; }
});
ipcMain.handle('scheduler:remove', async (_e, id) => {
  try { const r = await schedRemove(id); return { ok: r }; } catch (err) { return { ok:false, error: err?.message || String(err) }; }
});
ipcMain.handle('scheduler:toggle', async (_e, payload) => {
  try { const { id, enabled } = payload || {}; const r = await schedToggle(id, enabled); return { ok: r }; } catch (err) { return { ok:false, error: err?.message || String(err) }; }
});
ipcMain.handle('scheduler:runNow', async (_e, id) => {
  try { await schedRunNow(id); return { ok:true }; } catch (err) { return { ok:false, error: err?.message || String(err) }; }
});
ipcMain.handle('scheduler:logs', async (_e, id) => {
  try { return { ok:true, logs: schedGetLogs(id) }; } catch (err) { return { ok:false, error: err?.message || String(err) }; }
});

// Windows Task Scheduler (schtasks) minimal IPC
function runSchTasks(args){
  return new Promise((resolve) => {
    const child = spawn('schtasks', args, { windowsHide:true, shell:true });
    let out=''; let err='';
    child.stdout.on('data', d => out += d.toString());
    child.stderr.on('data', d => err += d.toString());
    child.on('close', (code)=> resolve({ code, out, err }));
  });
}

ipcMain.handle('winsched:list', async () => {
  try {
    const r = await runSchTasks(['/Query', '/FO', 'CSV', '/V']);
    if (r.code !== 0) return { ok:false, error: r.err || r.out };
    return { ok:true, raw: r.out };
  } catch (err) { return { ok:false, error: err?.message || String(err) }; }
});

ipcMain.handle('winsched:create', async (_e, payload) => {
  try {
    const { name, cmd, schedule, startTime } = payload || {};
    if (!name || !cmd || !schedule) return { ok:false, error:'Parámetros insuficientes' };
    const args = ['/Create', '/TN', name, '/TR', `"${cmd}"`, '/F'];
    // schedule: DAILY@HH:MM or MINUTE@N
    if (schedule.type === 'DAILY') {
      args.push('/SC', 'DAILY');
      if (startTime) args.push('/ST', startTime);
    } else if (schedule.type === 'MINUTE') {
      args.push('/SC', 'MINUTE', '/MO', String(schedule.every || 5));
    } else {
      args.push('/SC', 'ONCE');
      if (startTime) args.push('/ST', startTime);
    }
    const r = await runSchTasks(args);
    if (r.code !== 0) return { ok:false, error: r.err || r.out };
    return { ok:true };
  } catch (err) { return { ok:false, error: err?.message || String(err) }; }
});

ipcMain.handle('winsched:delete', async (_e, name) => {
  try {
    if (!name) return { ok:false, error:'Nombre requerido' };
    const r = await runSchTasks(['/Delete', '/TN', name, '/F']);
    if (r.code !== 0) return { ok:false, error: r.err || r.out };
    return { ok:true };
  } catch (err) { return { ok:false, error: err?.message || String(err) }; }
});

// Documents: DOCX conversions
ipcMain.handle('doc:docxToHtml', async (_evt, filePath) => {
  try {
    const buf = await fs.readFile(filePath);
    const { value: html } = await mammoth.convertToHtml({ buffer: buf });
    return { ok: true, html };
  } catch (err) {
    return { ok: false, error: err?.message || String(err) };
  }
});

ipcMain.handle('doc:docxToPdf', async (_evt, filePath) => {
  try {
    const buf = await fs.readFile(filePath);
    const { value: html } = await mammoth.convertToHtml({ buffer: buf });
    // Create an offscreen window to render HTML and print to PDF
    const win = new BrowserWindow({ show: false, webPreferences: { offscreen: true, sandbox: false } });
    await win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(`<!doctype html><html><head><meta charset="utf-8"><style>body{font-family:Arial,Helvetica,sans-serif;}</style></head><body>${html}</body></html>`));
    const pdfData = await win.webContents.printToPDF({
      landscape: false,
      pageSize: 'A4',
      marginsType: 1
    });
    const outPath = filePath.replace(/\.docx?$/i, '') + '.pdf';
    await fs.writeFile(outPath, pdfData);
    try { win.destroy(); } catch {}
    return { ok: true, filePath: outPath };
  } catch (err) {
    return { ok: false, error: err?.message || String(err) };
  }
});

ipcMain.handle('proc:launchExe', async (_evt, payload) => {
  try{
    const { exePath, args } = payload || {};
    if (!exePath) return { ok:false, error:'Ruta .exe no especificada' };
    const child = spawn(exePath, Array.isArray(args) ? args : [], {
      detached: true,
      stdio: 'ignore'
    });
    child.unref();
    return { ok:true, pid: child.pid };
  }catch(err){
    return { ok:false, error: err?.message || String(err) };
  }
});

  const indexUrl = isDev
    ? url.pathToFileURL(path.join(process.cwd(), 'renderer', 'index.html')).toString()
    : url.pathToFileURL(path.join(app.getAppPath(), 'renderer', 'index.html')).toString();

  await mainWindow.loadURL(indexUrl);

  if (isDev) {
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  }

  if (!isDev) {
    try {
      autoUpdater.autoDownload = true;
      autoUpdater.autoInstallOnAppQuit = true;
      autoUpdater.checkForUpdates().catch(()=>{});
    } catch {}
  }

  // Forward updater events to renderer
  const emit = (channel, payload) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send(channel, payload || {});
    }
  };
  autoUpdater.removeAllListeners();
  autoUpdater.on('checking-for-update', () => emit('updater:checking'));
  autoUpdater.on('update-available', (info) => emit('updater:available', info));
  autoUpdater.on('update-not-available', (info) => emit('updater:not_available', info));
  autoUpdater.on('error', (err) => emit('updater:error', { message: err?.message || String(err) }));
  autoUpdater.on('download-progress', (p) => emit('updater:progress', p));
  autoUpdater.on('update-downloaded', (info) => emit('updater:downloaded', info));
}

app.whenReady().then(() => {
  createWindow();
  // Init in-app scheduler persistence
  try { initScheduler(app.getPath('userData')); } catch {}

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// Updater IPC
ipcMain.handle('updater:check', async () => {
  try {
    const r = await autoUpdater.checkForUpdates();
    return { ok: true, r };
  } catch (err) {
    return { ok: false, error: err?.message || String(err) };
  }
});

ipcMain.handle('updater:quitAndInstall', async () => {
  try {
    autoUpdater.quitAndInstall();
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err?.message || String(err) };
  }
});

ipcMain.handle('dialog:chooseDirectory', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog({ properties: ['openDirectory', 'createDirectory'] });
  if (canceled || !filePaths?.length) return null;
  return filePaths[0];
});

ipcMain.handle('dialog:chooseFile', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog({
    properties: ['openFile'],
    filters: [
      { name: 'Audio', extensions: ['mp3', 'wav', 'flac', 'm4a', 'aac', 'ogg'] }
    ]
  });
  if (canceled || !filePaths?.length) return null;
  return filePaths[0];
});

ipcMain.handle('system:getDefaults', async () => {
  return {
    downloadsDir: path.join(os.homedir(), 'Downloads'),
    ffmpegAvailable: await checkFfmpegAvailable(),
  };
});

ipcMain.handle('youtube:download', async (_evt, payload) => {
  const { url: videoUrl, format, outputDir } = payload;
  if (!videoUrl || !/^https?:\/\//i.test(videoUrl)) {
    return { ok: false, error: 'URL inválida' };
  }
  try {
    const yt = await ensureYtDlp();
    const result = await downloadWithYtDlp({
      ytDlpPath: yt,
      url: videoUrl,
      format,
      outputDir,
      onProgress: (p) => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('youtube:progress', p);
        }
      },
      onLog: (entry) => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('youtube:log', entry);
        }
      }
    });
    return { ok: true, file: result.outputFile };
  } catch (err) {
    return { ok: false, error: err?.message || String(err) };
  }
});

ipcMain.handle('shell:showItemInFolder', async (_evt, filePath) => {
  try {
    if (!filePath) return { ok:false, error:'Ruta vacía' };
    let p = filePath;
    // Handle file:// URLs
    if (String(p).startsWith('file://')) {
      try { p = url.fileURLToPath(p); } catch {}
    }
    // Normalize separators for Windows
    p = path.normalize(p);
    try {
      await fs.access(p);
      shell.showItemInFolder(p);
      return { ok:true };
    } catch {
      // If file not found, try opening its directory
      const dir = path.dirname(p);
      try { await fs.access(dir); shell.openPath(dir); return { ok:true, openedDir: dir }; } catch {}
      return { ok:false, error:'Archivo no encontrado' };
    }
  } catch (err) {
    return { ok:false, error: err?.message || String(err) };
  }
});

ipcMain.handle('audio:analyze', async (_evt, filePath) => {
  if (!filePath) return { ok: false, error: 'Archivo no especificado' };
  try {
    const result = await analyzeAudio(filePath);
    return { ok: true, result };
  } catch (err) {
    return { ok: false, error: err?.message || String(err) };
  }
});

ipcMain.handle('audio:writeTags', async (_evt, payload) => {
  const { filePath, bpm, key } = payload || {};
  if (!filePath) return { ok: false, error: 'Archivo no especificado' };
  try {
    await writeTags(filePath, { bpm, key });
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err?.message || String(err) };
  }
});

// Save file helper for renderer (images, etc.)
ipcMain.handle('file:save', async (_evt, payload) => {
  try {
    const { defaultPath, dataBase64, filters, title } = payload || {};
    const { canceled, filePath } = await dialog.showSaveDialog({
      title: title || 'Guardar archivo',
      defaultPath: defaultPath || 'output.bin',
      filters: filters || [
        { name: 'Imágenes', extensions: ['png','jpg','jpeg','webp','avif'] },
        { name: 'Todos los archivos', extensions: ['*'] }
      ]
    });
    if (canceled || !filePath) return { ok: false, canceled: true };
    const buf = Buffer.from(dataBase64 || '', 'base64');
    await fs.writeFile(filePath, buf);
    return { ok: true, filePath };
  } catch (err) {
    return { ok: false, error: err?.message || String(err) };
  }
});

ipcMain.handle('library:scan', async (_evt, folder) => {
  if (!folder) return { ok: false, error: 'Carpeta no especificada' };
  try {
    const tracks = await scanLibrary(folder);
    return { ok: true, tracks };
  } catch (err) {
    return { ok: false, error: err?.message || String(err) };
  }
});

ipcMain.handle('library:recommend', async (_evt, payload) => {
  try {
    const { tracks, referenceFile, bpmTolerance } = payload || {};
    if (!Array.isArray(tracks) || !referenceFile) return { ok: false, error: 'Datos insuficientes' };
    const recs = recommendTracks(tracks, referenceFile, bpmTolerance ?? 3);
    return { ok: true, recommendations: recs };
  } catch (err) {
    return { ok: false, error: err?.message || String(err) };
  }
});
