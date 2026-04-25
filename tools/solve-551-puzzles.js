#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { spawn, execFile } = require('child_process');

const MATE_CP_EQUIVALENT = 32000;
const DEFAULT_MOVETIME_MS = 5000;
const DEFAULT_MULTIPV = 2;
const DEFAULT_MAX_PLIES = 120;
const DEFAULT_LIMIT = 551;
const DEFAULT_PUZZLE_TIMEOUT_MS = 5 * 60 * 1000;
const DRAW_PUZZLE_IDS = new Set(['064', '087']);

const ENGINE_PRIORITY = ['vnni512', 'avx512icl', 'avx512', 'avxvnni', 'bmi2', 'avx2', 'sse41-popcnt'];

const ROOT_DIR = path.resolve(__dirname, '..');
const ENGINE_BASE_DIR = path.join(ROOT_DIR, 'pikafish-20260131');
const PUZZLE_FILE_CANDIDATES = [
    path.join(ROOT_DIR, 'public', '適情雅趣.fen'),
    path.join(ROOT_DIR, 'public', 'shiqingyaqu551.fen')
];
const OUTPUT_JSON = path.join(ROOT_DIR, 'public', 'puzzle_solutions.json');
const OUTPUT_PGN = path.join(ROOT_DIR, 'public', 'puzzle_solutions.pgn');

function parseArgs(argv) {
    const args = {
        movetime: DEFAULT_MOVETIME_MS,
        multipv: DEFAULT_MULTIPV,
        maxPlies: DEFAULT_MAX_PLIES,
        limit: DEFAULT_LIMIT,
        start: 119,
        puzzleTimeoutMs: DEFAULT_PUZZLE_TIMEOUT_MS
    };

    for (let i = 2; i < argv.length; i++) {
        const token = argv[i];
        if (!token.startsWith('--')) continue;
        const key = token.slice(2);
        const value = argv[i + 1];
        if (value === undefined || value.startsWith('--')) continue;

        if (key === 'movetime') args.movetime = Math.max(100, Number(value) || DEFAULT_MOVETIME_MS);
        if (key === 'multipv') args.multipv = Math.max(2, Number(value) || DEFAULT_MULTIPV);
        if (key === 'max-plies') args.maxPlies = Math.max(10, Number(value) || DEFAULT_MAX_PLIES);
        if (key === 'limit') args.limit = Math.max(1, Number(value) || DEFAULT_LIMIT);
        if (key === 'start') args.start = Math.max(1, Number(value) || 119);
        if (key === 'puzzle-timeout-ms') args.puzzleTimeoutMs = Math.max(1000, Number(value) || DEFAULT_PUZZLE_TIMEOUT_MS);
    }

    return args;
}

function getPlatformInfo() {
    if (process.platform === 'linux') {
        return {
            subDir: 'Linux',
            extension: '',
            cpuFeatureBinary: path.join(ROOT_DIR, 'api', 'cpu_features_linux'),
            defaultEngine: 'pikafish-sse41-popcnt'
        };
    }

    if (process.platform === 'win32') {
        return {
            subDir: 'Windows',
            extension: '.exe',
            cpuFeatureBinary: path.join(ROOT_DIR, 'api', 'cpu_features.exe'),
            defaultEngine: 'pikafish-sse41-popcnt.exe'
        };
    }

    if (process.platform === 'darwin') {
        return {
            subDir: 'MacOS',
            extension: '',
            cpuFeatureBinary: null,
            defaultEngine: 'pikafish-apple-silicon'
        };
    }

    throw new Error(`Unsupported platform: ${process.platform}`);
}

function execFilePromise(file, args = []) {
    return new Promise((resolve, reject) => {
        execFile(file, args, (error, stdout, stderr) => {
            if (error) {
                reject(error);
                return;
            }
            resolve({ stdout, stderr });
        });
    });
}

async function detectEngineName(platformInfo) {
    if (!platformInfo.cpuFeatureBinary || !fs.existsSync(platformInfo.cpuFeatureBinary)) {
        return platformInfo.defaultEngine;
    }

    try {
        const { stdout } = await execFilePromise(platformInfo.cpuFeatureBinary);
        const features = JSON.parse(stdout || '{}');
        for (const suffix of ENGINE_PRIORITY) {
            if (features[suffix]) {
                return `pikafish-${suffix}${platformInfo.extension}`;
            }
        }
    } catch (err) {
        console.warn('[Solver] CPU feature detection failed, using default engine:', err.message);
    }

    return platformInfo.defaultEngine;
}

