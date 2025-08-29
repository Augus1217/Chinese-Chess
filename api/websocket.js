const http = require('http');
const path = require('path');
const express = require('express');
const WebSocket = require('ws');
const { spawn } = require('child_process');
const fs = require('fs');
const EventEmitter = require('events');

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
    // Don't do this inside a read-only snap package.
    if ((process.platform === 'linux' || process.platform === 'darwin') && !process.env.SNAP) {
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

                engineProcess.stdin.write('uci\n');
                const evalFileValue = process.platform === 'win32' ? path.basename(nnuePath) : nnuePath;
                engineProcess.stdin.write(`setoption name EvalFile value ${evalFileValue}\n`);
                engineProcess.stdin.write('setoption name UCI_LimitStrength value true\n');
                engineProcess.stdin.write('isready\n');

            } catch (e) {
                console.error("[Engine] FATAL: Failed to spawn process.", e);
                ws.send(JSON.stringify({ type: 'error', data: 'Failed to start engine.' }));
            }
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
                            engineProcess.stdin.write(`setoption name UCI_Elo value ${customElo}\n`);
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
                            engineProcess.stdin.write(`setoption name UCI_Elo value ${elo}\n`);
                        }
                    }

                    engineProcess.stdin.write(`position fen ${msg.fen}\n`);
                    engineProcess.stdin.write(`go movetime ${msg.movetime || 3000}\n`);
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

const PORT = 3000;
server.listen(PORT, () => {
    console.log(`[Server] WebSocket server listening on port ${PORT}`);
});

// Export a function to start the server and pass isPackaged status
module.exports.start = (isPackagedStatus, bestEngineName) => {
    console.log('[Engine] Configuration received.');
    isPackagedApp = isPackagedStatus;
    engineName = bestEngineName;
    initializePaths();
    configReady = true;
    readyEmitter.emit('ready');
};