const { contextBridge, ipcRenderer, desktopCapturer } = require('electron');

// In newer Electron versions, desktopCapturer must be imported from 'electron/renderer' in renderer/preload contexts.
// Fall back to that if not present on the main 'electron' export.
const { desktopCapturer: rendererDesktopCapturer } = (() => {
  try { return require('electron/renderer'); } catch { return {}; }
})();
const _desktopCapturer = desktopCapturer || rendererDesktopCapturer;

contextBridge.exposeInMainWorld('ctk', {
  chooseDirectory: () => ipcRenderer.invoke('dialog:chooseDirectory'),
  chooseFile: () => ipcRenderer.invoke('dialog:chooseFile'),
  getDefaults: () => ipcRenderer.invoke('system:getDefaults'),
  updater: {
    check: () => ipcRenderer.invoke('updater:check'),
    quitAndInstall: () => ipcRenderer.invoke('updater:quitAndInstall'),
    on: (channel, cb) => {
      const valid = new Set([
        'updater:checking',
        'updater:available',
        'updater:not_available',
        'updater:error',
        'updater:progress',
        'updater:downloaded'
      ]);
      if (!valid.has(channel)) return () => {};
      const listener = (_e, data) => { try { cb && cb(data); } catch {} };
      ipcRenderer.on(channel, listener);
      return () => ipcRenderer.removeListener(channel, listener);
    }
  },
  youtube: {
    download: (payload) => ipcRenderer.invoke('youtube:download', payload),
    onProgress: (cb) => {
      const listener = (_e, data) => cb(data);
      ipcRenderer.on('youtube:progress', listener);
      return () => ipcRenderer.removeListener('youtube:progress', listener);
    }
  },
  desktop: {
    getSources: async (options) => {
      if (!_desktopCapturer) {
        throw new Error('desktopCapturer no disponible en este contexto');
      }
      const sources = await _desktopCapturer.getSources(options || { types: ['window', 'screen'], thumbnailSize: { width: 320, height: 180 } });
      // Return only safe fields
      return sources.map(s => ({
        id: s.id,
        name: s.name,
        appIconDataUrl: s.appIcon ? s.appIcon.toDataURL() : null,
        thumbnailDataUrl: s.thumbnail ? s.thumbnail.toDataURL() : null
      }));
    }
  },
  proc: {
    launchExe: (exePath, args) => ipcRenderer.invoke('proc:launchExe', { exePath, args })
  },
  audio: {
    analyze: (filePath) => ipcRenderer.invoke('audio:analyze', filePath),
    writeTags: (payload) => ipcRenderer.invoke('audio:writeTags', payload)
  },
  library: {
    scan: (folder) => ipcRenderer.invoke('library:scan', folder),
    recommend: (payload) => ipcRenderer.invoke('library:recommend', payload)
  },
  file: {
    save: (payload) => ipcRenderer.invoke('file:save', payload)
  },
  shell: {
    showItemInFolder: (filePath) => ipcRenderer.invoke('shell:showItemInFolder', filePath)
  }
});