function resolveEnginePaths(engineName, platformInfo) {
    const enginePath = path.join(ENGINE_BASE_DIR, platformInfo.subDir, engineName);
    const evalPathInSubDir = path.join(ENGINE_BASE_DIR, platformInfo.subDir, 'pikafish.nnue');
    const evalPathRoot = path.join(ENGINE_BASE_DIR, 'pikafish.nnue');
    const nnuePath = fs.existsSync(evalPathInSubDir) ? evalPathInSubDir : evalPathRoot;

    if (!fs.existsSync(enginePath)) {
        throw new Error(`Engine binary not found: ${enginePath}`);
    }
    if (!fs.existsSync(nnuePath)) {
        throw new Error(`NNUE file not found: ${nnuePath}`);
    }

    if ((process.platform === 'linux' || process.platform === 'darwin') && !process.env.SNAP) {
        try {
            fs.chmodSync(enginePath, 0o755);
        } catch (err) {
            console.warn(`[Solver] Failed to chmod engine executable: ${err.message}`);
        }
    }

    return { enginePath, nnuePath };
}

function parsePuzzleLibrary(content) {
    const lines = String(content || '').replace(/^\uFEFF/, '').split(/\r?\n/);
    const entries = [];
    let fenIndex = '';
    let eventName = '';

    lines.forEach((lineRaw) => {
        const line = lineRaw.trim();
        if (!line) return;

        const idxMatch = line.match(/^\[FEN_INDEX\s+"([^"]+)"\]$/);
        if (idxMatch) {
            fenIndex = idxMatch[1];
            return;
        }

        const eventMatch = line.match(/^\[EVENT\s+"([^"]+)"\]$/);
        if (eventMatch) {
            eventName = eventMatch[1];
            return;
        }

        const fenMatch = line.match(/^\[FEN\s+"([^"]+)"\]$/);
        if (fenMatch) {
            entries.push({
                index: fenIndex || `puzzle-${entries.length + 1}`,
                event: eventName || `Puzzle ${entries.length + 1}`,
                fen: fenMatch[1]
            });
            fenIndex = '';
            eventName = '';
        }
    });

    return entries;
}

function getPuzzleIdSuffix(index) {
    const match = String(index || '').match(/(\d{3})$/);
    return match ? match[1] : null;
}

function isDrawPuzzle(index) {
    const suffix = getPuzzleIdSuffix(index);
    return suffix ? DRAW_PUZZLE_IDS.has(suffix) : false;
}

function loadPuzzleEntries() {
    const filePath = PUZZLE_FILE_CANDIDATES.find(file => fs.existsSync(file));
    if (!filePath) {
        throw new Error('Puzzle file not found. Expected 適情雅趣.fen or shiqingyaqu551.fen in public/.');
    }

    const content = fs.readFileSync(filePath, 'utf8');
    const entries = parsePuzzleLibrary(content);
    if (!entries.length) {
        throw new Error(`No puzzle entries parsed from ${filePath}`);
    }

    return { filePath, entries };
}

function parseEngineInfoLine(line) {
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
}

function scoreToCp(score) {
    if (!score) return null;
    if (score.type === 'cp') return score.value;
    if (score.type === 'mate') {
        const sign = score.value >= 0 ? 1 : -1;
        return sign * MATE_CP_EQUIVALENT;
    }
    return null;
}

class PuzzleTimeoutError extends Error {
    constructor(timeoutMs) {
        super(`Puzzle exceeded timeout of ${Math.round(timeoutMs / 1000)} seconds`);
        this.name = 'PuzzleTimeoutError';
        this.timeoutMs = timeoutMs;
    }
}

class UciEngine {
    constructor(label, enginePath, nnuePath, multipv) {
        this.label = label;
        this.enginePath = enginePath;
        this.nnuePath = nnuePath;
        this.multipv = multipv;
        this.process = null;
        this.buffer = '';
        this.pendingSearch = null;
        this.waiters = [];
        this.queue = Promise.resolve();
    }

