const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('dashboard', {
  onUpdate: (cb) => ipcRenderer.on('update', (_e, data) => cb(data)),
});
