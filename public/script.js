// --- Constants & State ---
const board = document.getElementById('board');
const setupBoard = document.getElementById('setup-board');
const statusDisplay = document.getElementById('status');
const startScreen = document.getElementById('start-screen');
const gameContainer = document.getElementById('game-container');
const setupContainer = document.getElementById('setup-container');
const checkmateOverlay = document.getElementById('checkmate-overlay');
const endgameTitle = document.getElementById('endgame-title');
const winnerMessage = document.getElementById('winner-message');
const undoBtn = document.getElementById('undoBtn');
const flipBoardBtn = document.getElementById('flipBoardBtn');
const resignBtn = document.getElementById('resignBtn');
const piecePalette = document.getElementById('piece-palette');
const startPlayerSelect = document.getElementById('start-player-select');
const pveColorSelect = document.getElementById('pve-color-select');
const ROWS = 10, COLS = 9;
let boardState = [], selectedPiece = null, currentPlayer = 'red', validMoves = [], gameEnded = false, isAiThinking = false;
let gameMode = 'pvp', playerColor = 'red', aiColor = 'black';
let moveHistory = []; 
let pieceToPlace = null;
let customBoardState = [];
let pieceCounts = {};
let pieceToMove = null;
let translations = {};
let boardFlipped = false;
let soundEffectsEnabled = true;
let userSoundPreference = true;
let isSettingsOpen = false;
let queuedAiMove = null;
let notationHistory = [];
let pgnMoves = [];
let reviewMode = false;
let reviewTimeline = [];
let reviewIndex = 0;
let reviewAnalysisMap = {};
let reviewIsAnalyzing = false;
let reviewAnalysisDone = false;
let reviewAnalyzedForMoveCount = 0;
let reviewPlayTimer = null;
let reviewRunId = 0;
let dragMoveSource = null;
let dragDropHandled = false;
let puzzleLibrary = null;
let currentPuzzle = null;
let puzzleModeActive = false;
let puzzleSolutionBook = null;
let currentPuzzleSolution = null;
let puzzleStepIndex = 0;
const pendingAnalysisRequests = new Map();

function playBgmIfNeeded() {
    const bgm = document.getElementById('bgm');
    if (bgm && bgm.paused) {
        bgm.play().catch(e => console.error('BGM play failed:', e));
    }
}

function setPuzzleNextButtonVisible(visible) {
    const nextBtn = document.getElementById('puzzle-next-btn');
    if (!nextBtn) return;
    nextBtn.classList.toggle('hidden', !visible);
}

function showMainEntrySelection() {
    const main = document.getElementById('main-entry-selection');
    const chess = document.getElementById('chess-mode-selection');
    const analysis = document.getElementById('analysis-upload-selection');

    if (main) main.classList.remove('hidden');
    if (chess) chess.classList.add('hidden');
    if (analysis) analysis.classList.add('hidden');
}

function showChessMenu() {
    const main = document.getElementById('main-entry-selection');
    const chess = document.getElementById('chess-mode-selection');
    const analysis = document.getElementById('analysis-upload-selection');

    if (main) main.classList.add('hidden');
    if (chess) chess.classList.remove('hidden');
    if (analysis) analysis.classList.add('hidden');
}

function showAnalysisUploadScreen() {
    const main = document.getElementById('main-entry-selection');
    const chess = document.getElementById('chess-mode-selection');
    const analysis = document.getElementById('analysis-upload-selection');

    if (main) main.classList.add('hidden');
    if (chess) chess.classList.add('hidden');
    if (analysis) analysis.classList.remove('hidden');
}

// --- Sound Effects ---
const sounds = {
    self: new Audio('sounds/move-self.webm'),
    capture: new Audio('sounds/move-capture.webm'),
    check: new Audio('sounds/move-check.webm')
};

function playSound(soundName) {
    if (!soundEffectsEnabled) return;

    const sound = sounds[soundName];
    if (sound) {
        sound.currentTime = 0;
        sound.play().catch(e => console.error("Error playing sound:", e));
    }
}

// --- Data & Tables ---
const initialBoard = [
    ['bR', 'bN', 'bB', 'bA', 'bK', 'bA', 'bB', 'bN', 'bR'], [null, null, null, null, null, null, null, null, null], [null, 'bC', null, null, null, null, null, 'bC', null], ['bP', null, 'bP', null, 'bP', null, 'bP', null, 'bP'], [null, null, null, null, null, null, null, null, null],
    [null, null, null, null, null, null, null, null, null], ['rP', null, 'rP', null, 'rP', null, 'rP', null, 'rP'], [null, 'rC', null, null, null, null, null, 'rC', null], [null, null, null, null, null, null, null, null, null], ['rR', 'rN', 'rB', 'rA', 'rK', 'rA', 'rB', 'rN', 'rR']
];

// --- Translation & Language ---
async function loadTranslations(lang) {
    try {
        const response = await fetch(`lang/${lang}.json`);
        if (!response.ok) {
            // Fallback to zh for zh-CN or other variants if specific file not found
            if (lang.startsWith('zh-')) {
                console.warn(`Could not load ${lang}.json, falling back to zh.json`);
                return loadTranslations('zh');
            }
            throw new Error(`Could not load ${lang}.json`);
        }
        translations = await response.json();
        localStorage.setItem('language', lang);
        window.electronAPI.languageChanged(lang);
        window.electronAPI.updateMenu(translations.menu);
        updateUI();

        // Regenerate notation history with the new language
        if (moveHistory.length > 0) {
            notationHistory = moveHistory.map(historyEntry => {
                return moveToNotation(historyEntry.move, historyEntry.board);
            });
            updateNotationDisplay();
        }

        const soundEffectsToggle = document.getElementById('sound-effects-toggle');
        soundEffectsToggle.disabled = false;
        soundEffectsEnabled = userSoundPreference;
        soundEffectsToggle.checked = userSoundPreference;

    } catch (error) {
        console.error("Failed to load translations:", error);
    }
}

function updateUI() {
    document.querySelectorAll('[data-i18n]').forEach(element => {
        const key = element.getAttribute('data-i18n');
        if (translations[key]) {
            element.innerHTML = translations[key];
        }
    });
    // Update dynamic text
    if (gameEnded) {
        const winner = currentPlayer === 'red' ? translations.black_wins : translations.red_wins;
        winnerMessage.textContent = winner;
    } else {
        statusDisplay.textContent = currentPlayer === 'red' ? translations.status_red_turn : translations.status_black_turn;
    }
}

// --- Game Setup & Core Logic ---
document.addEventListener('DOMContentLoaded', async () => {
    const savedLang = localStorage.getItem('language');
    const initialLang = savedLang || await window.electronAPI.getInitialLanguage();
    loadTranslations(initialLang);

    window.electronAPI.onSwitchLanguage((_event, lang) => {
        loadTranslations(lang);
    });

    // Main screen sliders
    const slider = document.getElementById('elo-slider');
    const input = document.getElementById('elo-input');
    if (slider && input) {
        slider.addEventListener('input', (e) => { input.value = e.target.value; });
        input.addEventListener('input', (e) => { slider.value = e.target.value; });
    }

    // Custom PVE popup sliders
    const customPveSlider = document.getElementById('custom-pve-elo-slider');
    const customPveInput = document.getElementById('custom-pve-elo-input');
    if (customPveSlider && customPveInput) {
        customPveSlider.addEventListener('input', (e) => { customPveInput.value = e.target.value; });
        customPveInput.addEventListener('input', (e) => { customPveSlider.value = e.target.value; });
    }

    // Custom PVE difficulty dropdown
    const customPveDifficultySelect = document.getElementById('custom-pve-difficulty-select-popup');
    if (customPveDifficultySelect) {
        customPveDifficultySelect.addEventListener('change', (e) => {
            document.getElementById('custom-pve-elo-wrapper').classList.toggle('hidden', e.target.value !== 'custom');
        });
    }

    // --- WebSocket connection ---
    console.log('[Script.js] DOM fully loaded and parsed.');
    console.log('[Script.js] Attempting to establish WebSocket connection...');
    
    try {
        const port = await window.electronAPI.getWsPort();
        if (!port) {
            throw new Error("Failed to get a valid port from the main process.");
        }
        const wsUrl = `ws://localhost:${port}`;
        console.log(`[Script.js] Connecting to WebSocket at: ${wsUrl}`);
        
        const ws = new WebSocket(wsUrl);

        ws.onopen = () => {
            console.log('[Script.js] WebSocket connection established.');
        };

        ws.onmessage = (event) => {
            const message = JSON.parse(event.data);
            console.log('[Script.js] Message from server:', message);

            if (message.type === 'engineMove') {
                console.log('[Script.js] Engine move received:', message.move);
                // Convert UCI move (e.g., "e2e4") to {from, to} format
                const uciMove = message.move;
                const fromCol = uciMove.charCodeAt(0) - 'a'.charCodeAt(0);
                const fromRow = 9 - (parseInt(uciMove.charAt(1), 10) - 0); // UCCI rank 0 is board row 9
                const toCol = uciMove.charCodeAt(2) - 'a'.charCodeAt(0);
                const toRow = 9 - (parseInt(uciMove.charAt(3), 10) - 0);   // UCCI rank 9 is board row 0

                const move = {
                    from: { r: fromRow, c: fromCol },
                    to: { r: toRow, c: toCol }
                };

                if (reviewMode) {
                    return;
                }

                if (gameEnded) {
                    return;
                }

                if (isSettingsOpen) {
                    queuedAiMove = move;
                    return;
                }

                isAiThinking = false;
                undoBtn.disabled = (moveHistory.length === 0);
                statusDisplay.textContent = `${currentPlayer === 'red' ? translations.status_red_turn : translations.status_black_turn}`;

                animateAndMovePiece(move.from, move.to);

            } else if (message.type === 'error') {
                console.error('[Script.js] Server error:', message.data);
                showNotification('server_error_ai');
                isAiThinking = false;
                statusDisplay.textContent = translations.server_error_ai;
            } else if (message.type === 'analyze_move_result') {
                const pending = pendingAnalysisRequests.get(message.requestId);
                if (pending) {
                    clearTimeout(pending.timer);
                    pendingAnalysisRequests.delete(message.requestId);
                    pending.resolve(message);
                }
            } else if (message.type === 'analysis_error') {
                const pending = pendingAnalysisRequests.get(message.requestId);
                if (pending) {
                    clearTimeout(pending.timer);
                    pendingAnalysisRequests.delete(message.requestId);
                    pending.reject(new Error(message.data || 'Unknown analysis error'));
                }
            }
        };

        ws.onclose = (event) => {
            console.log(`[Script.js] WebSocket disconnected. Code: ${event.code}, Reason: ${event.reason}`);
            pendingAnalysisRequests.forEach((pending) => {
                clearTimeout(pending.timer);
                pending.reject(new Error('WebSocket disconnected.'));
            });
            pendingAnalysisRequests.clear();
            // Optional: Implement a more robust reconnection strategy if needed
        };

        ws.onerror = (error) => {
            console.error('[Script.js] WebSocket error:', error);
        };

        // Make ws globally available for makeAiMove function
        window.ws = ws;

    } catch (error) {
        console.error("Failed to initialize WebSocket connection:", error);
        // Display an error to the user, as the AI functionality will be broken.
        statusDisplay.textContent = translations.websocket_connection_failed || "WebSocket connection failed. AI will not work.";
    }

    flipBoardBtn.addEventListener('click', () => {
        boardFlipped = !boardFlipped;
        renderBoard(board);
    });

    document.getElementById('exportPgnBtn').addEventListener('click', exportPgn);
    document.getElementById('exportTextBtn').addEventListener('click', exportTextNotation);

    document.getElementById('text-notation-btn').addEventListener('click', () => switchNotationTab('text'));
    document.getElementById('pgn-notation-btn').addEventListener('click', () => switchNotationTab('pgn'));

    const reviewStartBtn = document.getElementById('review-start-btn');
    const reviewExitBtn = document.getElementById('review-exit-btn');
    const reviewFirstBtn = document.getElementById('review-first-btn');
    const reviewPrevBtn = document.getElementById('review-prev-btn');
    const reviewPlayBtn = document.getElementById('review-play-btn');
    const reviewNextBtn = document.getElementById('review-next-btn');
    const reviewLastBtn = document.getElementById('review-last-btn');

    if (reviewStartBtn) reviewStartBtn.addEventListener('click', enterReviewMode);
    if (reviewExitBtn) reviewExitBtn.addEventListener('click', exitReviewMode);
    if (reviewFirstBtn) reviewFirstBtn.addEventListener('click', goToReviewFirst);
    if (reviewPrevBtn) reviewPrevBtn.addEventListener('click', goToReviewPrev);
    if (reviewPlayBtn) reviewPlayBtn.addEventListener('click', toggleReviewPlayback);
    if (reviewNextBtn) reviewNextBtn.addEventListener('click', goToReviewNext);
    if (reviewLastBtn) reviewLastBtn.addEventListener('click', goToReviewLast);

    // --- Settings Panel Logic ---
    const settingsOverlay = document.getElementById('settings-overlay');
    const bgmVolumeSlider = document.getElementById('bgm-volume-slider');
    const soundEffectsToggle = document.getElementById('sound-effects-toggle');
    const settingsCloseBtn = document.getElementById('settings-close-btn');
    const bgm = document.getElementById('bgm');

    // Load settings from localStorage
    const savedVolume = localStorage.getItem('bgmVolume');
    if (savedVolume !== null) {
        bgm.volume = savedVolume;
        bgmVolumeSlider.value = savedVolume;
    } else {
        bgm.volume = 0.5;
        bgmVolumeSlider.value = 0.5;
    }

    const savedSoundPreference = localStorage.getItem('userSoundPreference');
    if (savedSoundPreference !== null) {
        userSoundPreference = JSON.parse(savedSoundPreference);
        soundEffectsEnabled = userSoundPreference;
        soundEffectsToggle.checked = userSoundPreference;
    } else {
        userSoundPreference = true;
        soundEffectsEnabled = true;
        soundEffectsToggle.checked = true;
    }


    window.electronAPI.onOpenSettings(() => {
        isSettingsOpen = true;
        settingsOverlay.classList.remove('hidden');
    });

    settingsCloseBtn.addEventListener('click', () => {
        isSettingsOpen = false;
        settingsOverlay.classList.add('hidden');
        if (queuedAiMove) {
            isAiThinking = false;
            undoBtn.disabled = (moveHistory.length === 0);
            statusDisplay.textContent = `${currentPlayer === 'red' ? translations.status_red_turn : translations.status_black_turn}`;
            animateAndMovePiece(queuedAiMove.from, queuedAiMove.to);
            queuedAiMove = null;
        }
    });

    bgmVolumeSlider.addEventListener('input', (e) => {
        bgm.volume = e.target.value;
        localStorage.setItem('bgmVolume', e.target.value);
    });

    soundEffectsToggle.addEventListener('change', (e) => {
        soundEffectsEnabled = e.target.checked;
        userSoundPreference = e.target.checked;
        localStorage.setItem('userSoundPreference', e.target.checked);
    });

    showMainEntrySelection();
    setPuzzleNextButtonVisible(false);

    // AI Settings Interlock: UCI_LimitStrength vs Skill Level
    const limitStrengthCb = document.getElementById('ai-limit-strength');
    const eloSlider = document.getElementById('ai-elo-slider');
    const eloInput = document.getElementById('ai-elo-input');
    const skillSlider = document.getElementById('ai-skill-slider');
    const skillInput = document.getElementById('ai-skill-input');

    limitStrengthCb.addEventListener('change', (e) => {
        const isLimit = e.target.checked;
        eloSlider.disabled = !isLimit;
        eloInput.disabled = !isLimit;
        skillSlider.disabled = isLimit;
        skillInput.disabled = isLimit;
    });
});