    async start() {
        this.process = spawn(this.enginePath, [], { cwd: path.dirname(this.enginePath) });

        this.process.stdout.on('data', (data) => {
            this.buffer += data.toString();
            const parts = this.buffer.split(/\r?\n/);
            this.buffer = parts.pop() || '';
            parts.forEach((line) => this.handleLine(line.trim()));
        });

        this.process.stderr.on('data', (data) => {
            const text = data.toString().trim();
            if (text) {
                console.warn(`[${this.label}] STDERR: ${text}`);
            }
        });

        this.process.on('close', (code) => {
            const err = new Error(`[${this.label}] Engine exited with code ${code}`);
            if (this.pendingSearch) {
                clearTimeout(this.pendingSearch.timer);
                this.pendingSearch.reject(err);
                this.pendingSearch = null;
            }
            this.rejectAllWaiters(err);
        });

        this.process.on('error', (err) => {
            this.rejectAllWaiters(err);
        });

        this.write('uci\n');
        await this.waitForLine(line => line === 'uciok', 15000, 'uciok');

        const evalFileValue = process.platform === 'win32' ? path.basename(this.nnuePath) : this.nnuePath;
        this.write(`setoption name EvalFile value ${evalFileValue}\n`);
        this.write('setoption name UCI_LimitStrength value false\n');
        this.write(`setoption name MultiPV value ${this.multipv}\n`);
        this.write('isready\n');
        await this.waitForLine(line => line === 'readyok', 15000, 'readyok');
    }

    handleLine(line) {
        if (!line) return;

        this.resolveWaiters(line);

        if (!this.pendingSearch) {
            return;
        }

        const parsedInfo = parseEngineInfoLine(line);
        if (parsedInfo) {
            const key = parsedInfo.multipv || 1;
            const existing = this.pendingSearch.infos[key];
            if (!existing || (parsedInfo.depth || 0) >= (existing.depth || 0)) {
                this.pendingSearch.infos[key] = parsedInfo;
            }
            return;
        }

        if (line.startsWith('bestmove')) {
            const bestmove = line.split(/\s+/)[1] || null;
            clearTimeout(this.pendingSearch.timer);
            const done = this.pendingSearch;
            this.pendingSearch = null;
            done.resolve({
                bestmove,
                infos: done.infos
            });
        }
    }

    resolveWaiters(line) {
        const matched = [];
        this.waiters.forEach((waiter) => {
            if (waiter.predicate(line)) {
                clearTimeout(waiter.timer);
                matched.push(waiter);
            }
        });
        if (matched.length === 0) {
            return;
        }

        this.waiters = this.waiters.filter(waiter => !matched.includes(waiter));
        matched.forEach(waiter => waiter.resolve(line));
    }

    rejectAllWaiters(error) {
        this.waiters.forEach((waiter) => {
            clearTimeout(waiter.timer);
            waiter.reject(error);
        });
        this.waiters = [];
    }

    waitForLine(predicate, timeoutMs, label) {
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                this.waiters = this.waiters.filter(waiter => waiter !== waiterObj);
                reject(new Error(`[${this.label}] Timeout waiting for ${label}`));
            }, timeoutMs);

            const waiterObj = {
                predicate,
                resolve,
                reject,
                timer
            };

            this.waiters.push(waiterObj);
        });
    }

    write(command) {
        if (!this.process || !this.process.stdin || !this.process.stdin.writable) {
            throw new Error(`[${this.label}] Engine stdin is not writable`);
        }
        this.process.stdin.write(command);
    }

    enqueue(task) {
        const next = this.queue.then(() => task());
        this.queue = next.catch(() => {});
        return next;
    }

    search(fen, moves, movetimeMs) {
        return this.enqueue(() => this.searchInternal(fen, moves, movetimeMs));
    }

    searchInternal(fen, moves, movetimeMs) {
        if (this.pendingSearch) {
            return Promise.reject(new Error(`[${this.label}] Search requested while busy`));
        }

        const moveSuffix = moves.length > 0 ? ` moves ${moves.join(' ')}` : '';
        this.write(`position fen ${fen}${moveSuffix}\n`);

        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                if (this.pendingSearch) {
                    this.pendingSearch = null;
                }
                reject(new Error(`[${this.label}] Search timeout`));
            }, movetimeMs + 15000);

            this.pendingSearch = {
                infos: {},
                resolve,
                reject,
                timer
            };

            this.write(`go movetime ${movetimeMs}\n`);
        });
    }

    async stop() {
        if (!this.process) return;

        try {
            this.write('quit\n');
        } catch (err) {
            // no-op
        }

        await new Promise((resolve) => {
            const timer = setTimeout(() => {
                if (this.process) {
                    this.process.kill('SIGKILL');
                }
                resolve();
            }, 2000);

            this.process.once('close', () => {
                clearTimeout(timer);
                resolve();
            });
        });
    }
}

