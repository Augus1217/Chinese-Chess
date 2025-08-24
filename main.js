const { app, BrowserWindow, Menu, ipcMain } = require('electron');
const path = require('path');
const { exec } = require('child_process');

const enginePriority = ['vnni512', 'bw512', 'avx512', 'avxvnni', 'bmi2', 'avx2', 'sse41-popcnt', 'ssse3'];

// 1. DEFINE getBestEngine FIRST
function getBestEngine(callback) {
    const isWin = process.platform === 'win32';
    const extension = isWin ? '.exe' : '';
    const defaultEngine = `pikafish-sse41-popcnt${extension}`;

    // If not on Windows, skip CPU detection since we only have the .exe
    if (!isWin) {
        console.log('[Engine] Skipping CPU feature detection on non-Windows platform.');
        return callback(defaultEngine);
    }

    // Windows-only logic from here
    const apiDir = path.join(__dirname, 'api');
    const cpuFeaturesFullPath = path.join(apiDir, `cpu_features${extension}`);

    exec(`"${cpuFeaturesFullPath}"`, (error, stdout, stderr) => {
        if (error) {
            console.error(`Error executing cpu_features.exe: ${error}`);
            return callback(defaultEngine);
        }

        try {
            const features = JSON.parse(stdout);
            for (const engine of enginePriority) {
                if (features[engine]) {
                    const engineName = `pikafish-${engine}${extension}`;
                    return callback(engineName);
                }
            }
            callback(defaultEngine);
        } catch (e) {
            console.error(`Error parsing CPU features: ${e}`);
            callback(defaultEngine);
        }
    });
}

// 2. THEN, START THE SERVER
const webSocketApi = require('./api/websocket.js');

// 3. FINALLY, CALL getBestEngine
getBestEngine((engineName) => {
    console.log(`[Engine] Selected engine: ${engineName}`); // Added for debugging
    webSocketApi.start(app.isPackaged, engineName);
});

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
        },
        {
            label: translations.settings,
            click: () => {
                mainWindow.webContents.send('open-settings');
            }
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