function setupMode(mode) {
    playBgmIfNeeded();
    puzzleModeActive = false;
    currentPuzzle = null;
    currentPuzzleSolution = null;
    puzzleStepIndex = 0;
    setPuzzleNextButtonVisible(false);
    gameMode = mode;
    // Don't close the base screen immediately for PVE, just show modal
    if (mode === 'pvp') {
        const chessMenu = document.getElementById('chess-mode-selection');
        if (chessMenu) chessMenu.classList.add('hidden');
        startGame('pvp');
    } else { // PVE
        document.getElementById('ai-settings-overlay').classList.remove('hidden');
    }
}

function switchAiTab(tabId, evt) {
    document.querySelectorAll('#ai-settings-panel .tab-btn').forEach(btn => btn.classList.remove('active'));
    document.querySelectorAll('#ai-settings-panel .tab-content').forEach(content => content.classList.add('hidden'));

    if (evt && evt.currentTarget) {
        evt.currentTarget.classList.add('active');
    }
    document.getElementById('tab-' + tabId).classList.remove('hidden');
}

function startAiGame() {
    // Gather all settings
    window.aiSettings = {
        limitStrength: document.getElementById('ai-limit-strength').checked,
        elo: parseInt(document.getElementById('ai-elo-input').value, 10),
        skillLevel: parseInt(document.getElementById('ai-skill-input').value, 10),
        threads: parseInt(document.getElementById('ai-threads').value, 10),
        hash: parseInt(document.getElementById('ai-hash').value, 10),
        multipv: parseInt(document.getElementById('ai-multipv').value, 10),
        ponder: document.getElementById('ai-ponder').checked,
        moveTime: parseInt(document.getElementById('ai-movetime').value, 10),
        overhead: parseInt(document.getElementById('ai-overhead').value, 10),
        repetition: document.getElementById('ai-repetition').value,
        draw: document.getElementById('ai-draw').value,
        sixty: document.getElementById('ai-sixty').checked,
        ply: parseInt(document.getElementById('ai-ply').value, 10)
    };

    const selectedColor = document.getElementById('ai-player-color').value;
    
    document.getElementById('ai-settings-overlay').classList.add('hidden');
    const chessMenu = document.getElementById('chess-mode-selection');
    if (chessMenu) chessMenu.classList.add('hidden');
    
    // Check if we are starting from Custom Board Setup
    if (window.isStartingFromCustomSetup) {
        window.isStartingFromCustomSetup = false;
        const currentTurnColor = document.getElementById('start-player-select').value;
        const customSetup = { board: customBoardState.map(row => [...row]), player: currentTurnColor };
        startGame('pve', selectedColor, customSetup);
    } else {
        startGame('pve', selectedColor);
    }
}

function startGame(mode, pColor = 'red', customSetup = null) {
    gameMode = mode; playerColor = pColor; aiColor = (playerColor === 'red') ? 'black' : 'red';
    
    // Auto-flip board if playing as Black in PvE
    if (mode === 'pve' && playerColor === 'black') {
        boardFlipped = true;
    } else {
        boardFlipped = false;
    }

    startScreen.classList.add('hidden'); setupContainer.classList.add('hidden'); gameContainer.classList.remove('hidden');
    initGame(customSetup);
}
function initGame(customSetup = null) {
    if (customSetup) { boardState = customSetup.board; currentPlayer = customSetup.player; } else { boardState = initialBoard.map(row => [...row]); currentPlayer = 'red'; }
    reviewMode = false;
    reviewRunId += 1;
    reviewTimeline = [];
    reviewAnalysisMap = {};
    reviewIndex = 0;
    reviewIsAnalyzing = false;
    reviewAnalysisDone = false;
    reviewAnalyzedForMoveCount = 0;
    stopReviewPlayback();

    const reviewDom = getReviewDom();
    if (reviewDom.startBtn) reviewDom.startBtn.classList.remove('hidden');
    if (reviewDom.startBtn) reviewDom.startBtn.disabled = true;
    if (reviewDom.toolbar) reviewDom.toolbar.classList.add('hidden');
    if (reviewDom.exitBtn) reviewDom.exitBtn.classList.add('hidden');
    if (reviewDom.controls) reviewDom.controls.classList.add('hidden');
    if (reviewDom.insight) {
        reviewDom.insight.classList.add('hidden');
        reviewDom.insight.textContent = '';
    }
    if (reviewDom.progressWrap) reviewDom.progressWrap.classList.add('hidden');
    setReviewSummarySidebarVisible(false);
    setPuzzleNextButtonVisible(false);

    const summaryLoading = document.getElementById('review-summary-loading');
    const summaryContent = document.getElementById('review-summary-content');
    if (summaryLoading) summaryLoading.classList.remove('hidden');
    if (summaryContent) summaryContent.classList.add('hidden');
    if (resignBtn) resignBtn.disabled = false;

    selectedPiece = null; validMoves = []; gameEnded = false; isAiThinking = false; moveHistory = []; notationHistory = []; pgnMoves = []; undoBtn.disabled = true;
    statusDisplay.textContent = `${currentPlayer === 'red' ? translations.status_red_turn : translations.status_black_turn}`;
    renderBoard(board);
    updateNotationDisplay();
    checkForEndOfGame();
    if (!gameEnded && gameMode === 'pve' && currentPlayer === aiColor) {
        isAiThinking = true; undoBtn.disabled = true; statusDisplay.textContent = translations.ai_thinking; setTimeout(makeAiMove, 100);
    }
}
function getPieceInfo(piece) {
    if (piece === null || typeof piece !== 'string' || piece.length < 2) {
        return null; 
    }
    const colorChar = piece.charAt(0);
    const type = piece.charAt(1);
    const color = colorChar === 'r' ? 'red' : 'black';
    const name = translations.piece_names ? (translations.piece_names[piece] || type) : type;
    return { color, type, name };
}

function getValidMoves(currentBoard, r, c) {
    const piece = currentBoard[r][c];
    if (!piece) return [];
    const pieceInfo = getPieceInfo(piece);
    if (!pieceInfo) return [];

    const moves = [];
    const { color } = pieceInfo;

    function addMove(toR, toC) {
        if (toR < 0 || toR >= ROWS || toC < 0 || toC >= COLS) return;
        const targetPiece = currentBoard[toR][toC];
        if (targetPiece === null) {
            moves.push({ r: toR, c: toC });
        } else {
            const targetPieceInfo = getPieceInfo(targetPiece);
            if (targetPieceInfo && targetPieceInfo.color !== color) {
                moves.push({ r: toR, c: toC });
            }
        }
    }

    switch (pieceInfo.type) {
        case 'K': // King
            for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
                const newR = r + dr;
                const newC = c + dc;
                if (newC >= 3 && newC <= 5) {
                    if (color === 'red' && newR >= 7 && newR <= 9) addMove(newR, newC);
                    if (color === 'black' && newR >= 0 && newR <= 2) addMove(newR, newC);
                }
            }
            // Flying general rule
            let oppKingC = -1, oppKingR = -1;
            findOppKing: for (let i = 0; i < ROWS; i++) {
                for (let j = 0; j < COLS; j++) {
                    const p = currentBoard[i][j];
                    const pInfo = getPieceInfo(p);
                    if (p && pInfo && pInfo.type === 'K' && pInfo.color !== color) {
                        oppKingR = i;
                        oppKingC = j;
                        break findOppKing;
                    }
                }
            }
            if (c === oppKingC) {
                let hasPieceBetween = false;
                for (let i = Math.min(r, oppKingR) + 1; i < Math.max(r, oppKingR); i++) {
                    if (currentBoard[i][c] !== null) {
                        hasPieceBetween = true;
                        break;
                    }
                }
                if (!hasPieceBetween) addMove(oppKingR, oppKingC);
            }
            break;

        case 'A': // Advisor
            for (const [dr, dc] of [[-1, -1], [-1, 1], [1, -1], [1, 1]]) {
                const newR = r + dr;
                const newC = c + dc;
                if (newC >= 3 && newC <= 5) {
                    if (color === 'red' && newR >= 7 && newR <= 9) addMove(newR, newC);
                    if (color === 'black' && newR >= 0 && newR <= 2) addMove(newR, newC);
                }
            }
            break;

        case 'B': // Elephant / Bishop
            const elephantMoves = [[-2, -2], [-2, 2], [2, -2], [2, 2]];
            for (const [dr, dc] of elephantMoves) {
                const newR = r + dr;
                const newC = c + dc;
                if (newR < 0 || newR >= ROWS || newC < 0 || newC >= COLS) continue;
                const crossesRiver = (color === 'red' && newR < 5) || (color === 'black' && newR > 4);
                if (crossesRiver) continue;
                const blockR = r + dr / 2;
                const blockC = c + dc / 2;
                if (currentBoard[blockR] && currentBoard[blockR][blockC] !== null) {
                    continue;
                }
                addMove(newR, newC);
            }
            break;

        case 'N': // Horse / Knight
            const knightMoves = [[-2, -1], [-2, 1], [-1, -2], [-1, 2], [1, -2], [1, 2], [2, -1], [2, 1]];
            const blockPoints = [[-1, 0], [-1, 0], [0, -1], [0, 1], [0, -1], [0, 1], [1, 0], [1, 0]];
            for (let i = 0; i < knightMoves.length; i++) {
                const [dr, dc] = knightMoves[i];
                const [bdr, bdc] = blockPoints[i];
                const blockR = r + bdr;
                const blockC = c + bdc;
                if (currentBoard[blockR] && currentBoard[blockR][blockC] !== null) {
                    continue;
                }
                addMove(r + dr, c + dc);
            }
            break;

        case 'R': // Rook
            for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
                let newR = r + dr;
                let newC = c + dc;
                while (newR >= 0 && newR < ROWS && newC >= 0 && newC < COLS) {
                    if (currentBoard[newR][newC] === null) {
                        addMove(newR, newC);
                    } else {
                        addMove(newR, newC);
                        break;
                    }
                    newR += dr;
                    newC += dc;
                }
            }
            break;

        case 'C': // Cannon
            for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
                let newR = r + dr;
                let newC = c + dc;
                let foundPiece = false;
                while (newR >= 0 && newR < ROWS && newC >= 0 && newC < COLS) {
                    if (currentBoard[newR][newC] === null) {
                        if (!foundPiece) addMove(newR, newC);
                    } else {
                        if (!foundPiece) {
                            foundPiece = true;
                        } else {
                            addMove(newR, newC);
                            break;
                        }
                    }
                    newR += dr;
                    newC += dc;
                }
            }
            break;

        case 'P': // Pawn
            const forward = (color === 'red') ? -1 : 1;
            addMove(r + forward, c);
            if ((color === 'red' && r < 5) || (color === 'black' && r > 4)) { // Crossed the river
                addMove(r, c - 1);
                addMove(r, c + 1);
            }
            break;
    }
    return moves;
}
function isKingInCheck(currentBoard, kingColor) { 
    const kingPos = { r: -1, c: -1 }; 
    const opponentColor = (kingColor === 'red') ? 'black' : 'red'; 
    findKing: for(let r=0; r<ROWS; r++) {
        for(let c=0; c<COLS; c++) { 
            const p = currentBoard[r][c];
            const pInfo = getPieceInfo(p);
            if (p && pInfo && pInfo.type === 'K' && pInfo.color === kingColor) { 
                kingPos.r = r; 
                kingPos.c = c; 
                break findKing; 
            }
        }
    }
    if (kingPos.r === -1) return true; // King not found, technically a win/loss state
    for(let r=0; r<ROWS; r++) {
        for(let c=0; c<COLS; c++) { 
            const p = currentBoard[r][c];
            const pInfo = getPieceInfo(p);
            if (p && pInfo && pInfo.color === opponentColor) { 
                const moves = getValidMoves(currentBoard, r, c); 
                if (moves.some(move => move.r === kingPos.r && move.c === kingPos.c)) return true; 
            }
        }
    }
    return false; 
}
function filterValidMoves(currentBoard, allMoves, color) { 
    return allMoves.filter(move => {
        const tempBoard = currentBoard.map(row => [...row]);
        tempBoard[move.to.r][move.to.c] = tempBoard[move.from.r][move.from.c];
        tempBoard[move.from.r][move.from.c] = null;
        return !isKingInCheck(tempBoard, color);
    });
}
function hasAnyValidMoves(currentBoard, color) { 
    for (let r = 0; r < ROWS; r++) { 
        for (let c = 0; c < COLS; c++) { 
            const piece = currentBoard[r][c];
            const pieceInfo = getPieceInfo(piece);
            if (piece && pieceInfo && pieceInfo.color === color) { 
                const moves = getValidMoves(currentBoard, r, c).map(m => ({from: {r,c}, to: m})); 
                if (filterValidMoves(currentBoard, moves, color).length > 0) return true; 
            }
        }
    }
    return false; 
}

