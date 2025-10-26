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
const piecePalette = document.getElementById('piece-palette');
const startPlayerSelect = document.getElementById('start-player-select');
const pveColorSelect = document.getElementById('pve-color-select');
const ROWS = 10, COLS = 9;
let boardState = [], selectedPiece = null, currentPlayer = 'red', validMoves = [], gameEnded = false, isAiThinking = false;
let gameMode = 'pvp', playerColor = 'red', aiColor = 'black', aiDifficulty = 'easy', customElo = 1300;
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

// --- Sound Effects ---
const sounds = {
    capture: new Audio('sounds/吃.mp3'),
    check: new Audio('sounds/將軍.mp3'),
    another_check: new Audio('sounds/再將.mp3'),
    continue_check: new Audio('sounds/繼續將.mp3')
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
            }
        };

        ws.onclose = (event) => {
            console.log(`[Script.js] WebSocket disconnected. Code: ${event.code}, Reason: ${event.reason}`);
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

    
});

function setupMode(mode) {
    const bgm = document.getElementById('bgm');
    if (bgm.paused) {
        bgm.play().catch(e => console.error("BGM play failed:", e));
    }
    gameMode = mode;
    document.querySelector('.mode-selection').classList.add('hidden');
    if (mode === 'pvp') {
        startGame('pvp');
    } else { // PVE
        document.getElementById('difficulty-selection').classList.remove('hidden');
    }
}
function selectDifficulty(level) {
    aiDifficulty = level;
    document.getElementById('difficulty-selection').classList.add('hidden');
    if (level === 'custom') {
        document.getElementById('custom-difficulty-selection').classList.remove('hidden');
    } else {
        document.querySelector('.color-selection').classList.remove('hidden');
    }
}

function confirmCustomDifficulty() {
    const input = document.getElementById('elo-input');
    const eloValue = parseInt(input.value, 10);
    if (isNaN(eloValue) || eloValue < 1280 || eloValue > 3133) {
        showNotification("invalid_elo");
        return;
    }
    customElo = eloValue;
    document.getElementById('custom-difficulty-selection').classList.add('hidden');
    document.querySelector('.color-selection').classList.remove('hidden');
}