function assessUniqueness(searchResult) {
    const mpv1 = searchResult.infos[1] || null;
    const mpv2 = searchResult.infos[2] || null;
    if (!mpv1 || !mpv2 || !mpv2.pv || mpv2.pv.length === 0) {
        return { unique: true, gapCp: null, secondMove: null };
    }

    const bestMove = searchResult.bestmove;
    const secondMove = mpv2.pv[0];
    if (!secondMove || secondMove === bestMove) {
        return { unique: true, gapCp: null, secondMove: null };
    }

    const cp1 = scoreToCp(mpv1.score);
    const cp2 = scoreToCp(mpv2.score);
    if (cp1 === null || cp2 === null) {
        return { unique: true, gapCp: null, secondMove };
    }

    const gapCp = cp1 - cp2;
    return {
        unique: gapCp !== 0,
        gapCp,
        secondMove
    };
}

async function solveSinglePuzzle(entry, engines, options) {
    const fenParts = entry.fen.split(/\s+/);
    let sideToMove = fenParts[1] === 'b' ? 'b' : 'w';
    const moves = [];
    const ambiguousAt = [];
    let unique = true;
    let result = '*';
    const drawPuzzle = isDrawPuzzle(entry.index);
    const puzzleStartedAt = Date.now();

    for (let ply = 0; ply < options.maxPlies; ply++) {
        const elapsedMs = Date.now() - puzzleStartedAt;
        const remainingMs = options.puzzleTimeoutMs - elapsedMs;
        if (remainingMs <= 0) {
            throw new PuzzleTimeoutError(options.puzzleTimeoutMs);
        }

        const engine = sideToMove === 'w' ? engines.red : engines.black;
        const movetimeMs = Math.min(options.movetime, Math.max(100, remainingMs));
        const searchResult = await engine.search(entry.fen, moves, movetimeMs);
        const bestmove = searchResult.bestmove;

        if (!bestmove || bestmove === '(none)') {
            result = sideToMove === 'w' ? '0-1' : '1-0';
            break;
        }

        const uniqueness = assessUniqueness(searchResult);
        if (!uniqueness.unique) {
            unique = false;
            ambiguousAt.push({
                ply: ply + 1,
                bestMove: bestmove,
                secondMove: uniqueness.secondMove,
                gapCp: uniqueness.gapCp
            });
        }

        moves.push(bestmove);
        sideToMove = sideToMove === 'w' ? 'b' : 'w';
    }

    return {
        index: entry.index,
        event: entry.event,
        fen: entry.fen,
        moves,
        result: drawPuzzle ? '1/2-1/2' : result,
        unique,
        ambiguousAt,
        ...(drawPuzzle ? { target: 'draw' } : {})
    };
}

function formatMovesAsPgnText(moves) {
    const rows = [];
    for (let i = 0; i < moves.length; i += 2) {
        const turn = Math.floor(i / 2) + 1;
        const redMove = moves[i] || '';
        const blackMove = moves[i + 1] || '';
        rows.push(`${turn}. ${redMove}${blackMove ? ` ${blackMove}` : ''}`.trim());
    }
    return rows.join(' ');
}

function buildPgnBlock(solution, metadata) {
    const lines = [];
    lines.push(`[Event "${solution.event.replace(/\"/g, '')}"]`);
    lines.push('[Site "Engine self-play"]');
    lines.push(`[PuzzleIndex "${solution.index}"]`);
    lines.push(`[SetUp "1"]`);
    lines.push(`[FEN "${solution.fen}"]`);
    lines.push(`[MultiPV "${metadata.multipv}"]`);
    lines.push(`[MoveTimeMs "${metadata.movetime}"]`);
    lines.push(`[UniqueSolution "${solution.unique ? '1' : '0'}"]`);
    lines.push(`[Result "${solution.result}"]`);
    lines.push('');

    const moveText = formatMovesAsPgnText(solution.moves);
    lines.push(moveText ? `${moveText} ${solution.result}`.trim() : solution.result);
    return lines.join('\n');
}

