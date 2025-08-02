const http = require('http');
const WebSocket = require('ws');
const { spawn } = require('child_process');
const path = require('path');

// Create an HTTP server
const server = http.createServer((req, res) => {
    // Vercel handles static file serving based on vercel.json
    // This function can be left empty or handle specific API requests if needed.
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('This is the WebSocket server. Static files are served separately.');
});

// Create a WebSocket server and attach it to the HTTP server
const wss = new WebSocket.Server({ server });

// Resolve the path to the engine executable bundled with the deployment
// IMPORTANT: The engine must be included in your repository
const enginePath = path.resolve(__dirname, 'Pikafish.exe'); 
const nnuePath = path.resolve(__dirname, 'pikafish.nnue');

// --- WebSocket Connection Handling ---
wss.on('connection', (ws) => {
    console.log('[WebSocket] Client connected.');
    let engineProcess = null;

    const startEngine = () => {
        console.log(`[Engine] Spawning engine from: ${enginePath}`);
        try {
            // Vercel's environment requires us to be specific about paths
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

// Export the server for Vercel's runtime
module.exports = server;