function isRepetitiveCheckViolation(move, board, player) {
    const REPETITION_LIMIT = 5;
    const pieceCode = board[move.from.r][move.from.c];
    if (!pieceCode) return false;

    const tempBoard = board.map(r => [...r]);
    tempBoard[move.to.r][move.to.c] = pieceCode;
    tempBoard[move.from.r][move.from.c] = null;
    if (!isKingInCheck(tempBoard, (player === 'red' ? 'black' : 'red'))) {
        return false;
    }

    let consecutiveCount = 1;
    if (moveHistory.length < 2) return false;

    // Let's track the position of the piece making the checks.
    // It starts at the 'from' position of the current move.
    let lastPiecePos = move.from;

    for (let i = moveHistory.length - 2; i >= 0; i -= 2) {
        const historyEntry = moveHistory[i];
        if (historyEntry.player !== player || !historyEntry.isCheck) {
            break;
        }

        const historicPieceCode = historyEntry.board[historyEntry.move.from.r][historyEntry.move.from.c];
        
        // The piece that made the historic check ended at historyEntry.move.to
        // The piece that made the *next* check (the one closer to the present) started at lastPiecePos
        // So, we check if these positions match.
        if (historicPieceCode === pieceCode && 
            lastPiecePos.r === historyEntry.move.to.r && 
            lastPiecePos.c === historyEntry.move.to.c) {
            consecutiveCount++;
            // For the next iteration, the piece we are tracking started at the 'from' of this historic move.
            lastPiecePos = historyEntry.move.from;
        } else {
            break;
        }
    }
    return consecutiveCount >= REPETITION_LIMIT;
}

function checkForEndOfGame() {
    if (gameEnded) return;
    if (!hasAnyValidMoves(boardState, currentPlayer)) {
        gameEnded = true;
        const inCheck = isKingInCheck(boardState, currentPlayer);
        const endKey = inCheck ? 'checkmate' : 'stalemate';
        endgameTitle.setAttribute('data-i18n', endKey);
        endgameTitle.textContent = translations[endKey] || endKey;
        checkmateOverlay.classList.remove('hidden');
        const winnerColor = currentPlayer === 'red' ? 'black' : 'red';
        const winner = winnerColor === 'red' ? translations.red_wins : translations.black_wins;
        winnerMessage.textContent = winner;
        if (resignBtn) resignBtn.disabled = true;

        if (puzzleModeActive && winnerColor === playerColor) {
            setPuzzleNextButtonVisible(true);
        } else {
            setPuzzleNextButtonVisible(false);
        }

        const reviewDom = getReviewDom();
        if (reviewDom.startBtn) {
            reviewDom.startBtn.disabled = moveHistory.length === 0;
        }
    }
}

// --- UI, Animation, and Undo ---
function showNotification(key, options = {}) {
    let message = translations[key] || key;
    for (const placeholder in options) {
        message = message.replace(`{${placeholder}}`, options[placeholder]);
    }
    const notification = document.getElementById('notification');
    if (!notification) return;
    notification.textContent = message;
    notification.classList.add('show');

    if (notification.timer) {
        clearTimeout(notification.timer);
    }

    notification.timer = setTimeout(() => {
        notification.classList.remove('show');
    }, 3000);
}

function clearDragPreviewIndicators() {
    if (!board) return;
    board.querySelectorAll('.drag-preview-indicator').forEach((el) => el.remove());
}

function showDragPreviewIndicators() {
    if (!board) return;
    board.querySelectorAll('.valid-move-indicator').forEach((el) => el.remove());

    validMoves.forEach((move) => {
        const visualToR = boardFlipped ? ROWS - 1 - move.to.r : move.to.r;
        const visualToC = boardFlipped ? COLS - 1 - move.to.c : move.to.c;
        const squareIndex = visualToR * COLS + visualToC;
        const square = board.children[squareIndex];
        if (!square) return;

        const moveIndicator = document.createElement('div');
        moveIndicator.classList.add('valid-move-indicator', 'drag-preview-indicator');
        if (boardState[move.to.r][move.to.c]) {
            moveIndicator.style.backgroundColor = 'rgba(255, 0, 0, 0.4)';
        }
        square.appendChild(moveIndicator);
    });
}

function canPlayerMoveNow() {
    if (reviewMode) return false;
    if (gameEnded) return false;
    if (isAiThinking) return false;
    if (gameMode === 'pve' && currentPlayer === aiColor) return false;
    return true;
}

function onPieceDragStart(event, r, c) {
    if (!canPlayerMoveNow()) {
        event.preventDefault();
        return;
    }

    const pieceCode = boardState[r][c];
    const pieceInfo = getPieceInfo(pieceCode);
    if (!pieceInfo || pieceInfo.color !== currentPlayer) {
        event.preventDefault();
        return;
    }

    const allMoves = getValidMoves(boardState, r, c).map(m => ({ from: { r, c }, to: m }));
    const legalMoves = filterValidMoves(boardState, allMoves, currentPlayer);
    if (legalMoves.length === 0) {
        event.preventDefault();
        return;
    }

    dragMoveSource = { r, c };
    dragDropHandled = false;
    selectedPiece = { r, c };
    validMoves = legalMoves;

    if (event.dataTransfer) {
        event.dataTransfer.effectAllowed = 'move';
        event.dataTransfer.setData('text/plain', `${r},${c}`);
    }

    showDragPreviewIndicators();
}

function onPieceDragEnd() {
    clearDragPreviewIndicators();

    if (!dragDropHandled) {
        selectedPiece = null;
        validMoves = [];
        renderBoard(board);
    }

    dragMoveSource = null;
    dragDropHandled = false;
}

function onSquareDragOver(event) {
    if (!dragMoveSource) return;
    event.preventDefault();
    if (event.dataTransfer) {
        event.dataTransfer.dropEffect = 'move';
    }
}

function onSquareDrop(event, disp_r, disp_c) {
    if (!dragMoveSource) return;

    event.preventDefault();
    dragDropHandled = true;
    clearDragPreviewIndicators();

    dragMoveSource = null;
    onSquareClick(disp_r, disp_c);
}

function renderBoard(boardElement, boardData = boardState, interactionHandler = onSquareClick) {
    let highlightedMove = null;
    if (boardElement === board) {
        if (reviewMode) {
            if (reviewIndex > 0 && reviewIndex <= moveHistory.length) {
                highlightedMove = moveHistory[reviewIndex - 1].move;
            }
        } else if (moveHistory.length > 0) {
            highlightedMove = moveHistory[moveHistory.length - 1].move;
        }
    }

    boardElement.innerHTML = '';
    for (let disp_r = 0; disp_r < ROWS; disp_r++) {
        for (let disp_c = 0; disp_c < COLS; disp_c++) {
            const r = boardFlipped ? ROWS - 1 - disp_r : disp_r;
            const c = boardFlipped ? COLS - 1 - disp_c : disp_c;

            const square = document.createElement('div');
            square.classList.add('square');

            if (highlightedMove && (
                (highlightedMove.from.r === r && highlightedMove.from.c === c) ||
                (highlightedMove.to.r === r && highlightedMove.to.c === c)
            )) {
                square.classList.add('last-move-highlight');
            }

            square.dataset.r = disp_r; 
            square.dataset.c = disp_c;
            square.addEventListener('click', () => interactionHandler(disp_r, disp_c));
            if (boardElement === board) {
                square.addEventListener('dragover', onSquareDragOver);
                square.addEventListener('drop', (event) => onSquareDrop(event, disp_r, disp_c));
            }
            
            const pieceCode = boardData[r][c];
            if (pieceCode) {
                const pieceInfo = getPieceInfo(pieceCode);
                const pieceElement = document.createElement('div');
                pieceElement.classList.add('piece');
                if (boardElement === board) {
                    pieceElement.draggable = true;
                    pieceElement.addEventListener('dragstart', (event) => onPieceDragStart(event, r, c));
                    pieceElement.addEventListener('dragend', onPieceDragEnd);
                }
                if (boardFlipped) {
                    pieceElement.classList.add('flipped');
                }
                const img = document.createElement('img');
                img.draggable = false;
                const imgName = pieceCode.charAt(0) + '_' + pieceCode.charAt(1).toLowerCase() + '.png';
                img.src = 'images/' + imgName;
                img.alt = pieceInfo.name;
                pieceElement.appendChild(img);
                square.appendChild(pieceElement);

                if (boardElement === board && isKingInCheck(boardData, pieceInfo.color) && pieceInfo.type === 'K') {
                    pieceElement.classList.add('in-check');
                }
                if (boardElement === setupBoard && pieceToMove && r === pieceToMove.r && c === pieceToMove.c) {
                    pieceElement.classList.add('selected');
                }
            }

            if (boardElement === board && validMoves.some(move => {
                const visualToR = boardFlipped ? ROWS - 1 - move.to.r : move.to.r;
                const visualToC = boardFlipped ? COLS - 1 - move.to.c : move.to.c;
                return visualToR === disp_r && visualToC === disp_c;
            })) {
                const moveIndicator = document.createElement('div');
                moveIndicator.classList.add('valid-move-indicator');
                if (boardData[r][c]) moveIndicator.style.backgroundColor = "rgba(255, 0, 0, 0.4)";
                square.appendChild(moveIndicator);
            }
            boardElement.appendChild(square);
        }
    }

    if (boardElement === board && selectedPiece) {
        const visualSelectedR = boardFlipped ? ROWS - 1 - selectedPiece.r : selectedPiece.r;
        const visualSelectedC = boardFlipped ? COLS - 1 - selectedPiece.c : selectedPiece.c;
        const squareIndex = visualSelectedR * COLS + visualSelectedC;
        boardElement.children[squareIndex]?.querySelector('.piece')?.classList.add('selected');
    }
}


function onSquareClick(disp_r, disp_c) {
    if (reviewMode) return;
    if (gameEnded || isAiThinking || (gameMode === 'pve' && currentPlayer === aiColor)) return;

    const r = boardFlipped ? ROWS - 1 - disp_r : disp_r;
    const c = boardFlipped ? COLS - 1 - disp_c : disp_c;

    const clickedPieceInfo = getPieceInfo(boardState[r][c]);

    if (selectedPiece) {
        const isSamePiece = selectedPiece.r === r && selectedPiece.c === c;
        const isValidMove = validMoves.find(m => m.to.r === r && m.to.c === c);

        if (isValidMove) {
            if (isRepetitiveCheckViolation(isValidMove, boardState, currentPlayer)) {
                showNotification("repetitive_check_violation");
                return;
            }
            if (!validatePuzzlePlayerMove(isValidMove)) {
                return;
            }
            animateAndMovePiece(isValidMove.from, isValidMove.to);
            return; 
        }

        if (isSamePiece) {
            selectedPiece = null;
            validMoves = [];
            renderBoard(board);
            return;
        }

        if (clickedPieceInfo && clickedPieceInfo.color === currentPlayer) {
            selectPiece(r, c);
            return;
        }

        selectedPiece = null;
        validMoves = [];
        renderBoard(board);

    } else { 
        if (clickedPieceInfo && clickedPieceInfo.color === currentPlayer) {
            selectPiece(r, c);
        }
    }
}

function selectPiece(r, c) { 
    selectedPiece = { r, c }; 
    const allMoves = getValidMoves(boardState, r, c).map(m => ({ from: {r,c}, to: m })); 
    validMoves = filterValidMoves(boardState, allMoves, currentPlayer); 
    renderBoard(board); 
}

function animateAndMovePiece(from, to) {
    const boardBeforeMove = JSON.parse(JSON.stringify(boardState));
    const playerBeforeMove = currentPlayer;
    const isCaptureMove = Boolean(boardState[to.r][to.c]);
    const isCheckAfterMove = (() => {
        const tempBoard = boardState.map(row => [...row]);
        tempBoard[to.r][to.c] = tempBoard[from.r][from.c];
        tempBoard[from.r][from.c] = null;
        return isKingInCheck(tempBoard, (currentPlayer === 'red') ? 'black' : 'red');
    })();
    const notation = moveToNotation({ from, to }, boardState);
    const pgnMove = moveToPgn({ from, to });
    moveHistory.push({
        board: boardBeforeMove,
        player: playerBeforeMove,
        move: { from, to },
        isCheck: isCheckAfterMove,
        notation: notation
    });
    notationHistory.push(notation);
    pgnMoves.push(pgnMove);
    updateNotationDisplay();
    undoBtn.disabled = isAiThinking;

    const visualFromR = boardFlipped ? ROWS - 1 - from.r : from.r;
    const visualFromC = boardFlipped ? COLS - 1 - from.c : from.c;
    const visualToR = boardFlipped ? ROWS - 1 - to.r : to.r;
    const visualToC = boardFlipped ? COLS - 1 - to.c : to.c;

    const fromSquare = board.children[visualFromR * COLS + visualFromC];
    const toSquare = board.children[visualToR * COLS + visualToC];
    const pieceElement = fromSquare.querySelector('.piece');

    if (!pieceElement) return;

    const fromRect = fromSquare.getBoundingClientRect(); 
    const toRect = toSquare.getBoundingClientRect();
    
    const movingPiece = pieceElement.cloneNode(true); 
    movingPiece.classList.add('moving-piece'); 
    document.body.appendChild(movingPiece);
    movingPiece.style.left = `${fromRect.left}px`; 
    movingPiece.style.top = `${fromRect.top}px`;
    
    pieceElement.classList.add('is-moving');
    selectedPiece = null; 
    validMoves = []; 
    renderBoard(board); 

    if (isCaptureMove) {
        const effect = document.createElement('div'); 
        effect.classList.add('capture-effect-standalone'); 
        document.body.appendChild(effect); 
        effect.style.left = `${toRect.left + toRect.width / 2}px`; 
        effect.style.top = `${toRect.top + toRect.height / 2}px`; 
        setTimeout(() => effect.remove(), 400); 
    }

    requestAnimationFrame(() => { 
        movingPiece.style.transform = `translate(${toRect.left - fromRect.left}px, ${toRect.top - fromRect.top}px)`; 
    });

    movingPiece.addEventListener('transitionend', () => {
        movingPiece.remove();
        boardState[to.r][to.c] = boardState[from.r][from.c]; 
        boardState[from.r][from.c] = null;
        currentPlayer = (currentPlayer === 'red') ? 'black' : 'red';
        statusDisplay.textContent = `${currentPlayer === 'red' ? translations.status_red_turn : translations.status_black_turn}`;

        // Sound priority: check > capture > normal move.
        if (isCheckAfterMove) {
            playSound('check');
        } else if (isCaptureMove) {
            playSound('capture');
        } else {
            playSound('self');
        }

        renderBoard(board); 
        checkForEndOfGame();
        if (!gameEnded && gameMode === 'pve' && currentPlayer === aiColor) {
            isAiThinking = true; 
            undoBtn.disabled = true; 
            statusDisplay.textContent = translations.ai_thinking; 
            setTimeout(makeAiMove, 100);
        }
    }, { once: true });
}