function persistOutputs(solutions, metadataBase, startedAt) {
    const metadata = {
        ...metadataBase,
        generatedAt: new Date().toISOString(),
        count: solutions.length,
        elapsedSeconds: Math.round((Date.now() - startedAt) / 1000)
    };

    const uniqueCount = solutions.filter(s => s.unique).length;
    const solvedCount = solutions.filter(s => s.moves && s.moves.length > 0).length;

    const jsonPayload = {
        metadata: {
            ...metadata,
            solvedCount,
            uniqueCount
        },
        puzzles: solutions
    };

    const pgnText = solutions
        .map(solution => buildPgnBlock(solution, metadata))
        .join('\n\n');

    fs.writeFileSync(OUTPUT_JSON, JSON.stringify(jsonPayload, null, 2), 'utf8');
    fs.writeFileSync(OUTPUT_PGN, pgnText, 'utf8');

    return {
        solvedCount,
        uniqueCount,
        processedCount: solutions.length
    };
}

async function main() {
    const options = parseArgs(process.argv);
    const platformInfo = getPlatformInfo();
    const engineName = await detectEngineName(platformInfo);
    const { enginePath, nnuePath } = resolveEnginePaths(engineName, platformInfo);
    const { filePath, entries } = loadPuzzleEntries();

    const startIndex = Math.max(0, options.start - 1);
    const selectedEntries = entries.slice(startIndex, startIndex + options.limit);

    if (selectedEntries.length === 0) {
        throw new Error('No puzzles selected. Check --start and --limit arguments.');
    }

    console.log(`[Solver] Puzzle source: ${filePath}`);
    console.log(`[Solver] Engine: ${enginePath}`);
    console.log(`[Solver] Count: ${selectedEntries.length}, movetime=${options.movetime}, multipv=${options.multipv}, maxPlies=${options.maxPlies}, puzzleTimeoutMs=${options.puzzleTimeoutMs}`);

    const engineRed = new UciEngine('Engine-Red', enginePath, nnuePath, options.multipv);
    const engineBlack = new UciEngine('Engine-Black', enginePath, nnuePath, options.multipv);

    const startedAt = Date.now();
    const metadataBase = {
        puzzleSource: path.basename(filePath),
        engineName: path.basename(enginePath),
        movetime: options.movetime,
        multipv: options.multipv,
        maxPlies: options.maxPlies,
        puzzleTimeoutMs: options.puzzleTimeoutMs
    };

    try {
        await Promise.all([engineRed.start(), engineBlack.start()]);

        const solutions = [];
        let latestStats = {
            solvedCount: 0,
            uniqueCount: 0,
            processedCount: 0
        };

        for (let i = 0; i < selectedEntries.length; i++) {
            const entry = selectedEntries[i];
            console.log(`[Solver] (${i + 1}/${selectedEntries.length}) ${entry.index} ${entry.event}`);

            try {
                const solved = await solveSinglePuzzle(entry, {
                    red: engineRed,
                    black: engineBlack
                }, options);
                solutions.push(solved);
            } catch (err) {
                const timedOut = err instanceof PuzzleTimeoutError;
                const errorMessage = timedOut
                    ? `Timed out after ${Math.round(err.timeoutMs / 1000)} seconds`
                    : err.message;

                console.error(`[Solver] Failed on ${entry.index}:`, errorMessage);
                solutions.push({
                    index: entry.index,
                    event: entry.event,
                    fen: entry.fen,
                    moves: [],
                    result: '*',
                    unique: false,
                    ambiguousAt: [],
                    ...(timedOut ? { timedOut: true, timeoutMs: err.timeoutMs } : {}),
                    error: errorMessage
                });
            }

            latestStats = persistOutputs(solutions, metadataBase, startedAt);
            console.log(`[Solver] Progress saved (${latestStats.processedCount}/${selectedEntries.length})`);
        }

        latestStats = persistOutputs(solutions, metadataBase, startedAt);

        console.log(`[Solver] Done. JSON -> ${OUTPUT_JSON}`);
        console.log(`[Solver] Done. PGN  -> ${OUTPUT_PGN}`);
        console.log(`[Solver] solved=${latestStats.solvedCount}, unique=${latestStats.uniqueCount}, total=${solutions.length}`);
    } finally {
        await Promise.all([engineRed.stop(), engineBlack.stop()]);
    }
}

main().catch((err) => {
    console.error('[Solver] Fatal error:', err);
    process.exitCode = 1;
});
