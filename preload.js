const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    getInitialLanguage: () => ipcRenderer.invoke('get-initial-language'),
    onSwitchLanguage: (callback) => ipcRenderer.on('switch-language', callback),
    updateMenu: (menuTranslations) => ipcRenderer.send('update-menu', menuTranslations),
    onOpenSettings: (callback) => ipcRenderer.on('open-settings', callback)
});
