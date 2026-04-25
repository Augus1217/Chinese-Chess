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
    } else if (process.platform === 'win32') {
        platformSubDir = 'Windows';
    }

    if (isPackagedApp) {
        // In packaged app, resources are in the `resources` directory
        const resourcesDir = path.join(process.resourcesPath, 'engine');
        enginePath = path.join(resourcesDir, platformSubDir, engineName);
        nnuePath = path.join(resourcesDir, nnueFileName);
    } else {
        // In dev, resources are at the project root (one level up from api folder)
        const devEngineDir = path.join(__dirname, '..', 'pikafish-20260131');
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
    let pendingSearch = null;
    const commandQueue = [];
    let isProcessingQueue = false;
    let isEngineReady = false;
    let engineInitStage = 'idle';
    let engineReadyPromise = Promise.resolve();
    let resolveEngineReady = null;
    let rejectEngineReady = null;

    const parseEngineInfoLine = (line) => {
        if (!line.startsWith('info')) {
            return null;
        }

        const depthMatch = line.match(/\bdepth\s+(\d+)/);
        const nodesMatch = line.match(/\bnodes\s+(\d+)/);
        const multipvMatch = line.match(/\bmultipv\s+(\d+)/);
        const cpMatch = line.match(/\bscore\s+cp\s+(-?\d+)/);
        const mateMatch = line.match(/\bscore\s+mate\s+(-?\d+)/);
        const pvMatch = line.match(/\bpv\s+(.+)$/);

        if (!cpMatch && !mateMatch) {
            return null;
        }

        const score = cpMatch
            ? { type: 'cp', value: parseInt(cpMatch[1], 10) }
            : { type: 'mate', value: parseInt(mateMatch[1], 10) };

        return {
            depth: depthMatch ? parseInt(depthMatch[1], 10) : null,
            nodes: nodesMatch ? parseInt(nodesMatch[1], 10) : null,
            multipv: multipvMatch ? parseInt(multipvMatch[1], 10) : 1,
            score,
            pv: pvMatch ? pvMatch[1].trim().split(/\s+/) : []
        };
    };

    const MATE_CP_EQUIVALENT = 32000;

    const scoreToCp = (score) => {
        if (!score) {
            return null;
        }
        if (score.type === 'cp') {
            return score.value;
        }
        if (score.type === 'mate') {
            const sign = score.value >= 0 ? 1 : -1;
            return sign * MATE_CP_EQUIVALENT;
        }
        return null;
    };

    const enqueueCommand = async (handler) => {
        commandQueue.push(handler);
        if (isProcessingQueue) {
            return;
        }

        isProcessingQueue = true;
        while (commandQueue.length > 0 && engineProcess) {
            const next = commandQueue.shift();
            try {
                await next();
            } catch (err) {
                console.error('[Engine Queue] Task failed:', err);
            }
        }
        isProcessingQueue = false;
    };

    const resetEngineInitialization = () => {
        isEngineReady = false;
        engineInitStage = 'waiting_uciok';
        engineReadyPromise = new Promise((resolve, reject) => {
            resolveEngineReady = resolve;
            rejectEngineReady = reject;
        });
    };

    const resolveEngineInitialization = () => {
        if (isEngineReady) {
            return;
        }
        isEngineReady = true;
        engineInitStage = 'ready';
        if (resolveEngineReady) {
            resolveEngineReady();
            resolveEngineReady = null;
            rejectEngineReady = null;
        }
    };

    const rejectEngineInitialization = (error) => {
        if (rejectEngineReady) {
            rejectEngineReady(error);
            rejectEngineReady = null;
            resolveEngineReady = null;
        }
        isEngineReady = false;
        engineInitStage = 'failed';
    };

    const ensureEngineReady = async () => {
        if (isEngineReady) {
            return;
        }
        await engineReadyPromise;
    };

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
                resetEngineInitialization();

                let buffer = '';
                engineProcess.stdout.on('data', (data) => {
                    buffer += data.toString();
                    let lines = buffer.split(/\r?\n/);
                    buffer = lines.pop() || '';

                    lines.forEach(line => {
                        const output = line.trim();
                        if (output) {
                            console.log(`[Engine STDOUT] ${output}`);

                            if (output === 'uciok' && engineInitStage === 'waiting_uciok') {
                                engineInitStage = 'waiting_readyok';
                                const evalFileValue = process.platform === 'win32' ? path.basename(nnuePath) : nnuePath;
                                safeWriteToEngine(`setoption name EvalFile value ${evalFileValue}\n`);
                                safeWriteToEngine('setoption name UCI_LimitStrength value true\n');
                                safeWriteToEngine('isready\n');
                                return;
                            }

                            if (output === 'readyok' && engineInitStage === 'waiting_readyok') {
                                resolveEngineInitialization();
                                ws.send(JSON.stringify({ type: 'engine_ready' }));
                                return;
                            }

                            if (pendingSearch) {
                                const parsedInfo = parseEngineInfoLine(output);
                                if (parsedInfo) {
                                    const key = parsedInfo.multipv || 1;
                                    const existing = pendingSearch.infos[key];
                                    if (!existing || (parsedInfo.depth || 0) >= (existing.depth || 0)) {
                                        pendingSearch.infos[key] = parsedInfo;
                                    }
                                    return;
                                }

                                if (output.startsWith('bestmove')) {
                                    const bestmove = output.split(' ')[1] || null;
                                    const infos = pendingSearch.infos;
                                    const primaryInfo = infos[1] || infos[Object.keys(infos)[0]] || null;
                                    clearTimeout(pendingSearch.timer);
                                    const resolver = pendingSearch.resolve;
                                    pendingSearch = null;
                                    resolver({ bestmove, infos, primaryInfo });
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
                    rejectEngineInitialization(new Error(`Engine process exited with code ${code}.`));
                    if (pendingSearch) {
                        clearTimeout(pendingSearch.timer);
                        pendingSearch.reject(new Error('Engine process closed.'));
                        pendingSearch = null;
                    }
                    commandQueue.length = 0;
                    engineProcess = null;
                });

                engineProcess.on('error', (err) => {
                    console.error('[Engine] Spawn Error Event:', err);
                    rejectEngineInitialization(err);
                    ws.send(JSON.stringify({ type: 'error', data: `Engine spawn error: ${err.message}` }));
                });

                // Add error handler for stdin to catch EPIPE errors
                engineProcess.stdin.on('error', (err) => {
                    console.error('[Engine] Stdin Error:', err);
                });

                // Check if stdin is writable before writing
                if (engineProcess.stdin && engineProcess.stdin.writable) {
                    if (!safeWriteToEngine('uci\n')) {
                        rejectEngineInitialization(new Error('Failed to initialize engine (uci write failed).'));
                    }
                } else {
                    console.error('[Engine] Stdin is not writable');
                    rejectEngineInitialization(new Error('Engine stdin is not writable.'));
                }

            } catch (e) {
                console.error("[Engine] FATAL: Failed to spawn process.", e);
                rejectEngineInitialization(e);
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

        const setEngineOptions = (settings = null) => {
            if (!settings) {
                return;
            }

            safeWriteToEngine(`setoption name UCI_LimitStrength value ${settings.limitStrength}\n`);
            if (settings.limitStrength) {
                safeWriteToEngine(`setoption name UCI_Elo value ${settings.elo}\n`);
            }
            safeWriteToEngine(`setoption name Skill Level value ${settings.skillLevel}\n`);
            safeWriteToEngine(`setoption name Threads value ${settings.threads}\n`);
            safeWriteToEngine(`setoption name Hash value ${settings.hash}\n`);
            safeWriteToEngine(`setoption name MultiPV value ${settings.multipv}\n`);
            safeWriteToEngine(`setoption name Ponder value ${settings.ponder}\n`);
            safeWriteToEngine(`setoption name Move Overhead value ${settings.overhead}\n`);
            safeWriteToEngine(`setoption name Repetition Rule value ${settings.repetition}\n`);
            safeWriteToEngine(`setoption name Draw Rule value ${settings.draw}\n`);
            safeWriteToEngine(`setoption name Sixty Move Rule value ${settings.sixty}\n`);
            safeWriteToEngine(`setoption name Rule60MaxPly value ${settings.ply}\n`);
        };

        const runSearch = ({ positionCommand, goCommand, timeoutMs = 12000 }) => {
            return new Promise((resolve, reject) => {
                if (pendingSearch) {
                    reject(new Error('Engine is busy with another search.'));
                    return;
                }

                if (!safeWriteToEngine(positionCommand)) {
                    reject(new Error('Failed to send position command.'));
                    return;
                }

                pendingSearch = {
                    infos: {},
                    timer: setTimeout(() => {
                        if (pendingSearch) {
                            pendingSearch = null;
                            reject(new Error('Engine search timeout.'));
                        }
                    }, timeoutMs),
                    resolve: (result) => {
                        resolve(result);
                    },
                    reject: (error) => {
                        reject(error);
                    }
                };

                if (!safeWriteToEngine(goCommand)) {
                    clearTimeout(pendingSearch.timer);
                    pendingSearch = null;
                    reject(new Error('Failed to send go command.'));
                }
            });
        };

        startEngine();

        ws.on('message', (message) => {
            try {
                const msg = JSON.parse(message);
                if (msg.type === 'getmove' && engineProcess) {
                    enqueueCommand(async () => {
                        try {
                            await ensureEngineReady();
                            const requestedMoveTime = Number(msg.movetime);
                            const movetime = Number.isFinite(requestedMoveTime)
                                ? Math.max(100, Math.min(30000, Math.round(requestedMoveTime)))
                                : 3000;

                            setEngineOptions(msg.aiSettings || null);
                            const searchResult = await runSearch({
                                positionCommand: `position fen ${msg.fen}\n`,
                                goCommand: `go movetime ${movetime}\n`,
                                timeoutMs: movetime + 8000
                            });

                            if (searchResult.bestmove && searchResult.bestmove !== '(none)') {
                                ws.send(JSON.stringify({ type: 'engineMove', move: searchResult.bestmove }));
                            }
                        } catch (err) {
                            console.error('[Engine] getmove failed:', err);
                            ws.send(JSON.stringify({
                                type: 'error',
                                data: `Engine move search failed: ${err.message}`
                            }));
                        }
                    });
                }

                if (msg.type === 'analyze_move' && engineProcess) {
                    enqueueCommand(async () => {
                        const requestId = msg.requestId || `req-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
                        const requestedMoveTime = Number(msg.movetime);
                        const movetime = Number.isFinite(requestedMoveTime)
                            ? Math.max(50, Math.min(10000, Math.round(requestedMoveTime)))
                            : 300;
                        const searchTimeoutMs = Math.max(900, movetime * 3 + 400);
                        const ply = Number.isInteger(msg.ply) ? msg.ply : -1;
                        const playedMove = String(msg.playedMove || '').trim();

                        if (!msg.fenBefore || !playedMove) {
                            ws.send(JSON.stringify({
                                type: 'analysis_error',
                                requestId,
                                ply,
                                data: 'Missing fenBefore or playedMove for analyze_move.'
                            }));
                            return;
                        }
                        try {
                            await ensureEngineReady();
                            setEngineOptions(msg.aiSettings || null);

                            const bestResult = await runSearch({
                                positionCommand: `position fen ${msg.fenBefore}\n`,
                                goCommand: `go movetime ${movetime}\n`,
                                timeoutMs: searchTimeoutMs
                            });

                            const playedResult = await runSearch({
                                positionCommand: `position fen ${msg.fenBefore} moves ${playedMove}\n`,
                                goCommand: `go movetime ${movetime}\n`,
                                timeoutMs: searchTimeoutMs
                            });

                            const bestScore = bestResult.primaryInfo ? bestResult.primaryInfo.score : null;
                            const playedScoreRaw = playedResult.primaryInfo ? playedResult.primaryInfo.score : null;
                            const bestScoreCp = scoreToCp(bestScore);
                            const playedScoreCp = playedScoreRaw ? -scoreToCp(playedScoreRaw) : null;
                            const deltaCp = (bestScoreCp !== null && playedScoreCp !== null)
                                ? Math.max(0, bestScoreCp - playedScoreCp)
                                : null;

                            const candidates = Object.values(bestResult.infos || {})
                                .sort((a, b) => (a.multipv || 99) - (b.multipv || 99))
                                .map(info => ({
                                    multipv: info.multipv,
                                    depth: info.depth,
                                    nodes: info.nodes,
                                    score: info.score,
                                    pv: info.pv,
                                    move: info.pv && info.pv.length > 0 ? info.pv[0] : null
                                }));

                            ws.send(JSON.stringify({
                                type: 'analyze_move_result',
                                requestId,
                                ply,
                                playedMove,
                                bestMove: bestResult.bestmove || null,
                                bestScore,
                                playedScore: playedScoreRaw,
                                bestScoreCp,
                                playedScoreCp,
                                deltaCp,
                                depth: bestResult.primaryInfo ? bestResult.primaryInfo.depth : null,
                                nodes: bestResult.primaryInfo ? bestResult.primaryInfo.nodes : null,
                                bestPv: bestResult.primaryInfo ? bestResult.primaryInfo.pv : [],
                                candidates
                            }));
                        } catch (err) {
                            console.error('[Engine] analyze_move failed:', err);
                            ws.send(JSON.stringify({
                                type: 'analysis_error',
                                requestId,
                                ply,
                                data: `Analyze move failed: ${err.message}`
                            }));
                        }
                    });
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