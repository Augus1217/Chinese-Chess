const http = require('http');
const path = require('path');
const express = require('express');
const WebSocket = require('ws');
const { spawn } = require('child_process');
const fs = require('fs');
const EventEmitter = require('events');
const portfinder = require('portfinder');

const readyEmitter = new EventEmitter();
let configReady = false;

let isPackagedApp = false; // Default to false, will be set by main.js

const serverApp = express();

// Serve the static files from the public directory
const publicPath = path.join(__dirname, '../public');
serverApp.use(express.static(publicPath));

const server = http.createServer(serverApp);
const wss = new WebSocket.Server({ server });

// --- Reliable Path Resolution ---
let engineName; // Will be set by start()
let enginePath;
let nnuePath;

// Function to initialize paths based on isPackaged status
function initializePaths() {
    const nnueFileName = 'pikafish.nnue';
    let platformSubDir = '';
    if (process.platform === 'linux') {
        platformSubDir = 'Linux';
    } else if (process.platform === 'darwin') {
        platformSubDir = 'MacOS';
    }

    if (isPackagedApp) {
        // In packaged app, resources are in the `resources` directory
        const resourcesDir = path.join(process.resourcesPath, 'engine');
        enginePath = path.join(resourcesDir, platformSubDir, engineName);
        nnuePath = path.join(resourcesDir, nnueFileName);
    } else {
        // In dev, resources are at the project root (one level up from api folder)
        const devEngineDir = path.join(__dirname, '..', 'engine 20250627');
        enginePath = path.join(devEngineDir, platformSubDir, engineName);
        nnuePath = path.join(devEngineDir, nnueFileName);
    }

    // On Linux and macOS, the engine file needs execute permissions.
    // Don't do this inside a read-only snap package or AppImage.
    const isAppImage = process.env.APPIMAGE !== undefined;
    if ((process.platform === 'linux' || process.platform === 'darwin') && !process.env.SNAP && !isAppImage) {
        if (fs.existsSync(enginePath)) {
            try {
                fs.chmodSync(enginePath, 0o755);
                console.log(`[Permissions] Set execute permission for ${enginePath}`);
            } catch (err) {
                console.error(`[Permissions] Failed to set execute permission for ${enginePath}:`, err);
            }
        }
    }
}
// --- End of Path Resolution ---