function undoMove() {
    if (reviewMode) return;
    if (isAiThinking || moveHistory.length === 0) return;

    // In PvE, if it's the player's turn, it means the AI just moved. Undo both moves.
    const statesToPop = (gameMode === 'pve' && currentPlayer === playerColor) ? 2 : 1;

    if (moveHistory.length < statesToPop) {
        return; // Not enough history to undo
    }

    let lastStateRecord = null;
    for (let i = 0; i < statesToPop; i++) {
        lastStateRecord = moveHistory.pop();
        if (notationHistory.length > 0) {
            notationHistory.pop();
        }
        if (pgnMoves.length > 0) {
            pgnMoves.pop();
        }
    }

    // Restore the state from BEFORE the move that was just popped.
    boardState = JSON.parse(JSON.stringify(lastStateRecord.board));
    currentPlayer = lastStateRecord.player;
    
    gameEnded = false;
    isAiThinking = false; // Stop any AI thinking process
    checkmateOverlay.classList.add('hidden');
    selectedPiece = null;
    validMoves = [];
    statusDisplay.textContent = `${currentPlayer === 'red' ? translations.status_red_turn : translations.status_black_turn}`;
    renderBoard(board);
    updateNotationDisplay();
    
    undoBtn.disabled = moveHistory.length === 0;
}

function hideCheckmateOverlay() {
    document.getElementById('checkmate-overlay').classList.add('hidden');
    setPuzzleNextButtonVisible(false);
    undoBtn.disabled = true; // Disable undo button when viewing the final board
}

function resignGame() {
    if (reviewMode || gameEnded) return;

    const confirmMessage = translations.confirm_resign || '確定要投降嗎？';
    if (!window.confirm(confirmMessage)) {
        return;
    }

    gameEnded = true;
    isAiThinking = false;
    queuedAiMove = null;
    selectedPiece = null;
    validMoves = [];

    endgameTitle.setAttribute('data-i18n', 'resignation');
    endgameTitle.textContent = translations.resignation || '投降';

    const winner = currentPlayer === 'red' ? translations.black_wins : translations.red_wins;
    winnerMessage.textContent = winner;

    const reviewDom = getReviewDom();
    if (reviewDom.startBtn) {
        reviewDom.startBtn.disabled = moveHistory.length === 0;
    }

    if (resignBtn) resignBtn.disabled = true;
    setPuzzleNextButtonVisible(false);
    undoBtn.disabled = true;
    renderBoard(board);
    checkmateOverlay.classList.remove('hidden');
}

// --- Custom Setup Logic ---
function showSetupScreen() { 
    playBgmIfNeeded();
    puzzleModeActive = false;
    currentPuzzle = null;
    currentPuzzleSolution = null;
    puzzleStepIndex = 0;
    setPuzzleNextButtonVisible(false);
    startScreen.classList.add('hidden'); setupContainer.classList.remove('hidden'); clearSetupBoard(); populatePalette(); 
}
function populatePalette() { piecePalette.innerHTML = ''; const pieces = ['rK','rA','rB','rN','rR','rC','rP', 'bK','bA','bB','bN','bR','bC','bP']; pieces.forEach(code => { const pieceInfo = getPieceInfo(code); const pieceElement = document.createElement('div'); pieceElement.classList.add('piece'); const img = document.createElement('img'); img.draggable = false; const imgName = code.charAt(0) + '_' + code.charAt(1).toLowerCase() + '.png'; img.src = 'images/' + imgName; img.alt = pieceInfo.name; pieceElement.appendChild(img); pieceElement.dataset.pieceCode = code; pieceElement.addEventListener('click', () => selectPieceForPlacement(code, pieceElement)); piecePalette.appendChild(pieceElement); }); }
function selectPieceForPlacement(code, element) {
    pieceToMove = null;
    document.querySelectorAll('#piece-palette .piece').forEach(p => p.classList.remove('selected-for-placement'));
    document.getElementById('delete-piece-btn').classList.remove('active-tool');
    if (element) { element.classList.add(code === 'delete' ? 'active-tool' : 'selected-for-placement'); }
    pieceToPlace = code;
    renderBoard(setupBoard, customBoardState, onSetupSquareClick);
}
function clearSetupBoard() { customBoardState = Array(10).fill(null).map(() => Array(9).fill(null)); pieceCounts = {}; pieceToMove = null; renderBoard(setupBoard, customBoardState, onSetupSquareClick); selectPieceForPlacement(null, null); }
function onSetupSquareClick(r, c) {
    const currentPieceOnSquare = customBoardState[r][c];
    if (pieceToMove) {
        const { r: fromR, c: fromC, code } = pieceToMove;
        if (fromR === r && fromC === c) {
            pieceToMove = null;
        } else {
            customBoardState[fromR][fromC] = null;
            const targetPiece = customBoardState[r][c];
            if (targetPiece) {
                const info = getPieceInfo(targetPiece);
                pieceCounts[info.type + info.color]--;
            }
            if (isValidPlacement(code, r, c, true)) {
                customBoardState[r][c] = code;
            } else {
                customBoardState[fromR][fromC] = code; 
                if (targetPiece) {
                    const info = getPieceInfo(targetPiece);
                    pieceCounts[info.type + info.color]++;
                }
                showNotification("invalid_placement");
            }
            pieceToMove = null;
        }
    } 
    else if (pieceToPlace) {
        if (pieceToPlace === 'delete') {
            if (currentPieceOnSquare) {
                const info = getPieceInfo(currentPieceOnSquare);
                pieceCounts[info.type + info.color]--;
                customBoardState[r][c] = null;
            }
        } else {
            if (currentPieceOnSquare) {
                const info = getPieceInfo(currentPieceOnSquare);
                pieceCounts[info.type + info.color]--;
            }
            if (isValidPlacement(pieceToPlace, r, c)) {
                customBoardState[r][c] = pieceToPlace;
                const info = getPieceInfo(pieceToPlace);
                const key = info.type + info.color;
                pieceCounts[key] = (pieceCounts[key] || 0) + 1;
            } else {
               if (currentPieceOnSquare) {
                   const info = getPieceInfo(currentPieceOnSquare);
                   pieceCounts[info.type + info.color]++;
                }
                showNotification("invalid_placement_or_limit");
            }
        }
        pieceToPlace = null;
        document.querySelectorAll('#piece-palette .piece, #delete-piece-btn').forEach(p => {
            p.classList.remove('selected-for-placement');
            p.classList.remove('active-tool');
        });
    } 
    else if (currentPieceOnSquare) {
        pieceToMove = { r: r, c: c, code: currentPieceOnSquare };
    }
    renderBoard(setupBoard, customBoardState, onSetupSquareClick);
}
function isValidPlacement(code, r, c, isMove = false) {
    const info = getPieceInfo(code); 
    if (!info) return false;
    const key = info.type + info.color;
    const limits = { K: 1, A: 2, B: 2, N: 2, R: 2, C: 2, P: 5 };
    if (!isMove && (pieceCounts[key] || 0) >= limits[info.type]) return false;
    switch(info.type) {
        case 'K':
            if (c < 3 || c > 5) return false;
            if (info.color === 'red' && r < 7) return false;
            if (info.color === 'black' && r > 2) return false;
            break;
        case 'A':
            if (info.color === 'red') {
                const validPos = [[7,3],[7,5],[8,4],[9,3],[9,5]];
                if (!validPos.some(p => p[0] === r && p[1] === c)) return false;
            } else { // black
                const validPos = [[0,3],[0,5],[1,4],[2,3],[2,5]];
                if (!validPos.some(p => p[0] === r && p[1] === c)) return false;
            }
            break;
        case 'B':
            if (info.color === 'red') {
                const validPos = [[5,2],[5,6],[7,0],[7,4],[7,8],[9,2],[9,6]];
                if (!validPos.some(p => p[0] === r && p[1] === c)) return false;
            } else {
                const validPos = [[0,2],[0,6],[2,0],[2,4],[2,8],[4,2],[4,6]];
                if (!validPos.some(p => p[0] === r && p[1] === c)) return false;
            }
            break;
        case 'P':
            if (info.color === 'red') {
                if (r > 4 && r !== 6 && r !== 5) return false; 
                if ((r === 6 || r === 5) && c % 2 !== 0) return false;
            } else {
                if (r < 5 && r !== 3 && r !== 4) return false; 
                if ((r === 3 || r === 4) && c % 2 !== 0) return false;
            }
            break;
    }
    return true;
}
function promptCustomPve() {
    const redKingCount = customBoardState.flat().filter(p => p === 'rK').length;
    const blackKingCount = customBoardState.flat().filter(p => p === 'bK').length;
    if (redKingCount !== 1 || blackKingCount !== 1) {
        showNotification("must_have_one_king");
        return;
    }
    if (isKingInCheck(customBoardState, 'red')) {
        showNotification("red_king_in_check");
        return;
    }
    if (isKingInCheck(customBoardState, 'black')) {
        showNotification("black_king_in_check");
        return;
    }
    window.isStartingFromCustomSetup = true;
    document.getElementById('ai-settings-overlay').classList.remove('hidden');
}

// NOTE: confirmCustomPveStart removed since we share the main startAiGame now

