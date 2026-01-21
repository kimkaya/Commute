const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  loadData: () => ipcRenderer.invoke('load-data'),
  saveRecord: (record) => ipcRenderer.invoke('save-record', record),
  getToday: () => ipcRenderer.invoke('get-today'),
  loadFaces: () => ipcRenderer.invoke('load-faces'),
  saveFace: (user) => ipcRenderer.invoke('save-face', user),
  getModelsPath: () => ipcRenderer.invoke('get-models-path'),
  checkDbConnection: () => ipcRenderer.invoke('check-db-connection'),
  // 기기 인증 관련
  getDeviceId: () => ipcRenderer.invoke('get-device-id'),
  checkDeviceAuth: (userName) => ipcRenderer.invoke('check-device-auth', userName),
  verifyAndRegisterDevice: (userName, password) => ipcRenderer.invoke('verify-and-register-device', userName, password),
  
  // 새로운 예외 처리 API들
  verifyPasswordOnly: (userName, password) => ipcRenderer.invoke('verify-password-only', userName, password),
  saveEmergencyRecord: (record, reason) => ipcRenderer.invoke('save-emergency-record', record, reason),
  syncOfflineRecords: (records) => ipcRenderer.invoke('sync-offline-records', records),
  getRegisteredUsers: () => ipcRenderer.invoke('get-registered-users'),
  checkNetworkStatus: () => ipcRenderer.invoke('check-network-status')
});
