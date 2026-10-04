const { contextBridge, ipcRenderer, webUtils } = require('electron');

contextBridge.exposeInMainWorld('api', {
  importMedia: () => ipcRenderer.invoke('media:import'),
  loadMedia: (paths) => ipcRenderer.invoke('media:load', paths),
  listEffects: () => ipcRenderer.invoke('effects:list'),
  pathForFile: (file) => webUtils.getPathForFile(file),
  exportVideo: (project) => ipcRenderer.invoke('export:start', project),
  cancelExport: () => ipcRenderer.invoke('export:cancel'),
  onExportProgress: (cb) => ipcRenderer.on('export:progress', (_e, p) => cb(p)),
  revealFile: (p) => ipcRenderer.invoke('shell:reveal', p),
});
