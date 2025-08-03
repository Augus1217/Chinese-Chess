const http = require('http');
const path = require('path');
const express = require('express');
const WebSocket = require('ws');
const { spawn } = require('child_process');

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
        console.log(`[Engine] Spawning engine from: ${enginePath}`);
        try {
            engineProcess = spawn(enginePath, [], { cwd: path.dirname(enginePath) });

            engineProcess.on('error', (err) => {
                console.error('[Engine] Spawn Error:', err);
                ws.send(JSON.stringify({ type: 'error', data: `Engine spawn error: ${err.message}` }));
            });

            engineProcess.stdout.on('data', (data) => {
                const output = data.toString().trim();
                console.log(`[Engine OUT] ${output}`);
                if (output.startsWith('bestmove')) {
                    const uciMove = output.split(' ')[1];
                    if (uciMove && uciMove !== '(none)') {
                        ws.send(JSON.stringify({ type: 'engineMove', move: uciMove }));
                    }
                }
            });

            engineProcess.stderr.on('data', (data) => {
                console.error(`[Engine ERR] ${data}`);
            });

            engineProcess.on('close', (code) => {
                console.log(`[Engine] Process exited with code ${code}`);
                engineProcess = null;
            });

            // Initialize engine
            engineProcess.stdin.write('uci\n');
            engineProcess.stdin.write(`setoption name EvalFile value ${nnuePath}\n`);
            engineProcess.stdin.write('isready\n');

        } catch (e) {
            console.error("[Engine] FATAL: Failed to spawn.", e);
            ws.send(JSON.stringify({ type: 'error', data: 'Failed to start engine on server.' }));
        }
    };

    startEngine();

    ws.on('message', (message) => {
        const msg = JSON.parse(message);
        if (msg.type === 'getmove' && engineProcess) {
            console.log(`[FEN] ${msg.fen}`);
            const movetime = msg.movetime || 2000;
            engineProcess.stdin.write(`position fen ${msg.fen}\n`);
            engineProcess.stdin.write(`go movetime ${movetime}\n`);
        }
    });

    ws.on('close', () => {
        console.log('[WebSocket] Client disconnected.');
        if (engineProcess) {
            engineProcess.kill();
        }
    });
});

// --- Vercel Serverless Function Entry Point ---
// Vercel will use this exported server to handle requests.
module.exports = server;

// --- Local Development Startup ---
// This block allows you to run the server directly with `node server.js` for local testing.
// It will not be executed in the Vercel environment.
if (require.main === module) {
    const PORT = process.env.PORT || 3000;
    server.listen(PORT, () => {
        console.log(`Server is listening on port ${PORT}`);
    });
}