function startCustomGame(mode) {
    if (mode === 'pve') {
        promptCustomPve();
        return;
    }
    const redKingCount = customBoardState.flat().filter(p => p === 'rK').length;
    const blackKingCount = customBoardState.flat().filter(p => p === 'bK').length;
    if (redKingCount !== 1 || blackKingCount !== 1) { showNotification("must_have_one_king"); return; }

    if (isKingInCheck(customBoardState, 'red')) {
        showNotification("red_king_in_check");
        return;
    }
    if (isKingInCheck(customBoardState, 'black')) {
        showNotification("black_king_in_check");
        return;
    }
    const startPlayer = startPlayerSelect.value;
    const customSetup = { board: customBoardState.map(row => [...row]), player: startPlayer };
    startGame('pvp', 'red', customSetup);
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

async function loadPuzzleLibrary() {
    if (Array.isArray(puzzleLibrary) && puzzleLibrary.length > 0) {
        return puzzleLibrary;
    }

    const candidates = ['適情雅趣.fen', 'shiqingyaqu551.fen'];
    let content = null;

    for (const filePath of candidates) {
        try {
            const response = await fetch(filePath);
            if (response.ok) {
                content = await response.text();
                break;
            }
        } catch (err) {
            console.warn(`Failed to load puzzle library ${filePath}:`, err);
        }
    }

    if (!content) {
        throw new Error('無法載入題庫檔案。');
    }

    const parsed = parsePuzzleLibrary(content);
    if (!parsed.length) {
        throw new Error('題庫檔案內容為空。');
    }

    puzzleLibrary = parsed;
    return puzzleLibrary;
}

function pickRandomPuzzle(entries) {
    if (!entries || entries.length === 0) {
        return null;
    }

    if (entries.length === 1) {
        return entries[0];
    }

    let candidate = entries[Math.floor(Math.random() * entries.length)];
    if (currentPuzzle && candidate.index === currentPuzzle.index) {
        const alternatives = entries.filter(entry => entry.index !== currentPuzzle.index);
        candidate = alternatives[Math.floor(Math.random() * alternatives.length)];
    }

    return candidate;
}

async function startRandomPuzzle() {
    playBgmIfNeeded();

    const triggerBtn = document.getElementById('entry-puzzle-btn') || document.getElementById('puzzle-next-btn');
    if (triggerBtn) triggerBtn.disabled = true;

    try {
        const [entries, solutionBook] = await Promise.all([
            loadPuzzleLibrary(),
            loadPuzzleSolutionBook()
        ]);

        const solvableEntries = entries.filter((entry) => {
            const solution = solutionBook[entry.index];
            return solution && solution.unique !== false && Array.isArray(solution.moves) && solution.moves.length > 0;
        });

        const chosen = pickRandomPuzzle(solvableEntries);
        if (!chosen) {
            throw new Error('題庫中沒有可用且有解答的題目。');
        }

        const setup = fenToBoardSetup(chosen.fen);
        currentPuzzle = chosen;
        currentPuzzleSolution = solutionBook[chosen.index] || null;
        puzzleStepIndex = 0;
        puzzleModeActive = true;
        setPuzzleNextButtonVisible(false);

        startGame('pve', setup.player, setup);
        showNotification('puzzle_loaded', { title: chosen.event });
        statusDisplay.textContent = `${translations.puzzle_mode || '謎題模式'}：${chosen.event}`;
    } catch (err) {
        console.error('Failed to start puzzle:', err);
        showNotification('puzzle_load_failed', { reason: err.message || 'Unknown error' });
    } finally {
        if (triggerBtn) triggerBtn.disabled = false;
    }
}

function startNextPuzzle() {
    checkmateOverlay.classList.add('hidden');
    startRandomPuzzle();
}

function getReviewDom() {
    return {
        toolbar: document.getElementById('review-toolbar'),
        startBtn: document.getElementById('review-start-btn'),
        exitBtn: document.getElementById('review-exit-btn'),
        controls: document.getElementById('review-controls'),
        firstBtn: document.getElementById('review-first-btn'),
        prevBtn: document.getElementById('review-prev-btn'),
        playBtn: document.getElementById('review-play-btn'),
        nextBtn: document.getElementById('review-next-btn'),
        lastBtn: document.getElementById('review-last-btn'),
        progressWrap: document.getElementById('review-progress-wrap'),
        progressBar: document.getElementById('review-progress-bar'),
        progressText: document.getElementById('review-progress-text'),
        insight: document.getElementById('review-insight')
    };
}

function isReviewSummarySidebarVisible() {
    const summaryOverlay = document.getElementById('review-summary-overlay');
    return Boolean(summaryOverlay && !summaryOverlay.classList.contains('hidden'));
}

function setReviewSummarySidebarVisible(visible) {
    const summaryOverlay = document.getElementById('review-summary-overlay');
    const notationTabs = document.querySelector('#notation-panel .notation-tabs');
    const notationContent = document.getElementById('notation-content');
    const notationExportButtons = document.getElementById('notation-export-buttons');

    if (summaryOverlay) {
        summaryOverlay.classList.toggle('hidden', !visible);
    }
    if (notationTabs) {
        notationTabs.classList.toggle('hidden', visible);
    }
    if (notationContent) {
        notationContent.classList.toggle('hidden', visible);
    }
    if (notationExportButtons) {
        notationExportButtons.classList.toggle('hidden', visible);
    }
}

function cloneBoard(sourceBoard) {
    return sourceBoard.map(row => [...row]);
}

function stopReviewPlayback() {
    if (reviewPlayTimer) {
        clearInterval(reviewPlayTimer);
        reviewPlayTimer = null;
    }
    const dom = getReviewDom();
    if (dom.playBtn) {
        dom.playBtn.textContent = '▶';
    }
}

function setReviewProgress(done, total) {
    const dom = getReviewDom();
    const summaryVisible = isReviewSummarySidebarVisible();
    
    // Update summary modal progress if it exists
    const summaryProgress = document.getElementById('review-summary-progress');
    if (summaryProgress) {
        summaryProgress.textContent = `${done} / ${total}`;
    }

    if (!dom.progressWrap || !dom.progressBar || !dom.progressText) return;

    if (!reviewMode && !reviewIsAnalyzing && !(reviewAnalysisDone && total > 0)) {
        dom.progressWrap.classList.add('hidden');
        dom.progressBar.style.width = '0%';
        dom.progressText.textContent = '0 / 0';
        return;
    }

    if (reviewMode && !summaryVisible) {
        dom.progressWrap.classList.remove('hidden');
    } else {
        dom.progressWrap.classList.add('hidden');
    }
    const safeTotal = Math.max(1, total);
    const ratio = Math.max(0, Math.min(100, Math.round((done / safeTotal) * 100)));
    dom.progressBar.style.width = `${ratio}%`;
    if (reviewIsAnalyzing) {
        dom.progressText.textContent = `分析中 ${done} / ${total}`;
    } else {
        dom.progressText.textContent = `完成 ${done} / ${total}`;
    }
}

function buildReviewTimeline() {
    const timeline = [];

    if (moveHistory.length > 0) {
        timeline.push({
            ply: 0,
            board: cloneBoard(moveHistory[0].board),
            playerToMove: moveHistory[0].player
        });
    } else {
        timeline.push({
            ply: 0,
            board: cloneBoard(boardState),
            playerToMove: currentPlayer
        });
    }

    moveHistory.forEach((entry, idx) => {
        const nextBoard = cloneBoard(entry.board);
        nextBoard[entry.move.to.r][entry.move.to.c] = nextBoard[entry.move.from.r][entry.move.from.c];
        nextBoard[entry.move.from.r][entry.move.from.c] = null;

        timeline.push({
            ply: idx + 1,
            board: nextBoard,
            playerToMove: entry.player === 'red' ? 'black' : 'red',
            move: entry.move,
            notation: entry.notation,
            movePlayer: entry.player
        });
    });

    return timeline;
}

function getReviewAnalysisSettings() {
    const defaults = {
        limitStrength: false,
        elo: 1280,
        skillLevel: 20,
        threads: 1,
        hash: 32,
        multipv: 2,
        ponder: false,
        moveTime: 3000,
        overhead: 30,
        repetition: 'AsianRule',
        draw: 'None',
        sixty: true,
        ply: 120
    };

    if (!window.aiSettings) {
        return defaults;
    }

    return {
        ...defaults,
        ...window.aiSettings,
        multipv: Math.max(2, Number(window.aiSettings.multipv) || 1),
        ponder: false
    };
}

function getBattleMoveTimeMs() {
    const configured = Number(window.aiSettings && window.aiSettings.moveTime);
    if (!Number.isFinite(configured)) {
        return 3000;
    }
    return Math.max(100, Math.min(30000, Math.round(configured)));
}

const MATE_CP_EQUIVALENT = 32000;

function cpToExpectedPoints(cp) {
    if (typeof cp !== 'number' || Number.isNaN(cp)) return null;
    const cappedCp = Math.max(-MATE_CP_EQUIVALENT, Math.min(MATE_CP_EQUIVALENT, cp));
    return 1 / (1 + Math.exp(-0.00368 * cappedCp));
}

function scoreToExpectedPoints(score, fallbackCp = null, perspective = 'current') {
    if (typeof fallbackCp === 'number') {
        return cpToExpectedPoints(fallbackCp);
    }

    if (!score) return null;
    let cpValue = null;

    if (score.type === 'mate') {
        cpValue = score.value > 0 ? MATE_CP_EQUIVALENT : -MATE_CP_EQUIVALENT;
    } else if (score.type === 'cp') {
        cpValue = score.value;
    } else {
        return null;
    }

    // For played score in review, raw engine score is from the opponent side after the move.
    // We normalize to the current player's perspective before converting to expected points.
    if (perspective === 'opponent') {
        cpValue = -cpValue;
    }

    return cpToExpectedPoints(cpValue);
}

function getMaterialCpForColor(boardData, color) {
    const pieceValues = {
        K: 10000,
        R: 900,
        C: 450,
        N: 350,
        B: 220,
        A: 220,
        P: 100
    };

    let total = 0;
    for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
            const piece = boardData[r][c];
            if (!piece) continue;
            const info = getPieceInfo(piece);
            if (info && info.color === color) {
                total += pieceValues[info.type] || 0;
            }
        }
    }
    return total;
}

function getPieceCpValue(pieceCode) {
    const pieceValues = {
        K: 10000,
        R: 900,
        C: 450,
        N: 350,
        B: 220,
        A: 220,
        P: 100
    };

    const info = getPieceInfo(pieceCode);
    if (!info) return 0;
    return pieceValues[info.type] || 0;
}

function canSquareBeCapturedByColor(boardData, target, attackerColor) {
    for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
            const piece = boardData[r][c];
            const info = getPieceInfo(piece);
            if (!info || info.color !== attackerColor) continue;

            const pseudoMoves = getValidMoves(boardData, r, c).map(to => ({
                from: { r, c },
                to
            }));
            const legalMoves = filterValidMoves(boardData, pseudoMoves, attackerColor);
            if (legalMoves.some(m => m.to.r === target.r && m.to.c === target.c)) {
                return true;
            }
        }
    }

    return false;
}

function estimateSacrificeCp(moveEntry) {
    if (!moveEntry || !moveEntry.board || !moveEntry.move || !moveEntry.player) {
        return 0;
    }

    const boardBefore = moveEntry.board;
    const movingPiece = boardBefore[moveEntry.move.from.r][moveEntry.move.from.c];
    const movingInfo = getPieceInfo(movingPiece);
    if (!movingInfo || movingInfo.color !== moveEntry.player) {
        return 0;
    }

    const capturedPiece = boardBefore[moveEntry.move.to.r][moveEntry.move.to.c];
    const movedPieceValue = getPieceCpValue(movingPiece);
    const capturedPieceValue = getPieceCpValue(capturedPiece);

    const boardAfter = cloneBoard(boardBefore);
    boardAfter[moveEntry.move.to.r][moveEntry.move.to.c] = boardAfter[moveEntry.move.from.r][moveEntry.move.from.c];
    boardAfter[moveEntry.move.from.r][moveEntry.move.from.c] = null;

    const opponent = moveEntry.player === 'red' ? 'black' : 'red';
    const isEnPrise = canSquareBeCapturedByColor(boardAfter, moveEntry.move.to, opponent);
    if (!isEnPrise) {
        return 0;
    }

    // Net sacrifice value: piece you offered minus the material you got immediately.
    return Math.max(0, movedPieceValue - capturedPieceValue);
}

function doesMoveDeliverTerminalWin(moveEntry) {
    if (!moveEntry || !moveEntry.board || !moveEntry.move || !moveEntry.player) {
        return false;
    }

    const boardAfter = cloneBoard(moveEntry.board);
    boardAfter[moveEntry.move.to.r][moveEntry.move.to.c] = boardAfter[moveEntry.move.from.r][moveEntry.move.from.c];
    boardAfter[moveEntry.move.from.r][moveEntry.move.from.c] = null;

    const opponent = moveEntry.player === 'red' ? 'black' : 'red';

    // Xiangqi treats "no legal moves" as a terminal loss for the side to move,
    // including stalemate-like positions (困斃), not only in-check mates.
    return !hasAnyValidMoves(boardAfter, opponent);
}

function getAllLegalMovesForColor(currentBoard, color) {
    const legalMoves = [];
    for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
            const piece = currentBoard[r][c];
            const pieceInfo = getPieceInfo(piece);
            if (!pieceInfo || pieceInfo.color !== color) continue;

            const pseudoMoves = getValidMoves(currentBoard, r, c).map(to => ({
                from: { r, c },
                to
            }));
            const filtered = filterValidMoves(currentBoard, pseudoMoves, color);
            legalMoves.push(...filtered);
        }
    }
    return legalMoves;
}

function isSameMove(a, b) {
    if (!a || !b || !a.from || !a.to || !b.from || !b.to) return false;
    return a.from.r === b.from.r && a.from.c === b.from.c && a.to.r === b.to.r && a.to.c === b.to.c;
}

function isObviousRecapture(moveEntry, previousMoveEntry) {
    if (!moveEntry || !moveEntry.board || !moveEntry.move || !previousMoveEntry || !previousMoveEntry.move) {
        return false;
    }

    const { board, move, player } = moveEntry;
    const prevMove = previousMoveEntry.move;
    const prevBoard = previousMoveEntry.board;
    if (!prevBoard) return false;

    // Must capture on the same square the opponent just moved to.
    if (move.to.r !== prevMove.to.r || move.to.c !== prevMove.to.c) {
        return false;
    }

    const mover = board[move.from.r][move.from.c];
    const target = board[move.to.r][move.to.c];
    const moverInfo = getPieceInfo(mover);
    const targetInfo = getPieceInfo(target);
    if (!moverInfo || !targetInfo) return false;
    if (moverInfo.color !== player || targetInfo.color === player) return false;

    // Opponent's previous move should be a capture of our piece on that same square.
    const prevTargetBefore = prevBoard[prevMove.to.r][prevMove.to.c];
    const prevTargetInfo = getPieceInfo(prevTargetBefore);
    return Boolean(prevTargetInfo && prevTargetInfo.color === player);
}

function isForcedKingEscape(moveEntry) {
    if (!moveEntry || !moveEntry.board || !moveEntry.move || !moveEntry.player) {
        return false;
    }

    const movingPiece = moveEntry.board[moveEntry.move.from.r][moveEntry.move.from.c];
    const movingInfo = getPieceInfo(movingPiece);
    if (!movingInfo || movingInfo.color !== moveEntry.player || movingInfo.type !== 'K') {
        return false;
    }

    if (!isKingInCheck(moveEntry.board, moveEntry.player)) {
        return false;
    }

    const legalMoves = getAllLegalMovesForColor(moveEntry.board, moveEntry.player);
    if (legalMoves.length !== 1) {
        return false;
    }

    const onlyMove = legalMoves[0];
    const onlyMovePiece = moveEntry.board[onlyMove.from.r][onlyMove.from.c];
    const onlyMovePieceInfo = getPieceInfo(onlyMovePiece);
    if (!onlyMovePieceInfo || onlyMovePieceInfo.type !== 'K') {
        return false;
    }

    return isSameMove(onlyMove, moveEntry.move);
}