function startPveGame() { const selectedColor = pveColorSelect.value; startGame('pve', selectedColor); }
function startGame(mode, pColor = 'red', customSetup = null) {
    gameMode = mode; playerColor = pColor; aiColor = (playerColor === 'red') ? 'black' : 'red';
    startScreen.classList.add('hidden'); setupContainer.classList.add('hidden'); gameContainer.classList.remove('hidden');
    initGame(customSetup);
}
function initGame(customSetup = null) {
    if (customSetup) { boardState = customSetup.board; currentPlayer = customSetup.player; } else { boardState = initialBoard.map(row => [...row]); currentPlayer = 'red'; }
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
        if (inCheck) { endgameTitle.textContent = translations.checkmate; } else { endgameTitle.textContent = translations.stalemate; }
        checkmateOverlay.classList.remove('hidden');
        const winner = currentPlayer === 'red' ? translations.black_wins : translations.red_wins;
        winnerMessage.textContent = winner;
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

function renderBoard(boardElement, boardData = boardState, interactionHandler = onSquareClick) {
    boardElement.innerHTML = '';
    for (let disp_r = 0; disp_r < ROWS; disp_r++) {
        for (let disp_c = 0; disp_c < COLS; disp_c++) {
            const r = boardFlipped ? ROWS - 1 - disp_r : disp_r;
            const c = boardFlipped ? COLS - 1 - disp_c : disp_c;

            const square = document.createElement('div');
            square.classList.add('square');
            square.dataset.r = disp_r; 
            square.dataset.c = disp_c;
            square.addEventListener('click', () => interactionHandler(disp_r, disp_c));
            
            const pieceCode = boardData[r][c];
            if (pieceCode) {
                const pieceInfo = getPieceInfo(pieceCode);
                const pieceElement = document.createElement('div');
                pieceElement.classList.add('piece');
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

                if (boardElement === board && isKingInCheck(boardState, pieceInfo.color) && pieceInfo.type === 'K') {
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

    if (boardState[to.r][to.c]) { 
        if (!isCheckAfterMove) {
            playSound('capture');
        }
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
        
        if (isCheckAfterMove) {
            const historyLen = moveHistory.length;
            const lastPlayerMove = (historyLen >= 3) ? moveHistory[historyLen - 3] : null;
            const secondLastPlayerMove = (historyLen >= 5) ? moveHistory[historyLen - 5] : null;

            if (secondLastPlayerMove && secondLastPlayerMove.isCheck && lastPlayerMove && lastPlayerMove.isCheck) {
                playSound('continue_check');
            } else if (lastPlayerMove && lastPlayerMove.isCheck) {
                playSound('another_check');
            } else {
                playSound('check');
            }
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
    undoBtn.disabled = true; // Disable undo button when viewing the final board
}

// --- Custom Setup Logic ---
function showSetupScreen() { 
    const bgm = document.getElementById('bgm');
    if (bgm.paused) {
        bgm.play().catch(e => console.error("BGM play failed:", e));
    }
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
    document.getElementById('custom-pve-overlay').classList.remove('hidden');
}

function confirmCustomPveStart() {
    const playerChoice = document.getElementById('custom-pve-color-select-popup').value;
    const selectedDifficulty = document.getElementById('custom-pve-difficulty-select-popup').value;
    
    aiDifficulty = selectedDifficulty;

    if (aiDifficulty === 'custom') {
        const input = document.getElementById('custom-pve-elo-input');
        const eloValue = parseInt(input.value, 10);
        if (isNaN(eloValue) || eloValue < 1280 || eloValue > 3133) {
            showNotification("invalid_elo");
            return;
        }
        customElo = eloValue;
    }

    const startPlayer = startPlayerSelect.value;
    const customSetup = { board: customBoardState.map(row => [...row]), player: startPlayer };
    document.getElementById('custom-pve-overlay').classList.add('hidden');
    startGame('pve', playerChoice, customSetup);
}

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


// Helper to convert board state to FEN
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
                fen += pieceInfo.color === 'red' ? pieceInfo.type.toUpperCase() : pieceInfo.type.toLowerCase();
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
    fen += ` ${player.charAt(0)} - - 0 1`;
    return fen;
}

// Helper to get movetime based on difficulty
function getMovetimeForDifficulty(difficulty) {
    switch (difficulty) {
        case 'easy':
        case 'medium':
        case 'hard':
        case 'expert':
        case 'custom':
            return 3000;
        default:
            return 3000;
    }
}

function makeAiMove() {
    isAiThinking = true;
    statusDisplay.textContent = translations.ai_thinking;
    undoBtn.disabled = true;

    const fen = boardToFen(boardState, currentPlayer);
    const payload = {
        type: 'getmove',
        fen: fen,
        movetime: getMovetimeForDifficulty(aiDifficulty),
        difficulty: aiDifficulty
    };

    if (aiDifficulty === 'custom') {
        payload.customElo = customElo;
    }

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
    for (let i = 0; i < notationHistory.length; i += 2) {
        const moveNumber = Math.floor(i / 2) + 1;
        const redMove = notationHistory[i];
        const blackMove = notationHistory[i + 1] || '';

        const moveElement = document.createElement('div');
        moveElement.classList.add('notation-entry');

        const numberSpan = document.createElement('span');
        numberSpan.classList.add('move-number');
        numberSpan.textContent = `${moveNumber}. `;

        const redMoveSpan = document.createElement('span');
        redMoveSpan.classList.add('red-move');
        redMoveSpan.textContent = redMove + ' ';

        const blackMoveSpan = document.createElement('span');
        blackMoveSpan.classList.add('black-move');
        blackMoveSpan.textContent = blackMove;

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
                fen += pieceInfo.color === 'red' ? pieceInfo.type.toUpperCase() : pieceInfo.type.toLowerCase();
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
    fen += ` ${player.charAt(0)} - - 0 1`;
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
    const pgnString = generatePgnString();
    const blob = new Blob([pgnString], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'game.pgn';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
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
    const blob = new Blob([text.trim()], { type: 'text/plain;charset=utf-8' });
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