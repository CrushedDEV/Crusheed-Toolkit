import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('ctk', {
  chooseDirectory: () => ipcRenderer.invoke('dialog:chooseDirectory'),
  getDefaults: () => ipcRenderer.invoke('system:getDefaults'),
  youtube: {
    download: (payload) => ipcRenderer.invoke('youtube:download', payload),
    onProgress: (cb) => {
      const listener = (_e, data) => cb(data);
      ipcRenderer.on('youtube:progress', listener);
      return () => ipcRenderer.removeListener('youtube:progress', listener);
    }
  },
  shell: {
    showItemInFolder: (filePath) => ipcRenderer.invoke('shell:showItemInFolder', filePath)
  }
});
