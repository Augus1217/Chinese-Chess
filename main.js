const { app, BrowserWindow, Menu, ipcMain, screen, shell } = require('electron');
app.disableHardwareAcceleration();
const path = require('path');
const { exec } = require('child_process');
const fs = require('fs');

const enginePriority = ['vnni512', 'bw512', 'avx512', 'avxvnni', 'bmi2', 'avx2', 'sse41-popcnt', 'ssse3'];

// 1. DEFINE getBestEngine FIRST
function getBestEngine() {
    return new Promise((resolve) => {
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
            console.log(`[Engine] Unsupported platform: ${platform}. Using default engine.`);
            return resolve('pikafish-sse41-popcnt');
        }

        const defaultEngine = `pikafish-sse41-popcnt${extension}`;
        let cpuFeaturesFullPath = path.join(__dirname, 'api', `${executableName}${extension}`);

        if (process.env.SNAP) {
            const targetDir = process.env.SNAP_USER_DATA;
            const targetPath = path.join(targetDir, `${executableName}${extension}`);
            try {
                const binaryData = fs.readFileSync(cpuFeaturesFullPath);
                fs.writeFileSync(targetPath, binaryData);
                fs.chmodSync(targetPath, 0o755);
                console.log(`[Snap Workaround] Extracted ${executableName} to ${targetPath}`);
                cpuFeaturesFullPath = targetPath;
            } catch (e) {
                console.error(`[Snap Workaround] Failed to extract executable: ${e}`);
                return resolve(defaultEngine);
            }
        }

        exec(`"${cpuFeaturesFullPath}"`, (error, stdout, stderr) => {
            if (error) {
                console.error(`Error executing ${executableName}${extension}: ${error}`);
                return resolve(defaultEngine);
            }
            try {
                const features = JSON.parse(stdout);
                for (const engine of enginePriority) {
                    if (features[engine]) {
                        const engineName = `pikafish-${engine}${extension}`;
                        console.log(`[Engine] Found supported engine: ${engineName}`);
                        return resolve(engineName);
                    }
                }
                resolve(defaultEngine);
            } catch (e) {
                console.error(`Error parsing CPU features: ${e}`);
                resolve(defaultEngine);
            }
        });
    });
}

// 2. THEN, START THE SERVER
const webSocketApi = require('./api/websocket.js');

let serverPort; // Variable to store the chosen port

// 3. FINALLY, CALL getBestEngine
getBestEngine()
    .then(engineName => {
        console.log(`[Engine] Selected engine: ${engineName}`);
        return webSocketApi.start(app.isPackaged, engineName);
    })
    .then(port => {
        console.log(`[Main] WebSocket server started on port ${port}`);
        serverPort = port;
    })
    .catch(err => {
        console.error('[Main] Failed to start WebSocket server or get engine:', err);
        // Handle server start failure (e.g., show an error dialog to the user)
    });

// Handle request from renderer process for the port
ipcMain.handle('get-ws-port', async (event) => {
    return serverPort;
});

let mainWindow;
let currentLanguage = app.getLocale();
if (currentLanguage.startsWith('zh-CN')) {
    currentLanguage = 'zh-CN';
} else if (currentLanguage.startsWith('zh')) {
    currentLanguage = 'zh';
} else if (currentLanguage.startsWith('vi')) {
    currentLanguage = 'vi';
}
else {
    currentLanguage = 'en';
}

ipcMain.on('language-changed', (event, lang) => {
    currentLanguage = lang;
});

const titles = {
    'en': 'Chinese Chess',
    'zh': '中華象棋',
    'zh-CN': '中华象棋',
    'vi': 'Cờ Tướng'
};

function createChangelogWindow(changelogContent) {
    const changelogWindow = new BrowserWindow({
        width: 500,
        height: 400,
        title: '更新日誌',
        parent: mainWindow,
        modal: true,
        autoHideMenuBar: true, // This will hide the menu bar
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false
        }
    });

    changelogWindow.loadFile('public/changelog.html');
    changelogWindow.setMenu(null);

    changelogWindow.webContents.on('did-finish-load', () => {
        changelogWindow.webContents.send('changelog-data', changelogContent);
    });
}

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
                },
                {
                    label: translations['zh-CN'],
                    click: () => {
                        mainWindow.webContents.send('switch-language', 'zh-CN');
                    }
                }
            ]
        },
        {
            label: translations.settings,
            click: () => {
                mainWindow.webContents.send('open-settings');
            }
        },
        {
            label: translations.help,
            submenu: [
                {
                    label: translations.tutorial,
                    click: () => {
                        shell.openExternal(`https://augus1217.github.io/chinese-chess-tutorial.github.io/?lang=${currentLanguage}`);
                    }
                },
                {
                    label: translations.changelog,
                    click: () => {
                        // This will be handled by the new showChangelog function scope
                        if (global.showChangelog) {
                            global.showChangelog(true); // Force show when clicked from menu
                        }
                    }
                }
            ]
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
    title: titles[currentLanguage] || 'Chinese Chess',
    icon: path.join(__dirname, 'build', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js')
    }
  });
  mainWindow.maximize();
  mainWindow.loadFile('public/index.html');
}

app.on('ready', async () => {
    // Dynamically import electron-store
    const Store = (await import('electron-store')).default;
    const store = new Store();

    // Define showChangelog here so it has access to the 'store'
    global.showChangelog = function(forceShow = false) {
        const changelogPath = path.join(__dirname, 'public', 'changelog.json');
        if (fs.existsSync(changelogPath)) {
            const changelogData = JSON.parse(fs.readFileSync(changelogPath, 'utf-8'));
            const currentVersion = app.getVersion();
            const lastSeenVersion = store.get('lastSeenVersion');

            if (forceShow || !lastSeenVersion || lastSeenVersion !== currentVersion) {
                const latestChangelogData = changelogData.versions.find(v => v.version === currentVersion);
                if (latestChangelogData) {
                    const changelogForLang = latestChangelogData.changelog[currentLanguage] || latestChangelogData.changelog['en'];
                    createChangelogWindow(changelogForLang);
                    if (!forceShow) {
                        store.set('lastSeenVersion', currentVersion);
                    }
                }
            }
        }
    };

    createWindow();
    global.showChangelog(); // Automatically check and show on startup
});

app.on('window-all-closed', () => {
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
