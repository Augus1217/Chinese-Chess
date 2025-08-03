const http = require('http');
const path = require('path');
const express = require('express');
const WebSocket = require('ws');
const { spawn } = require('child_process');
const fs = require('fs');

// Create Express app
const app = express();

// Serve static files from the 'public' directory
app.use(express.static(path.join(__dirname, 'public')));

// Create an HTTP server from the Express app
const server = http.createServer(app);

// Create a WebSocket server and attach it to the HTTP server
const wss = new WebSocket.Server({ server });

// Resolve the path to the engine executable
const enginePath = path.resolve(__dirname, 'pikafish-sse41-popcnt');
const nnuePath = path.resolve(__dirname, 'pikafish.nnue');

// --- WebSocket Connection Handling ---
wss.on('connection', (ws) => {
    console.log('[WebSocket] Client connected.');
    let engineProcess = null;

    const startEngine = () => {
        // --- Pre-flight checks ---
        console.log('--- [Engine Start] Pre-flight Checks ---');
        console.log(`[Check 1] Current working directory: ${process.cwd()}`)
        console.log(`[Check 2] Resolved engine path: ${enginePath}`);
        console.log(`[Check 3] Resolved NNUE path: ${nnuePath}`);

        const engineExists = fs.existsSync(enginePath);
        const nnueExists = fs.existsSync(nnuePath);
        console.log(`[Check 4] Does engine file exist? ${engineExists}`);
        console.log(`[Check 5] Does NNUE file exist? ${nnueExists}`);

        if (!engineExists) {
            const errorMsg = 'FATAL: Engine executable not found at path.';
            console.error(errorMsg);
            ws.send(JSON.stringify({ type: 'error', data: errorMsg }));
            return;
        }
        if (!nnueExists) {
            const errorMsg = 'FATAL: NNUE file not found at path.';
            console.error(errorMsg);
            ws.send(JSON.stringify({ type: 'error', data: errorMsg }));
            return;
        }
        console.log('--- [Engine Start] Pre-flight Checks Passed ---');

        try {
            console.log(`[Engine] Spawning engine process...`);
            engineProcess = spawn(enginePath, [], { cwd: path.dirname(enginePath) });

            engineProcess.on('spawn', () => {
                console.log('[Engine] Spawn event triggered. Process should be running.');
            });

            engineProcess.on('error', (err) => {
                console.error('[Engine] Spawn Error Event:', err);
                ws.send(JSON.stringify({ type: 'error', data: `Engine spawn error: ${err.message}` }));
            });

            engineProcess.stdout.on('data', (data) => {
                const output = data.toString().trim();
                console.log(`[Engine STDOUT] ${output}`);
                if (output.startsWith('bestmove')) {
                    const uciMove = output.split(' ')[1];
                    if (uciMove && uciMove !== '(none)') {
                        ws.send(JSON.stringify({ type: 'engineMove', move: uciMove }));
                    }
                }
            });

            engineProcess.stderr.on('data', (data) => {
                const output = data.toString().trim();
                console.error(`[Engine STDERR] ${output}`);
                // Send engine startup errors to the client for immediate feedback
                ws.send(JSON.stringify({ type: 'error', data: `Engine STDERR: ${output}` }));
            });

            engineProcess.on('close', (code, signal) => {
                console.log(`[Engine] Process exited with code: ${code}, signal: ${signal}`);
                engineProcess = null;
            });

            // Initialize engine
            console.log('[Engine] Sending UCI initialization commands.');
            engineProcess.stdin.write('uci\n');
            engineProcess.stdin.write(`setoption name EvalFile value ${nnuePath}\n`);
            engineProcess.stdin.write('isready\n');

        } catch (e) {
            console.error("[Engine] FATAL: Failed to spawn process inside try/catch block.", e);
            ws.send(JSON.stringify({ type: 'error', data: 'Failed to start engine on server (catch block).' }));
        }
    };

    startEngine();

    ws.on('message', (message) => {
        try {
            const msg = JSON.parse(message);
            if (msg.type === 'getmove' && engineProcess && engineProcess.stdin.writable) {
                console.log(`[FEN] Received: ${msg.fen}`);
                const movetime = msg.movetime || 2000;
                const command = `position fen ${msg.fen}\n`;
                const goCommand = `go movetime ${movetime}\n`;
                console.log(`[Engine Command] ${command.trim()}`);
                console.log(`[Engine Command] ${goCommand.trim()}`);
                engineProcess.stdin.write(command);
                engineProcess.stdin.write(goCommand);
            } else {
                 console.log('[WebSocket] Received message, but engine process is not ready or message type is not getmove.');
            }
        } catch (error) {
            console.error('[WebSocket] Error parsing message:', error);
        }
    });

    ws.on('close', () => {
        console.log('[WebSocket] Client disconnected.');
        if (engineProcess) {
            console.log('[Engine] Killing engine process due to WebSocket disconnect.');
            engineProcess.kill();
        }
    });

     ws.on('error', (error) => {
        console.error('[WebSocket] Error:', error);
    });
});

// --- Vercel Serverless Function Entry Point ---
module.exports = server;

// --- Local Development Startup ---
if (require.main === module) {
    const PORT = process.env.PORT || 3000;
    server.listen(PORT, () => {
        console.log(`Server is listening on port ${PORT}`);
    });
}