wss.on('connection', (ws) => {
    console.log('[WebSocket] Client connected.');
    let engineProcess = null; // Keep engineProcess scoped to the connection

    const setupAndStartEngine = () => {
        const startEngine = () => {
            console.log('--- [Engine Start] ---');
            console.log(`Engine path: ${enginePath}`);
            if (!fs.existsSync(enginePath)) {
                const errorMsg = `FATAL: Engine executable not found at ${enginePath}`;
                console.error(errorMsg);
                ws.send(JSON.stringify({ type: 'error', data: errorMsg }));
                return;
            }

            try {
                const engineCwd = path.dirname(enginePath);
                engineProcess = spawn(enginePath, [], { cwd: engineCwd });

                let buffer = '';
                engineProcess.stdout.on('data', (data) => {
                    buffer += data.toString();
                    let lines = buffer.split(/\r?\n/);
                    buffer = lines.pop() || '';

                    lines.forEach(line => {
                        const output = line.trim();
                        if (output) {
                            console.log(`[Engine STDOUT] ${output}`);
                            if (output.startsWith('bestmove')) {
                                const uciMove = output.split(' ')[1];
                                if (uciMove && uciMove !== '(none)') {
                                    ws.send(JSON.stringify({ type: 'engineMove', move: uciMove }));
                                }
                            }
                        }
                    });
                });

                engineProcess.stderr.on('data', (data) => {
                    console.error(`[Engine STDERR] ${data}`);
                });

                engineProcess.on('close', (code) => {
                    console.log(`[Engine] Process exited with code ${code}`);
                    engineProcess = null;
                });

                engineProcess.on('error', (err) => {
                    console.error('[Engine] Spawn Error Event:', err);
                    ws.send(JSON.stringify({ type: 'error', data: `Engine spawn error: ${err.message}` }));
                });

                // Add error handler for stdin to catch EPIPE errors
                engineProcess.stdin.on('error', (err) => {
                    console.error('[Engine] Stdin Error:', err);
                });

                // Check if stdin is writable before writing
                if (engineProcess.stdin && engineProcess.stdin.writable) {
                    engineProcess.stdin.write('uci\n');
                    const evalFileValue = process.platform === 'win32' ? path.basename(nnuePath) : nnuePath;
                    engineProcess.stdin.write(`setoption name EvalFile value ${evalFileValue}\n`);
                    engineProcess.stdin.write('setoption name UCI_LimitStrength value true\n');
                    engineProcess.stdin.write('isready\n');
                } else {
                    console.error('[Engine] Stdin is not writable');
                }

            } catch (e) {
                console.error("[Engine] FATAL: Failed to spawn process.", e);
                ws.send(JSON.stringify({ type: 'error', data: 'Failed to start engine.' }));
            }
        };

        // Helper function to safely write to engine stdin
        const safeWriteToEngine = (command) => {
            if (engineProcess && engineProcess.stdin && engineProcess.stdin.writable) {
                try {
                    engineProcess.stdin.write(command);
                    return true;
                } catch (err) {
                    console.error('[Engine] Write error:', err);
                    return false;
                }
            }
            console.error('[Engine] Cannot write: stdin not available');
            return false;
        };

        startEngine();

        ws.on('message', (message) => {
            try {
                const msg = JSON.parse(message);
                if (msg.type === 'getmove' && engineProcess) {
                    // Handle custom ELO
                    if (msg.difficulty === 'custom' && msg.customElo) {
                        const customElo = parseInt(msg.customElo, 10);
                        if (customElo >= 1280 && customElo <= 3133) {
                            safeWriteToEngine(`setoption name UCI_Elo value ${customElo}\n`);
                        }
                    } else {
                        const eloMap = {
                            'easy': 1280,
                            'medium': 1400,
                            'hard': 1600,
                            'expert': 1800
                        };
                        const elo = eloMap[msg.difficulty];
                        if (elo) {
                            safeWriteToEngine(`setoption name UCI_Elo value ${elo}\n`);
                        }
                    }

                    safeWriteToEngine(`position fen ${msg.fen}\n`);
                    safeWriteToEngine(`go movetime ${msg.movetime || 3000}\n`);
                }
            } catch (e) {
                console.error('[WebSocket] Error parsing message:', e);
            }
        });
    };

    if (configReady) {
        setupAndStartEngine();
    } else {
        console.log('[Engine] Configuration not ready, waiting for signal...');
        readyEmitter.once('ready', () => {
            console.log('[Engine] Ready signal received, starting engine setup.');
            setupAndStartEngine();
        });
    }

    ws.on('close', () => {
        console.log('[WebSocket] Client disconnected.');
        if (engineProcess) {
            engineProcess.kill();
        }
    });
});

// Export a function to start the server and pass isPackaged status
module.exports = {
    start: (isPackagedStatus, bestEngineName) => {
        return new Promise((resolve, reject) => {
            console.log('[Engine] Configuration received.');
            isPackagedApp = isPackagedStatus;
            engineName = bestEngineName;
            initializePaths();
            configReady = true;
            readyEmitter.emit('ready');

            portfinder.getPortPromise({
                port: 3000,    // start searching from port 3000
                stopPort: 4000 // stop searching at port 4000
            }).then((port) => {
                server.listen(port, () => {
                    console.log(`[WebSocket] Server started on port ${port}`);
                    resolve(port); // Resolve the promise with the port number
                });

                server.on('error', (err) => {
                    console.error('[WebSocket] Server error:', err);
                    reject(err); // Reject the promise on error
                });

            }).catch((err) => {
                console.error('[PortFinder] Error finding port:', err);
                reject(err); // Reject the promise if port finding fails
            });
        });
    }
};