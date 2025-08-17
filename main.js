const { app, BrowserWindow, Menu, ipcMain } = require('electron');
const path = require('path');

require('./api/websocket.js').start(app.isPackaged);

let mainWindow;

function createMenu(translations) {
    const menuTemplate = [
        {
            label: translations.view,
            submenu: [
                { label: translations.reload, role: 'reload' },
                { label: translations.forceReload, role: 'forceReload' },
                { label: translations.toggleDevTools, role: 'toggleDevTools' },
                { type: 'separator' },
                { label: translations.resetZoom, role: 'resetZoom' },
                { label: translations.zoomIn, role: 'zoomIn' },
                { label: translations.zoomOut, role: 'zoomOut' },
                { type: 'separator' },
                { label: translations.togglefullscreen, role: 'togglefullscreen' }
            ]
        },
        {
            label: translations.language,
            submenu: [
                {
                    label: translations.zh,
                    click: () => {
                        mainWindow.webContents.send('switch-language', 'zh');
                    }
                },
                {
                    label: translations.en,
                    click: () => {
                        mainWindow.webContents.send('switch-language', 'en');
                    }
                },
                {
                    label: translations.vi,
                    click: () => {
                        mainWindow.webContents.send('switch-language', 'vi');
                    }
                }
            ]
        }
    ];

    const menu = Menu.buildFromTemplate(menuTemplate);
    Menu.setApplicationMenu(menu);
}

function createWindow () {
  mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
    show: false, 
    title: "中華象棋",
    webPreferences: {
      preload: path.join(__dirname, 'preload.js')
    }
  });

  mainWindow.loadFile('public/index.html');

  mainWindow.once('ready-to-show', () => {
    mainWindow.maximize();
    mainWindow.show();
  });
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') app.quit();
});

ipcMain.handle('get-initial-language', () => {
    const locale = app.getLocale();
    if (locale.startsWith('zh')) return 'zh';
    if (locale.startsWith('vi')) return 'vi';
    return 'en';
});

ipcMain.on('update-menu', (event, menuTranslations) => {
    createMenu(menuTranslations);
});
