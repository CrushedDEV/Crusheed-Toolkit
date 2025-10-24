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
      }
    });
    return { ok: true, file: result.outputFile };
  } catch (err) {
    return { ok: false, error: err?.message || String(err) };
  }
});

ipcMain.handle('shell:showItemInFolder', async (_evt, filePath) => {
  if (filePath) shell.showItemInFolder(filePath);
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
