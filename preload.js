const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  loadData: () => ipcRenderer.invoke('load-data'),
  saveRecord: (record) => ipcRenderer.invoke('save-record', record),
  getToday: () => ipcRenderer.invoke('get-today'),
  loadFaces: () => ipcRenderer.invoke('load-faces'),
  saveFace: (user) => ipcRenderer.invoke('save-face', user),
  getModelsPath: () => ipcRenderer.invoke('get-models-path'),
  checkDbConnection: () => ipcRenderer.invoke('check-db-connection')
});
