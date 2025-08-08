const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    onSwitchLanguage: (callback) => ipcRenderer.on('switch-language', callback),
    updateMenu: (menuTranslations) => ipcRenderer.send('update-menu', menuTranslations)
});