function classifyMoveQuality(analysisResult, context = {}) {
    if (!analysisResult) return { grade: null };

    // `bestScore` is from current player's perspective at fenBefore.
    // `playedScore` is from opponent perspective (because played move was already applied).
    // Convert both mate scores to "current player" perspective before mate-specific checks.
    const bestMateForUs = (analysisResult.bestScore && analysisResult.bestScore.type === 'mate')
        ? analysisResult.bestScore.value
        : null;
    const playedMateForUs = (analysisResult.playedScore && analysisResult.playedScore.type === 'mate')
        ? -analysisResult.playedScore.value
        : null;

    // Win-probability loss must be computed as sigmoid(cp_best) - sigmoid(cp_played),
    // not sigmoid(cp_best - cp_played).
    const expectedBest = scoreToExpectedPoints(analysisResult.bestScore, analysisResult.bestScoreCp, 'current');
    const expectedPlayed = scoreToExpectedPoints(analysisResult.playedScore, analysisResult.playedScoreCp, 'opponent');
    const expectedLoss = (expectedBest !== null && expectedPlayed !== null)
        ? Math.max(0, expectedBest - expectedPlayed)
        : null;
    const deliversTerminalWin = doesMoveDeliverTerminalWin(context.moveEntry);
    const playedWinsByMate = (playedMateForUs !== null && playedMateForUs > 0) || deliversTerminalWin;

    const isBestMove = Boolean(
        analysisResult.bestMove &&
        analysisResult.playedMove &&
        analysisResult.bestMove === analysisResult.playedMove
    );

    const nearBest = expectedLoss !== null ? expectedLoss <= 0.01 : isBestMove;

    const sortedCandidates = Array.isArray(analysisResult.candidates)
        ? analysisResult.candidates
            .filter(c => c && typeof c.multipv === 'number')
            .sort((a, b) => a.multipv - b.multipv)
        : [];
    const secondCandidate = sortedCandidates.find(c => c.multipv === 2) || sortedCandidates[1] || null;
    const secondExpected = secondCandidate
        ? scoreToExpectedPoints(secondCandidate.score)
        : null;
    const candidateGap = (expectedBest !== null && secondExpected !== null)
        ? expectedBest - secondExpected
        : null;
    const bestIsLosingMate = bestMateForUs !== null && bestMateForUs < 0;
    const playedIsLosingMate = playedMateForUs !== null && playedMateForUs < 0;
    const bothAreLosingMate = bestIsLosingMate && playedIsLosingMate;
    const bothAreWinningMate = bestMateForUs !== null && bestMateForUs > 0 && playedWinsByMate;
    const missedForcedMate = bestMateForUs !== null && bestMateForUs > 0 && !playedWinsByMate;
    const forcedLoseByMate = playedIsLosingMate && !bestIsLosingMate;
    const uniqueBestGapThreshold = 0.20;
    const uniqueBestMove = isBestMove && expectedBest !== null && secondExpected !== null &&
        candidateGap !== null && candidateGap >= uniqueBestGapThreshold;
    const obviousRecapture = isObviousRecapture(context.moveEntry, context.previousMoveEntry);
    const forcedKingEscape = isForcedKingEscape(context.moveEntry);

    const previousAnalysis = context.previousAnalysis && !context.previousAnalysis.error
        ? context.previousAnalysis
        : null;
    const baselineExpected = (previousAnalysis && typeof previousAnalysis.expectedPlayed === 'number')
        ? 1 - previousAnalysis.expectedPlayed
        : null;

    const sacrificeCp = estimateSacrificeCp(context.moveEntry);
    const notAlreadyCrushing = baselineExpected === null || baselineExpected < 0.9;

    // Board-confirmed mate (or engine-confirmed winning mate) should never fall through
    // into generic Blunder/Miss paths due to score-orientation noise.
    if (playedWinsByMate) {
        if (nearBest && sacrificeCp >= 450) {
            return {
                grade: 'Brilliant',
                expectedBest,
                expectedPlayed,
                expectedLoss,
                sacrificeCp,
                candidateGap
            };
        }

        return {
            grade: isBestMove ? 'Best' : 'Great',
            expectedBest,
            expectedPlayed,
            expectedLoss,
            sacrificeCp,
            candidateGap
        };
    }

    if (forcedLoseByMate && !deliversTerminalWin) {
        return {
            grade: 'Blunder',
            expectedBest,
            expectedPlayed,
            expectedLoss,
            sacrificeCp,
            candidateGap
        };
    }

    if (missedForcedMate && !deliversTerminalWin) {
        return {
            grade: 'Miss',
            expectedBest,
            expectedPlayed,
            expectedLoss,
            sacrificeCp,
            candidateGap
        };
    }

    if (bothAreLosingMate) {
        const bestMateDistance = Math.abs(bestMateForUs);
        const playedMateDistance = Math.abs(playedMateForUs);
        const lostMateBuffer = Math.max(0, bestMateDistance - playedMateDistance);

        let grade = 'Excellent';
        if (lostMateBuffer >= 6) {
            grade = 'Blunder';
        } else if (lostMateBuffer >= 3) {
            grade = 'Mistake';
        } else if (lostMateBuffer >= 1) {
            grade = 'Inaccuracy';
        } else if (isBestMove) {
            grade = 'Best';
        }

        return {
            grade,
            expectedBest,
            expectedPlayed,
            expectedLoss,
            sacrificeCp,
            candidateGap
        };
    }

    if (nearBest && bestMateForUs !== null && bestMateForUs > 0 && sacrificeCp >= 450) {
        return {
            grade: 'Brilliant',
            expectedBest,
            expectedPlayed,
            expectedLoss,
            sacrificeCp,
            candidateGap
        };
    }

    if (!bestIsLosingMate && nearBest && sacrificeCp >= 140 && notAlreadyCrushing &&
        expectedBest !== null && expectedPlayed !== null && expectedPlayed >= expectedBest - 0.02) {
        return {
            grade: 'Brilliant',
            expectedBest,
            expectedPlayed,
            expectedLoss,
            sacrificeCp,
            candidateGap
        };
    }

    if (!bothAreWinningMate && uniqueBestMove && !obviousRecapture && !forcedKingEscape &&
        (baselineExpected === null || baselineExpected < 0.9)) {
        return {
            grade: 'Great',
            expectedBest,
            expectedPlayed,
            expectedLoss,
            sacrificeCp,
            candidateGap
        };
    }

    const isMiss = expectedBest !== null && expectedPlayed !== null &&
        expectedBest >= 0.85 && expectedPlayed <= 0.65 && expectedPlayed > 0.35 &&
        expectedLoss >= 0.12;
    if (isMiss) {
        return {
            grade: 'Miss',
            expectedBest,
            expectedPlayed,
            expectedLoss,
            sacrificeCp,
            candidateGap
        };
    }

    let grade = 'Excellent';
    if (expectedLoss === null) {
        grade = isBestMove ? 'Best' : 'Excellent';
    } else if (isBestMove && expectedLoss <= 0.005) {
        grade = 'Best';
    } else if (expectedLoss < 0.02) {
        grade = 'Excellent';
    } else if (expectedLoss < 0.05) {
        grade = 'Good';
    } else if (expectedLoss < 0.10) {
        grade = 'Inaccuracy';
    } else if (expectedLoss < 0.20) {
        grade = 'Mistake';
    } else {
        grade = 'Blunder';
    }

    return {
        grade,
        expectedBest,
        expectedPlayed,
        expectedLoss,
        sacrificeCp,
        candidateGap
    };
}

function getBadgeClass(grade) {
    switch (grade) {
        case 'Brilliant': return 'badge-brilliant';
        case 'Great': return 'badge-great';
        case 'Best': return 'badge-best';
        case 'Excellent': return 'badge-excellent';
        case 'Good': return 'badge-good';
        case 'Inaccuracy': return 'badge-inaccuracy';
        case 'Mistake': return 'badge-mistake';
        case 'Miss': return 'badge-miss';
        case 'Blunder': return 'badge-blunder';
        default: return '';
    }
}

function requestMoveAnalysis(payload, timeoutMs = 25000) {
    return new Promise((resolve, reject) => {
        if (!window.ws || window.ws.readyState !== WebSocket.OPEN) {
            reject(new Error('WebSocket is not connected.'));
            return;
        }

        const timer = setTimeout(() => {
            pendingAnalysisRequests.delete(payload.requestId);
            reject(new Error('Analyze request timeout.'));
        }, timeoutMs);

        pendingAnalysisRequests.set(payload.requestId, {
            resolve,
            reject,
            timer
        });

        window.ws.send(JSON.stringify(payload));
    });
}

async function runReviewAnalysis() {
    if (moveHistory.length === 0) return;
    if (reviewIsAnalyzing) return;
    if (reviewAnalysisDone && reviewAnalyzedForMoveCount === moveHistory.length) return;

    const runId = ++reviewRunId;
    const totalMoves = moveHistory.length;
    const reviewBudgetMs = 20000;
    const budgetReserveMs = 2000;
    const totalSearches = Math.max(1, totalMoves * 2);
    const reviewSearchMovetime = Math.max(
        80,
        Math.min(1200, Math.floor((reviewBudgetMs - budgetReserveMs) / totalSearches))
    );
    const analysisTimeoutMs = Math.max(900, reviewSearchMovetime * 4);

    reviewIsAnalyzing = true;
    setReviewProgress(0, totalMoves);

    const analysisSettings = {
        ...getReviewAnalysisSettings(),
        threads: 4,
        multipv: 2,
        ponder: false
    };

    for (let i = 0; i < totalMoves; i++) {
        if (runId !== reviewRunId) {
            break;
        }

        const entry = moveHistory[i];
        const requestId = `review-${runId}-${i + 1}`;
        const payload = {
            type: 'analyze_move',
            requestId,
            ply: i + 1,
            fenBefore: boardToFen(entry.board, entry.player),
            playedMove: moveToPgn(entry.move),
            movetime: reviewSearchMovetime,
            aiSettings: i === 0 ? analysisSettings : null
        };

        try {
            const result = await requestMoveAnalysis(payload, analysisTimeoutMs);
            if (runId !== reviewRunId) {
                break;
            }
            const previousAnalysis = i > 0 ? reviewAnalysisMap[i] : null;
            const previousMoveEntry = i > 0 ? moveHistory[i - 1] : null;
            const quality = classifyMoveQuality(result, {
                moveEntry: entry,
                previousAnalysis,
                previousMoveEntry
            });
            reviewAnalysisMap[i + 1] = { ...result, ...quality };
        } catch (err) {
            if (runId !== reviewRunId) {
                break;
            }
            reviewAnalysisMap[i + 1] = {
                error: err.message
            };
        }

        setReviewProgress(i + 1, totalMoves);
        updateNotationDisplay();
        updateReviewInsight();
    }

    if (runId !== reviewRunId) {
        reviewIsAnalyzing = false;
        return;
    }

    if (runId === reviewRunId) {
        reviewIsAnalyzing = false;
        reviewAnalysisDone = true;
        reviewAnalyzedForMoveCount = totalMoves;
        setReviewProgress(totalMoves, totalMoves);
        updateReviewInsight();
    }
}

function updateReviewControlState() {
    const dom = getReviewDom();
    if (!dom.controls) return;

    if (!reviewMode) {
        dom.controls.classList.add('hidden');
        return;
    }

    const maxIndex = Math.max(0, reviewTimeline.length - 1);
    dom.controls.classList.remove('hidden');
    if (dom.firstBtn) dom.firstBtn.disabled = reviewIndex <= 0;
    if (dom.prevBtn) dom.prevBtn.disabled = reviewIndex <= 0;
    if (dom.nextBtn) dom.nextBtn.disabled = reviewIndex >= maxIndex;
    if (dom.lastBtn) dom.lastBtn.disabled = reviewIndex >= maxIndex;
}

function updateReviewInsight() {
    const dom = getReviewDom();
    if (!dom.insight) return;

    if (!reviewMode) {
        dom.insight.classList.add('hidden');
        dom.insight.textContent = '';
        return;
    }

    dom.insight.classList.remove('hidden');

    if (reviewIndex === 0) {
        dom.insight.textContent = '起始局面。';
        return;
    }

    const analysis = reviewAnalysisMap[reviewIndex];
    if (!analysis) {
        dom.insight.textContent = reviewIsAnalyzing ? '此手分析中...' : '此手尚未分析。';
        return;
    }

    if (analysis.error) {
        dom.insight.textContent = `分析失敗：${analysis.error}`;
        return;
    }

    const deltaText = typeof analysis.deltaCp === 'number' ? `${analysis.deltaCp} cp` : 'N/A';
    const expectedLossText = typeof analysis.expectedLoss === 'number' ? analysis.expectedLoss.toFixed(3) : 'N/A';
    const bestMoveText = analysis.bestMove || 'N/A';
    dom.insight.textContent = `${analysis.grade || 'N/A'} | E-Loss ${expectedLossText} | Delta ${deltaText} | Best ${bestMoveText}`;
}

function goToReviewPly(index) {
    if (!reviewMode || reviewTimeline.length === 0) return;

    const maxIndex = reviewTimeline.length - 1;
    reviewIndex = Math.max(0, Math.min(index, maxIndex));
    selectedPiece = null;
    validMoves = [];

    const snapshot = reviewTimeline[reviewIndex];
    if (snapshot) {
        renderBoard(board, snapshot.board, () => {});
    }

    updateReviewControlState();
    updateNotationDisplay();
    updateReviewInsight();
    statusDisplay.textContent = `回顧模式：第 ${reviewIndex} / ${maxIndex} 手`;
}

function goToReviewFirst() {
    stopReviewPlayback();
    goToReviewPly(0);
}

function goToReviewPrev() {
    stopReviewPlayback();
    goToReviewPly(reviewIndex - 1);
}

function goToReviewNext() {
    goToReviewPly(reviewIndex + 1);
}

function goToReviewLast() {
    stopReviewPlayback();
    goToReviewPly(reviewTimeline.length - 1);
}

function toggleReviewPlayback() {
    if (!reviewMode) return;

    if (reviewPlayTimer) {
        stopReviewPlayback();
        return;
    }

    const dom = getReviewDom();
    if (dom.playBtn) {
        dom.playBtn.textContent = '⏸';
    }

    reviewPlayTimer = setInterval(() => {
        const maxIndex = reviewTimeline.length - 1;
        if (reviewIndex >= maxIndex) {
            stopReviewPlayback();
            return;
        }
        goToReviewPly(reviewIndex + 1);
    }, 750);
}

