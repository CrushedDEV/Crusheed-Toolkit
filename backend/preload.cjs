const { contextBridge, ipcRenderer, webUtils } = require('electron');

function subscribe(channel, cb) {
  const listener = (_e, data) => { try { cb && cb(data); } catch {} };
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
}

const UPDATER_CHANNELS = new Set([
  'updater:checking',
  'updater:available',
  'updater:not_available',
  'updater:error',
  'updater:progress',
  'updater:downloaded'
]);

contextBridge.exposeInMainWorld('ctk', {
  chooseDirectory: () => ipcRenderer.invoke('dialog:chooseDirectory'),
  chooseFile: (filters) => ipcRenderer.invoke('dialog:chooseFile', filters),
  chooseFiles: (filters) => ipcRenderer.invoke('dialog:chooseFiles', filters),
  media: {
    info: (file) => ipcRenderer.invoke('media:info', file),
    compressVideo: (payload) => ipcRenderer.invoke('media:compressVideo', payload),
    makeGif: (payload) => ipcRenderer.invoke('media:makeGif', payload),
    batchAudio: (payload) => ipcRenderer.invoke('media:batchAudio', payload),
  },
  getDefaults: () => ipcRenderer.invoke('system:getDefaults'),
  // File.path was removed in Electron 32; this is its replacement for dropped/selected files
  getPathForFile: (file) => { try { return webUtils.getPathForFile(file) || null; } catch { return null; } },
  doc: {
    docxToHtml: (filePath) => ipcRenderer.invoke('doc:docxToHtml', filePath),
    docxToPdf: (filePath) => ipcRenderer.invoke('doc:docxToPdf', filePath),
  },
  updater: {
    check: () => ipcRenderer.invoke('updater:check'),
    quitAndInstall: () => ipcRenderer.invoke('updater:quitAndInstall'),
    on: (channel, cb) => UPDATER_CHANNELS.has(channel) ? subscribe(channel, cb) : () => {}
  },
  youtube: {
    download: (payload) => ipcRenderer.invoke('youtube:download', payload),
    onProgress: (cb) => subscribe('youtube:progress', cb),
    onLog: (cb) => subscribe('youtube:log', cb),
    onToolStatus: (cb) => subscribe('youtube:toolStatus', cb),
    updateTool: () => ipcRenderer.invoke('youtube:updateTool')
  },
  organizer: {
    scan: (folder) => ipcRenderer.invoke('organizer:scan', folder),
    rename: (items) => ipcRenderer.invoke('organizer:rename', items),
    writeTags: (payload) => ipcRenderer.invoke('organizer:writeTags', payload),
    setCover: (payload) => ipcRenderer.invoke('organizer:setCover', payload),
    analyze: (payload) => ipcRenderer.invoke('organizer:analyze', payload),
  },
  mc: {
    versions: (type) => ipcRenderer.invoke('mc:versions', type),
    downloadJar: (payload) => ipcRenderer.invoke('mc:downloadJar', payload),
    inspect: (folder) => ipcRenderer.invoke('mc:inspect', folder),
    readProps: (folder) => ipcRenderer.invoke('mc:readProps', folder),
    writeProps: (payload) => ipcRenderer.invoke('mc:writeProps', payload),
    acceptEula: (folder) => ipcRenderer.invoke('mc:acceptEula', folder),
    writeStartBat: (payload) => ipcRenderer.invoke('mc:writeStartBat', payload),
    backup: (payload) => ipcRenderer.invoke('mc:backup', payload),
    scheduleBackup: (payload) => ipcRenderer.invoke('mc:scheduleBackup', payload),
    readOptions: (file) => ipcRenderer.invoke('mc:readOptions', file),
    writeOptions: (payload) => ipcRenderer.invoke('mc:writeOptions', payload),
  },
  sys: {
    ports: () => ipcRenderer.invoke('sys:ports'),
    kill: (pid) => ipcRenderer.invoke('sys:kill', pid),
    diskScan: (payload) => ipcRenderer.invoke('disk:scan', payload),
  },
  jobs: {
    cancel: (jobId) => ipcRenderer.invoke('job:cancel', jobId),
    onProgress: (cb) => subscribe('job:progress', cb)
  },
  audio: {
    analyze: (filePath) => ipcRenderer.invoke('audio:analyze', filePath),
    writeTags: (payload) => ipcRenderer.invoke('audio:writeTags', payload)
  },
  library: {
    scan: (folder) => ipcRenderer.invoke('library:scan', folder),
    recommend: (payload) => ipcRenderer.invoke('library:recommend', payload)
  },
  scheduler: {
    list: () => ipcRenderer.invoke('scheduler:list'),
    create: (def) => ipcRenderer.invoke('scheduler:create', def),
    remove: (id) => ipcRenderer.invoke('scheduler:remove', id),
    toggle: (id, enabled) => ipcRenderer.invoke('scheduler:toggle', { id, enabled }),
    runNow: (id) => ipcRenderer.invoke('scheduler:runNow', id),
    logs: (id) => ipcRenderer.invoke('scheduler:logs', id),
  },
  winsched: {
    list: () => ipcRenderer.invoke('winsched:list'),
    create: (payload) => ipcRenderer.invoke('winsched:create', payload),
    delete: (name) => ipcRenderer.invoke('winsched:delete', name),
  },
  file: {
    save: (payload) => ipcRenderer.invoke('file:save', payload),
    saveZip: (payload) => ipcRenderer.invoke('file:saveZip', payload),
    readText: (p) => ipcRenderer.invoke('file:readText', p),
    writeText: (payload) => ipcRenderer.invoke('file:writeText', payload),
    writeMany: (payload) => ipcRenderer.invoke('file:writeMany', payload)
  },
  shell: {
    showItemInFolder: (filePath) => ipcRenderer.invoke('shell:showItemInFolder', filePath),
    openPath: (p) => ipcRenderer.invoke('shell:openPath', p),
    trash: (paths) => ipcRenderer.invoke('shell:trash', paths)
  }
});
