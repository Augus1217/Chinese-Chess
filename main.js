const { app, BrowserWindow, Menu, ipcMain, screen } = require('electron');
app.disableHardwareAcceleration();
const path = require('path');
const { exec } = require('child_process');
const fs = require('fs');

const enginePriority = ['vnni512', 'bw512', 'avx512', 'avxvnni', 'bmi2', 'avx2', 'sse41-popcnt', 'ssse3'];

// 1. DEFINE getBestEngine FIRST
function getBestEngine(callback) {
    const platform = process.platform;
    const isWin = platform === 'win32';
    const isLinux = platform === 'linux';

    let executableName = '';
    let extension = '';

    if (isWin) {
        executableName = 'cpu_features';
        extension = '.exe';
    } else if (isLinux) {
        executableName = 'cpu_features_linux';
        extension = '';
    } else {
        // For MacOS or other platforms, use a default engine
        console.log(`[Engine] Unsupported platform: ${platform}. Using default engine.`);
        return callback('pikafish-sse41-popcnt'); // Assuming a generic engine for other platforms
    }

    const defaultEngine = `pikafish-sse41-popcnt${extension}`;
    let cpuFeaturesFullPath = path.join(__dirname, 'api', `${executableName}${extension}`);

    // --- SNAPCRAFT WORKAROUND ---
    // If running in a snap, extract the executable from asar to a writable location
    if (process.env.SNAP) {
        const targetDir = process.env.SNAP_USER_DATA;
        const targetPath = path.join(targetDir, `${executableName}${extension}`);

        try {
            // Read from asar archive
            const binaryData = fs.readFileSync(cpuFeaturesFullPath);
            // Write to writable location
            fs.writeFileSync(targetPath, binaryData);
            // Make it executable
            fs.chmodSync(targetPath, 0o755);
            console.log(`[Snap Workaround] Extracted ${executableName} to ${targetPath}`);
            // Update the path to the new executable
            cpuFeaturesFullPath = targetPath;
        } catch (e) {
            console.error(`[Snap Workaround] Failed to extract executable: ${e}`);
            // Fallback to default engine if extraction fails
            return callback(defaultEngine);
        }
    }
    // --- END SNAPCRAFT WORKAROUND ---

    exec(`"${cpuFeaturesFullPath}"`, (error, stdout, stderr) => {
        if (error) {
            console.error(`Error executing ${executableName}${extension}: ${error}`);
            return callback(defaultEngine);
        }

        try {
            const features = JSON.parse(stdout);
            for (const engine of enginePriority) {
                if (features[engine]) {
                    const engineName = `pikafish-${engine}${extension}`;
                    console.log(`[Engine] Found supported engine: ${engineName}`);
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
  const primaryDisplay = screen.getPrimaryDisplay();
  const { width, height } = primaryDisplay.workAreaSize;

  mainWindow = new BrowserWindow({
    width: width,
    height: height,
    x: 0,
    y: 0,
    show: false, 
    title: "中華象棋",
    webPreferences: {
      preload: path.join(__dirname, 'preload.js')
    }
  });
  mainWindow.maximize();
  mainWindow.loadFile('public/index.html');

  mainWindow.once('ready-to-show', () => {
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
