const http = require('http');
const path = require('path');
const express = require('express');
const WebSocket = require('ws');
const { spawn } = require('child_process');
const fs = require('fs');

let isPackagedApp = false; // Default to false, will be set by main.js

const serverApp = express();

// Serve the static files from the public directory
const publicPath = path.join(__dirname, '../public');
serverApp.use(express.static(publicPath));

const server = http.createServer(serverApp);
const wss = new WebSocket.Server({ server });

// --- Reliable Path Resolution ---
const engineName = process.platform === 'win32' ? 'pikafish-sse41-popcnt.exe' : 'pikafish-sse41-popcnt';
const nnueName = 'pikafish.nnue';

let enginePath;
let nnuePath;

// Function to initialize paths based on isPackaged status
function initializePaths() {
    if (isPackagedApp) {
        // In packaged app, resources are in the `resources` directory
        enginePath = path.join(process.resourcesPath, 'engine', engineName);
        nnuePath = path.join(process.resourcesPath, 'engine', nnueName);
    } else {
        // In dev, resources are at the project root (one level up from api folder)
        enginePath = path.join(__dirname, '..', 'engine', engineName);
        nnuePath = path.join(__dirname, '..', 'engine', nnueName);
    }
}
// --- End of Path Resolution ---

wss.on('connection', (ws) => {
    console.log('[WebSocket] Client connected.');
    let engineProcess = null;

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
            engineProcess.stdin.write(`setoption name EvalFile value ${nnueName}\n`);
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
                engineProcess.stdin.write(`position fen ${msg.fen}\n`);
                engineProcess.stdin.write(`go movetime ${msg.movetime || 2000}\n`);
            }
        } catch (e) {
            console.error('[WebSocket] Error parsing message:', e);
        }
    });

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
module.exports.start = (isPackagedStatus) => {
    isPackagedApp = isPackagedStatus;
    initializePaths(); // Initialize paths once isPackagedApp is set
};