function enterReviewMode() {
    if (!gameEnded) {
        showNotification('請先完成對局，再進行對局回顧');
        return;
    }

    if (moveHistory.length === 0) {
        showNotification('尚無可回顧的走子紀錄');
        return;
    }

    stopReviewPlayback();
    checkmateOverlay.classList.add('hidden');
    setReviewSummarySidebarVisible(true);

    const dom = getReviewDom();
    if (dom.toolbar) dom.toolbar.classList.add('hidden');
    if (dom.exitBtn) dom.exitBtn.classList.add('hidden');
    if (dom.controls) dom.controls.classList.add('hidden');
    if (dom.insight) {
        dom.insight.classList.add('hidden');
        dom.insight.textContent = '';
    }
    if (dom.progressWrap) dom.progressWrap.classList.add('hidden');
    
    const summaryOverlay = document.getElementById('review-summary-overlay');
    const summaryLoading = document.getElementById('review-summary-loading');
    const summaryContent = document.getElementById('review-summary-content');
    const summaryProgress = document.getElementById('review-summary-progress');
    
    if (summaryOverlay) summaryOverlay.classList.remove('hidden');
    if (summaryLoading) summaryLoading.classList.remove('hidden');
    if (summaryContent) summaryContent.classList.add('hidden');
    if (summaryProgress) summaryProgress.textContent = `0 / ${moveHistory.length}`;

    reviewMode = true;
    reviewTimeline = buildReviewTimeline();
    reviewAnalysisMap = {};

    if (!reviewAnalysisDone || reviewAnalyzedForMoveCount !== moveHistory.length) {
        runReviewAnalysis().then(() => {
            prepareReviewSummary();
            if (summaryOverlay) {
                if (summaryLoading) summaryLoading.classList.add('hidden');
                if (summaryContent) summaryContent.classList.remove('hidden');
            }
        });
    } else {
        prepareReviewSummary();
        if (summaryOverlay) {
            if (summaryLoading) summaryLoading.classList.add('hidden');
            if (summaryContent) summaryContent.classList.remove('hidden');
        }
    }
}

function prepareReviewSummary() {
    let redStats = {
        expectedPointsTotal: 0,
        moves: 0,
        classifications: {
            'Brilliant': 0, 'Great': 0, 'Best': 0, 'Excellent': 0, 'Good': 0,
            'Inaccuracy': 0, 'Mistake': 0, 'Miss': 0, 'Blunder': 0
        }
    };
    let blackStats = JSON.parse(JSON.stringify(redStats));
    
    for (let i = 1; i <= Math.min(moveHistory.length, reviewAnalyzedForMoveCount); i++) {
        const analysis = reviewAnalysisMap[i];
        if (!analysis || !analysis.grade) continue;
        
        const entry = moveHistory[i - 1]; 
        const isRed = entry.player === 'red';
        let stats = isRed ? redStats : blackStats;
        
        stats.moves++;
        
        // 精度可以近似為 100 * (1 - expectedLoss)，上限為 100%
        let expectedLoss = typeof analysis.expectedLoss === 'number' ? analysis.expectedLoss : 0;
        let moveAccuracy = Math.max(0, 1 - expectedLoss) * 100;
        stats.expectedPointsTotal += moveAccuracy;
        
        if (stats.classifications[analysis.grade] !== undefined) {
            stats.classifications[analysis.grade]++;
        }
    }
    
    const redAccuracy = redStats.moves > 0 ? (redStats.expectedPointsTotal / redStats.moves).toFixed(1) : 0;
    const blackAccuracy = blackStats.moves > 0 ? (blackStats.expectedPointsTotal / blackStats.moves).toFixed(1) : 0;
    
    const redAccEl = document.getElementById('red-accuracy');
    const blackAccEl = document.getElementById('black-accuracy');
    if(redAccEl) redAccEl.textContent = redAccuracy + '%';
    if(blackAccEl) blackAccEl.textContent = blackAccuracy + '%';
    
    const classificationsContainer = document.getElementById('review-classifications');
    if (!classificationsContainer) return;
    classificationsContainer.innerHTML = '';
    
    const categories = [
        { label: '很棒 (Brilliant)', grade: 'Brilliant', icon: '!!', color: '#1baca6' },
        { label: '太棒了 (Great)', grade: 'Great', icon: '!', color: '#5c8bb0' },
        { label: '最佳 (Best)', grade: 'Best', icon: '★', color: '#81b64c' },
        { label: '妙著 (Excellent)', grade: 'Excellent', icon: '👍', color: '#96bc4b' },
        { label: '好著 (Good)', grade: 'Good', icon: '✔', color: '#96af8b' },
        { label: '值得商榷 (Inaccuracy)', grade: 'Inaccuracy', icon: '?!', color: '#f7c545' },
        { label: '誤著 (Mistake)', grade: 'Mistake', icon: '?', color: '#e58f2a' },
        { label: '錯失 (Miss)', grade: 'Miss', icon: '✖', color: '#ff7763' },
        { label: '大漏著 (Blunder)', grade: 'Blunder', icon: '??', color: '#ca3431' }
    ];
    
    categories.forEach(cat => {
        const redCount = redStats.classifications[cat.grade];
        const blackCount = blackStats.classifications[cat.grade];
        
        const row = document.createElement('div');
        row.classList.add('review-classification-row');

        row.innerHTML = `
            <div class="review-classification-count review-classification-count-red">${redCount}</div>
            <div class="review-classification-label" style="color: ${cat.color};">
                <span class="review-classification-icon" style="background: ${cat.color};">${cat.icon}</span>
                <span class="review-classification-text">${cat.label}</span>
            </div>
            <div class="review-classification-count review-classification-count-black">${blackCount}</div>
        `;
        classificationsContainer.appendChild(row);
    });
}

function startStepByStepReview() {
    setReviewSummarySidebarVisible(false);

    reviewIndex = 1;

    const dom = getReviewDom();
    if (dom.startBtn) dom.startBtn.classList.add('hidden');
    if (dom.toolbar) dom.toolbar.classList.remove('hidden');
    if (dom.exitBtn) dom.exitBtn.classList.remove('hidden');
    if (dom.controls) dom.controls.classList.remove('hidden');
    if (dom.insight) dom.insight.classList.remove('hidden');
    if (dom.progressWrap) dom.progressWrap.classList.remove('hidden');

    undoBtn.disabled = true;
    switchNotationTab('text');
    goToReviewPly(reviewIndex);
    updateReviewInsight();
}

function closeReviewSummary() {
    setReviewSummarySidebarVisible(false);
    reviewMode = false;
    checkmateOverlay.classList.remove('hidden');
}

function exitReviewMode() {
    if (!reviewMode) return;

    reviewMode = false;
    stopReviewPlayback();

    const dom = getReviewDom();
    if (dom.startBtn) dom.startBtn.classList.remove('hidden');
    if (dom.startBtn) dom.startBtn.disabled = !gameEnded;
    if (dom.toolbar) dom.toolbar.classList.add('hidden');
    if (dom.exitBtn) dom.exitBtn.classList.add('hidden');
    if (dom.controls) dom.controls.classList.add('hidden');
    if (dom.insight) {
        dom.insight.classList.add('hidden');
        dom.insight.textContent = '';
    }
    if (dom.progressWrap) dom.progressWrap.classList.add('hidden');
    setReviewSummarySidebarVisible(false);

    setReviewProgress(0, 0);

    renderBoard(board);
    updateNotationDisplay();
    statusDisplay.textContent = currentPlayer === 'red' ? translations.status_red_turn : translations.status_black_turn;
    undoBtn.disabled = moveHistory.length === 0;
}

// Helper to convert board state to FEN

function makeAiMove() {
    isAiThinking = true;
    statusDisplay.textContent = translations.ai_thinking;
    undoBtn.disabled = true;

    if (puzzleModeActive && currentPuzzleSolution && currentPlayer === aiColor) {
        const expectedMove = getCurrentPuzzleExpectedMove();
        if (expectedMove) {
            const parsed = ucciMoveToCoords(expectedMove);
            if (parsed) {
                const pseudoMoves = getValidMoves(boardState, parsed.from.r, parsed.from.c).map(to => ({
                    from: { r: parsed.from.r, c: parsed.from.c },
                    to
                }));
                const legalMoves = filterValidMoves(boardState, pseudoMoves, currentPlayer);
                const chosenMove = legalMoves.find(move => isSameMove(move, parsed));

                if (chosenMove) {
                    puzzleStepIndex += 1;
                    setTimeout(() => {
                        isAiThinking = false;
                        undoBtn.disabled = (moveHistory.length === 0);
                        statusDisplay.textContent = `${currentPlayer === 'red' ? translations.status_red_turn : translations.status_black_turn}`;
                        animateAndMovePiece(chosenMove.from, chosenMove.to);
                    }, 180);
                    return;
                }
            }

            console.warn('Puzzle solution move is invalid for current position:', expectedMove);
            showNotification('puzzle_solution_mismatch');
        } else {
            showNotification('puzzle_solution_exhausted');
        }
    }

    const fen = boardToFen(boardState, currentPlayer);
    const payload = {
        type: 'getmove',
        fen: fen,
        movetime: getBattleMoveTimeMs(),
        aiSettings: window.aiSettings // <--- Pass all advanced settings
    };

    if (window.ws && window.ws.readyState === WebSocket.OPEN) {
        window.ws.send(JSON.stringify(payload));
    } else {
        console.error('[Script.js] WebSocket is not open. Cannot send move.');
    }
}

// --- Notation Logic ---
function updateNotationDisplay() {
    const notationList = document.getElementById('notation-list');
    notationList.innerHTML = '';

    const createMoveCell = (moveText, ply) => {
        const cell = document.createElement('span');
        cell.classList.add('notation-move-cell');
        if (reviewMode && reviewIndex === ply) {
            cell.classList.add('active');
        } else if (!reviewMode) {
            cell.classList.add('disabled');
        }

        if (!moveText) {
            cell.classList.add('disabled');
            cell.textContent = '';
            return cell;
        }

        const text = document.createElement('span');
        text.textContent = moveText;
        cell.appendChild(text);

        const analysis = reviewAnalysisMap[ply];
        if (analysis && analysis.grade) {
            const badge = document.createElement('span');
            badge.classList.add('review-badge');
            const badgeClass = getBadgeClass(analysis.grade);
            if (badgeClass) {
                badge.classList.add(badgeClass);
            }
            badge.textContent = analysis.grade;
            cell.appendChild(badge);
        }

        cell.dataset.ply = String(ply);
        cell.addEventListener('click', () => {
            if (reviewMode) {
                stopReviewPlayback();
                goToReviewPly(ply);
            }
        });

        return cell;
    };

    for (let i = 0; i < notationHistory.length; i += 2) {
        const moveNumber = Math.floor(i / 2) + 1;
        const redMove = notationHistory[i];
        const blackMove = notationHistory[i + 1] || '';
        const redPly = i + 1;
        const blackPly = i + 2;

        const moveElement = document.createElement('div');
        moveElement.classList.add('notation-entry');

        const numberSpan = document.createElement('span');
        numberSpan.classList.add('move-number');
        numberSpan.textContent = `${moveNumber}. `;

        const redMoveSpan = createMoveCell(redMove, redPly);
        const blackMoveSpan = createMoveCell(blackMove, blackPly);

        moveElement.appendChild(numberSpan);
        moveElement.appendChild(redMoveSpan);
        moveElement.appendChild(blackMoveSpan);
        notationList.appendChild(moveElement);
    }

    const pgnPreview = document.getElementById('pgn-preview');
    pgnPreview.textContent = generatePgnString();
}

function moveToNotation(move, board) {
    const { from, to } = move;
    const piece = board[from.r][from.c];
    const pieceInfo = getPieceInfo(piece);
    const pieceName = pieceInfo.name;

    const toChineseNumber = (n) => {
        if (n < 1 || n > 9) return n;
        const chars = ['一', '二', '三', '四', '五', '六', '七', '八', '九'];
        return chars[n - 1];
    };

    const fromCol = pieceInfo.color === 'red' ? 9 - from.c : from.c + 1;
    const toCol = pieceInfo.color === 'red' ? 9 - to.c : to.c + 1;

    let action;
    const isPawnOrCannonOrRook = ['P', 'C', 'R'].includes(pieceInfo.type);
    const isSameColumn = from.c === to.c;

    if (isPawnOrCannonOrRook && isSameColumn) {
        action = from.r > to.r ? '進' : '退';
        if (pieceInfo.color === 'black') { // Black moves forward is increasing row index
            action = action === '進' ? '退' : '進';
        }
    } else if (from.r > to.r) {
        action = pieceInfo.color === 'red' ? '進' : '退';
    } else if (from.r < to.r) {
        action = pieceInfo.color === 'red' ? '退' : '進';
    } else {
        action = '平';
    }

    let movement;
    if (['A', 'B', 'N'].includes(pieceInfo.type)) {
        movement = toCol;
    } else {
        movement = isSameColumn ? Math.abs(to.r - from.r) : toCol;
    }

    const fromColStr = pieceInfo.color === 'red' ? toChineseNumber(fromCol) : fromCol;
    const movementStr = pieceInfo.color === 'red' ? toChineseNumber(movement) : movement;

    // Handle multiple pieces of the same type in the same column
    let ambiguous = false;
    if (['R', 'N', 'C', 'P'].includes(pieceInfo.type)) {
        for (let r = 0; r < ROWS; r++) {
            if (r !== from.r && board[r][from.c] === piece) {
                ambiguous = true;
                break;
            }
        }
    }

    if (ambiguous) {
        const sortedPieces = [];
        for (let r = 0; r < ROWS; r++) {
            if (board[r][from.c] === piece) {
                sortedPieces.push({ r, c: from.c });
            }
        }
        // Sort pieces from front to back.
        // For Red, front piece has a smaller row index.
        // For Black, front piece has a larger row index.
        if (pieceInfo.color === 'red') {
            sortedPieces.sort((a, b) => a.r - b.r); 
        } else {
            sortedPieces.sort((a, b) => b.r - a.r); 
        }

        const pieceIndex = sortedPieces.findIndex(p => p.r === from.r);
        const pieceOrder = ['前', '後', '三', '四', '五'];
        const orderName = pieceOrder[pieceIndex];
        
        return `${orderName}${pieceName}${action}${movementStr}`;
    }

    return `${pieceName}${fromColStr}${action}${movementStr}`;
}

function moveToPgn(move) {
    const from = String.fromCharCode(97 + move.from.c) + (9 - move.from.r);
    const to = String.fromCharCode(97 + move.to.c) + (9 - move.to.r);
    return from + to;
}

function fenToBoardSetup(fenString) {
    const normalizedFen = String(fenString || '').trim();
    const fenParts = normalizedFen.split(/\s+/);
    if (fenParts.length < 2) {
        throw new Error('FEN 格式錯誤。');
    }

    const boardPart = fenParts[0];
    const turnPart = fenParts[1];
    const rows = boardPart.split('/');
    if (rows.length !== ROWS) {
        throw new Error('FEN 行數不是 10。');
    }

    const typeMap = {
        k: 'K',
        a: 'A',
        b: 'B',
        e: 'B',
        n: 'N',
        h: 'N',
        r: 'R',
        c: 'C',
        p: 'P'
    };

    const parsedBoard = Array.from({ length: ROWS }, () => Array(COLS).fill(null));

    for (let r = 0; r < ROWS; r++) {
        let c = 0;
        for (const ch of rows[r]) {
            if (/^[1-9]$/.test(ch)) {
                c += Number(ch);
                continue;
            }

            const mappedType = typeMap[ch.toLowerCase()];
            if (!mappedType) {
                throw new Error(`FEN 含未知棋子字元：${ch}`);
            }
            if (c >= COLS) {
                throw new Error('FEN 欄位超出範圍。');
            }

            const colorPrefix = ch === ch.toUpperCase() ? 'r' : 'b';
            parsedBoard[r][c] = `${colorPrefix}${mappedType}`;
            c += 1;
        }

        if (c !== COLS) {
            throw new Error('FEN 欄數不是 9。');
        }
    }

    const player = turnPart === 'b' ? 'black' : 'red';
    return { board: parsedBoard, player };
}

function ucciMoveToCoords(moveText) {
    const move = String(moveText || '').toLowerCase();
    if (!/^[a-i][0-9][a-i][0-9]$/.test(move)) {
        return null;
    }

    return {
        from: {
            c: move.charCodeAt(0) - 97,
            r: 9 - Number(move.charAt(1))
        },
        to: {
            c: move.charCodeAt(2) - 97,
            r: 9 - Number(move.charAt(3))
        }
    };
}

function parsePgnForAnalysis(pgnText) {
    const normalizedText = String(pgnText || '').replace(/^\uFEFF/, '');
    const fenHeaderMatch = normalizedText.match(/\[FEN\s+"([^"]+)"\]/i);
    const setup = fenHeaderMatch
        ? fenToBoardSetup(fenHeaderMatch[1])
        : { board: cloneBoard(initialBoard), player: 'red' };

    let workingBoard = cloneBoard(setup.board);
    let playerToMove = setup.player;

    const moveTokens = normalizedText.match(/\b[a-i][0-9][a-i][0-9]\b/gi) || [];
    if (moveTokens.length === 0) {
        throw new Error('PGN 內沒有可用的 UCCI 著法。');
    }

    const importedMoveHistory = [];
    const importedNotation = [];
    const importedPgnMoves = [];

    for (let i = 0; i < moveTokens.length; i++) {
        const token = moveTokens[i].toLowerCase();
        const parsed = ucciMoveToCoords(token);
        if (!parsed) {
            throw new Error(`第 ${i + 1} 手格式錯誤：${token}`);
        }

        const movingPiece = workingBoard[parsed.from.r] && workingBoard[parsed.from.r][parsed.from.c];
        const movingInfo = getPieceInfo(movingPiece);
        if (!movingInfo || movingInfo.color !== playerToMove) {
            throw new Error(`第 ${i + 1} 手無法從起點移動：${token}`);
        }

        const pseudoMoves = getValidMoves(workingBoard, parsed.from.r, parsed.from.c).map(to => ({
            from: { r: parsed.from.r, c: parsed.from.c },
            to
        }));
        const legalMoves = filterValidMoves(workingBoard, pseudoMoves, playerToMove);
        const selectedMove = legalMoves.find(move => isSameMove(move, parsed));
        if (!selectedMove) {
            throw new Error(`第 ${i + 1} 手不是合法著法：${token}`);
        }

        const boardBefore = cloneBoard(workingBoard);
        const notation = moveToNotation(selectedMove, boardBefore);

        workingBoard[selectedMove.to.r][selectedMove.to.c] = workingBoard[selectedMove.from.r][selectedMove.from.c];
        workingBoard[selectedMove.from.r][selectedMove.from.c] = null;

        const opponent = playerToMove === 'red' ? 'black' : 'red';
        const isCheck = isKingInCheck(workingBoard, opponent);

        importedMoveHistory.push({
            board: boardBefore,
            player: playerToMove,
            move: {
                from: { r: selectedMove.from.r, c: selectedMove.from.c },
                to: { r: selectedMove.to.r, c: selectedMove.to.c }
            },
            isCheck,
            notation
        });

        importedNotation.push(notation);
        importedPgnMoves.push(token);
        playerToMove = opponent;
    }

    return {
        initialBoard: cloneBoard(setup.board),
        startPlayer: setup.player,
        finalBoard: cloneBoard(workingBoard),
        finalPlayer: playerToMove,
        moveHistory: importedMoveHistory,
        notationHistory: importedNotation,
        pgnMoves: importedPgnMoves
    };
}

function openImportedPgnForAnalysis(parsed, sourceName = 'Uploaded PGN') {
    if (!parsed || !Array.isArray(parsed.moveHistory) || parsed.moveHistory.length === 0) {
        throw new Error('PGN 解析後沒有可分析的棋步。');
    }

    puzzleModeActive = false;
    currentPuzzle = null;
    currentPuzzleSolution = null;
    puzzleStepIndex = 0;
    setPuzzleNextButtonVisible(false);

    startGame('pvp', 'red', {
        board: cloneBoard(parsed.initialBoard),
        player: parsed.startPlayer
    });

    gameMode = 'analysis';
    moveHistory = parsed.moveHistory.map(entry => ({
        ...entry,
        board: cloneBoard(entry.board),
        move: {
            from: { ...entry.move.from },
            to: { ...entry.move.to }
        }
    }));
    notationHistory = [...parsed.notationHistory];
    pgnMoves = [...parsed.pgnMoves];
    boardState = cloneBoard(parsed.finalBoard);
    currentPlayer = parsed.finalPlayer;
    gameEnded = true;
    isAiThinking = false;
    selectedPiece = null;
    validMoves = [];
    queuedAiMove = null;

    if (resignBtn) resignBtn.disabled = true;
    undoBtn.disabled = true;
    renderBoard(board);
    updateNotationDisplay();

    showNotification('analysis_loaded', { name: sourceName });
    enterReviewMode();
}

async function analyzeUploadedPgn() {
    const fileInput = document.getElementById('analysis-pgn-file');
    const runBtn = document.getElementById('analysis-upload-run-btn');
    const file = fileInput && fileInput.files && fileInput.files[0];

    if (!file) {
        showNotification('analysis_select_file');
        return;
    }

    if (!file.name.toLowerCase().endsWith('.pgn')) {
        showNotification('analysis_invalid_file');
        return;
    }

    if (runBtn) runBtn.disabled = true;
    try {
        playBgmIfNeeded();
        const content = await file.text();
        const parsed = parsePgnForAnalysis(content);
        openImportedPgnForAnalysis(parsed, file.name);
    } catch (err) {
        console.error('Failed to analyze uploaded PGN:', err);
        showNotification('analysis_parse_failed', { reason: err.message || 'Unknown error' });
    } finally {
        if (runBtn) runBtn.disabled = false;
    }
}

function boardToFen(board, player) {
    let fen = '';
    for (let i = 0; i < ROWS; i++) {
        let emptyCount = 0;
        for (let j = 0; j < COLS; j++) {
            const piece = board[i][j];
            if (piece) {
                if (emptyCount > 0) {
                    fen += emptyCount;
                    emptyCount = 0;
                }
                const pieceInfo = getPieceInfo(piece);
                if (pieceInfo) {
                    fen += pieceInfo.color === 'red' ? pieceInfo.type.toUpperCase() : pieceInfo.type.toLowerCase();
                } else {
                    console.error(`Invalid piece at [${i}][${j}]:`, piece);
                    emptyCount++;  // Treat invalid piece as empty
                }
            } else {
                emptyCount++;
            }
        }
        if (emptyCount > 0) {
            fen += emptyCount;
        }
        if (i < ROWS - 1) {
            fen += '/';
        }
    }
    const turn = player === 'red' ? 'w' : 'b';
    fen += ` ${turn} - - 0 1`;
    return fen;
}

function generatePgnString() {
    const today = new Date().toISOString().slice(0, 10);
    let pgn = `[Event "Chinese Chess Game"]\n`;
    pgn += `[Site "Local"]\n`;
    pgn += `[Date "${today}"]\n`;
    pgn += `[Round "1"]\n`;
    pgn += `[Red "Player 1"]\n`;
    pgn += `[Black "Player 2"]\n`;
    pgn += `[Result "*"]\n`;

    const initialFen = boardToFen(initialBoard, 'red');
    pgn += `[FEN "${initialFen}"]\n\n`;

    let pgnMovesString = '';
    for (let i = 0; i < pgnMoves.length; i += 2) {
        pgnMovesString += `${Math.floor(i / 2) + 1}. `;
        pgnMovesString += pgnMoves[i];
        if (pgnMoves[i + 1]) {
            pgnMovesString += ' ' + pgnMoves[i + 1];
        }
        pgnMovesString += '\n';
    }
    pgn += pgnMovesString.trim();
    return pgn;
}

function exportPgn() {
    try {
        const pgnString = generatePgnString();
        // Add UTF-8 BOM to ensure proper encoding detection
        const bom = '\uFEFF';
        const blob = new Blob([bom + pgnString], { type: 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'game.pgn';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    } catch (error) {
        console.error('Error exporting PGN:', error);
        showNotification('export_pgn_error');
    }
}

function exportTextNotation() {
    let text = '';
    for (let i = 0; i < notationHistory.length; i++) {
        const moveNumber = Math.floor(i / 2) + 1;
        if (i % 2 === 0) {
            text += `${moveNumber}. ${notationHistory[i]}`;
        } else {
            text += ` ${notationHistory[i]}\n`;
        }
    }
    // Add UTF-8 BOM to ensure proper encoding detection
    const bom = '\uFEFF';
    const blob = new Blob([bom + text.trim()], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'game-notation.txt';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

function switchNotationTab(tab) {
    const textBtn = document.getElementById('text-notation-btn');
    const pgnBtn = document.getElementById('pgn-notation-btn');
    const textList = document.getElementById('notation-list');
    const pgnPreview = document.getElementById('pgn-preview');
    const exportTextBtn = document.getElementById('exportTextBtn');
    const exportPgnBtn = document.getElementById('exportPgnBtn');

    if (tab === 'text') {
        textBtn.classList.add('active');
        pgnBtn.classList.remove('active');
        textList.classList.remove('hidden');
        pgnPreview.classList.add('hidden');
        exportTextBtn.classList.remove('hidden');
        exportPgnBtn.classList.add('hidden');
    } else { // pgn
        textBtn.classList.remove('active');
        pgnBtn.classList.add('active');
        textList.classList.add('hidden');
        pgnPreview.classList.remove('hidden');
        exportTextBtn.classList.add('hidden');
        exportPgnBtn.classList.remove('hidden');
    }
}

function parsePuzzleSolutionBook(payload) {
    const source = payload && Array.isArray(payload.puzzles) ? payload.puzzles : [];
    const map = {};

    source.forEach((entry) => {
        if (!entry || !entry.index || !Array.isArray(entry.moves) || entry.moves.length === 0) {
            return;
        }

        map[String(entry.index)] = {
            index: String(entry.index),
            event: entry.event || '',
            fen: entry.fen || '',
            moves: entry.moves.map(move => String(move).toLowerCase()),
            result: entry.result || '*',
            unique: Boolean(entry.unique)
        };
    });

    return map;
}

async function loadPuzzleSolutionBook() {
    if (puzzleSolutionBook && Object.keys(puzzleSolutionBook).length > 0) {
        return puzzleSolutionBook;
    }

    const candidates = ['適情雅趣_引擎解答.json', 'puzzle_solutions.json'];
    let parsed = null;

    for (const filePath of candidates) {
        try {
            const response = await fetch(filePath);
            if (!response.ok) continue;
            const json = await response.json();
            parsed = parsePuzzleSolutionBook(json);
            if (parsed && Object.keys(parsed).length > 0) {
                break;
            }
        } catch (err) {
            console.warn(`Failed to load puzzle solution book ${filePath}:`, err);
        }
    }

    if (!parsed || Object.keys(parsed).length === 0) {
        throw new Error('無法載入引擎解答資料。');
    }

    puzzleSolutionBook = parsed;
    return puzzleSolutionBook;
}

function getCurrentPuzzleExpectedMove() {
    if (!puzzleModeActive || !currentPuzzleSolution || !Array.isArray(currentPuzzleSolution.moves)) {
        return null;
    }
    return currentPuzzleSolution.moves[puzzleStepIndex] || null;
}

function validatePuzzlePlayerMove(move) {
    if (!puzzleModeActive || !currentPuzzleSolution) {
        return true;
    }

    if (currentPlayer !== playerColor) {
        return true;
    }

    const expectedMove = getCurrentPuzzleExpectedMove();
    if (!expectedMove) {
        showNotification('puzzle_solution_exhausted');
        return false;
    }

    const actualMove = moveToPgn(move).toLowerCase();
    if (actualMove !== expectedMove) {
        showNotification('puzzle_step_wrong');
        return false;
    }

    puzzleStepIndex += 1;
    showNotification('puzzle_step_correct');
    return true;
}