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
const piecePalette = document.getElementById('piece-palette');
const startPlayerSelect = document.getElementById('start-player-select');
const pveColorSelect = document.getElementById('pve-color-select');
const ROWS = 10, COLS = 9;
let boardState = [], selectedPiece = null, currentPlayer = 'red', validMoves = [], gameEnded = false, isAiThinking = false;
let gameMode = 'pvp', playerColor = 'red', aiColor = 'black', aiDifficulty = 'easy', customMovetime = 100;
let moveHistory = []; 
let pieceToPlace = null;
let customBoardState = [];
let pieceCounts = {};
let pieceToMove = null;

// --- Data & Tables ---
const initialBoard = [
    ['bR', 'bN', 'bB', 'bA', 'bK', 'bA', 'bB', 'bN', 'bR'], [null, null, null, null, null, null, null, null, null], [null, 'bC', null, null, null, null, null, 'bC', null], ['bP', null, 'bP', null, 'bP', null, 'bP', null, 'bP'], [null, null, null, null, null, null, null, null, null],
    [null, null, null, null, null, null, null, null, null], ['rP', null, 'rP', null, 'rP', null, 'rP', null, 'rP'], [null, 'rC', null, null, null, null, null, 'rC', null], [null, null, null, null, null, null, null, null, null], ['rR', 'rN', 'rB', 'rA', 'rK', 'rA', 'rB', 'rN', 'rR']
];
const pieceNames = { 'r': { 'K': '帥', 'A': '仕', 'B': '相', 'N': '傌', 'R': '俥', 'C': '炮', 'P': '兵' }, 'b': { 'K': '將', 'A': '士', 'B': '象', 'N': '馬', 'R': '車', 'C': '包', 'P': '卒' } };

const PST_A = Array(10).fill().map(() => Array(9).fill(0));
PST_A[7][3] = PST_A[7][5] = PST_A[9][3] = PST_A[9][5] = 1; PST_A[8][4] = 3;
const PST_E = Array(10).fill().map(() => Array(9).fill(0)); // Corresponds to 'B' for Bishop/Elephant
PST_E[5][2] = PST_E[5][6] = PST_E[7][0] = PST_E[7][4] = PST_E[7][8] = 2;
const PST_K = Array(10).fill().map(() => Array(9).fill(0));
PST_K[7][4] = PST_K[9][4] = 1; PST_K[8][3] = PST_K[8][5] = 2;

const PST = { 'P': [ [0,0,0,0,0,0,0,0,0], [0,0,0,0,0,0,0,0,0], [0,0,0,0,0,0,0,0,0], [7,7,7,7,7,7,7,7,7], [15,15,15,15,15,15,15,15,15], [20,25,28,30,32,30,28,25,20], [25,30,33,35,38,35,33,30,25], [30,35,40,45,50,45,40,35,30], [35,40,48,55,60,55,48,40,35], [80,85,90,100,120,100,90,85,80] ], 'C': [ [1,1,0,-2,-2,-2,0,1,1], [1,1,0,-1,-1,-1,0,1,1], [1,1,1,0,0,0,1,1,1], [2,2,3,4,5,4,3,2,2], [3,3,4,5,6,5,4,3,3], [4,4,5,6,7,6,5,4,4], [5,5,6,7,8,7,6,5,5], [6,6,6,8,9,8,6,6,6], [7,7,6,8,9,8,6,7,7], [6,7,6,7,8,7,6,7,6] ], 'N': [ [0,-2,0,0,0,0,0,-2,0], [0,0,4,6,8,6,4,0,0], [2,4,8,10,12,10,8,4,2], [4,6,10,12,14,12,10,6,4], [6,8,12,14,16,14,12,8,6], [4,6,10,12,14,12,10,6,4], [2,4,8,10,12,10,8,4,2], [4,2,80,60,100,60,80,2,4], [0,0,4,8,80,8,4,0,0], [0,-2,0,4,0,4,0,-2,0] ], 'R': [ [6,6,6,6,80,6,6,6,6], [8,10,10,10,12,10,10,10,8], [8,10,10,11,12,11,10,10,8], [8,10,11,12,14,12,11,10,8], [10,12,12,14,15,14,12,12,10], [12,14,14,15,16,15,14,14,12], [12,14,14,15,16,15,14,14,12], [10,12,12,14,15,14,12,12,10], [8,10,10,11,12,11,10,10,8], [80,10,10,10,12,10,10,10,80] ], 'A': PST_A, 'B': PST_E, 'K': PST_K };

// --- Game Setup & Core Logic ---
document.addEventListener('DOMContentLoaded', () => {
    // Main screen sliders
    const slider = document.getElementById('movetime-slider');
    const input = document.getElementById('movetime-input');
    if (slider && input) {
        slider.addEventListener('input', (e) => { input.value = e.target.value; });
        input.addEventListener('input', (e) => { slider.value = e.target.value; });
    }

    // Custom PVE popup sliders
    const customPveSlider = document.getElementById('custom-pve-movetime-slider');
    const customPveInput = document.getElementById('custom-pve-movetime-input');
    if (customPveSlider && customPveInput) {
        customPveSlider.addEventListener('input', (e) => { customPveInput.value = e.target.value; });
        customPveInput.addEventListener('input', (e) => { customPveSlider.value = e.target.value; });
    }

    // Custom PVE difficulty dropdown
    const customPveDifficultySelect = document.getElementById('custom-pve-difficulty-select-popup');
    if (customPveDifficultySelect) {
        customPveDifficultySelect.addEventListener('change', (e) => {
            document.getElementById('custom-pve-movetime-wrapper').classList.toggle('hidden', e.target.value !== 'custom');
        });
    }
});

function setupMode(mode) {
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
    const input = document.getElementById('movetime-input');
    customMovetime = parseInt(input.value, 10);
    if (isNaN(customMovetime) || customMovetime < 1 || customMovetime > 500) {
        alert("請輸入1到500之間的有效數字！");
        return;
    }
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
    selectedPiece = null; validMoves = []; gameEnded = false; isAiThinking = false; moveHistory = []; undoBtn.disabled = true;
    statusDisplay.textContent = `${currentPlayer === 'red' ? '紅方' : '黑方'}回合`;
    renderBoard(board);
    checkForEndOfGame();
    if (!gameEnded && gameMode === 'pve' && currentPlayer === aiColor) {
        isAiThinking = true; undoBtn.disabled = true; statusDisplay.textContent = 'AI思考中...'; setTimeout(makeAiMove, 100);
    }
}
function getPieceInfo(piece) {
    if (piece === null || typeof piece !== 'string' || piece.length < 2) {
        return null; 
    }
    const colorChar = piece.charAt(0);
    const type = piece.charAt(1);
    if (!pieceNames[colorChar] || !pieceNames[colorChar][type]) {
        return null;
    }
    const color = colorChar === 'r' ? 'red' : 'black';
    const name = pieceNames[colorChar][type];
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
    for (let i = moveHistory.length - 2; i >= 0; i -= 2) {
        const historyEntry = moveHistory[i];
        if (historyEntry.player !== player || !historyEntry.isCheck) {
            break;
        }
        const historicPieceCode = historyEntry.board[historyEntry.move.from.r][historyEntry.move.from.c];
        if (historicPieceCode === pieceCode) {
            consecutiveCount++;
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
        if (inCheck) { endgameTitle.textContent = "絕殺"; } else { endgameTitle.textContent = "困斃"; }
        checkmateOverlay.classList.remove('hidden');
        winnerMessage.textContent = `${currentPlayer === 'red' ? '黑方' : '紅方'}獲勝！`;
    }
}

// --- UI, Animation, and Undo ---
function renderBoard(boardElement, boardData = boardState, interactionHandler = onSquareClick) {
    boardElement.innerHTML = '';
    for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
            const square = document.createElement('div');
            square.classList.add('square');
            square.dataset.r = r; square.dataset.c = c;
            square.addEventListener('click', () => interactionHandler(r, c));
            const pieceCode = boardData[r][c];
            if (pieceCode) {
                const pieceInfo = getPieceInfo(pieceCode);
                const pieceElement = document.createElement('div');
                pieceElement.classList.add('piece');
                const img = document.createElement('img');
                const imgName = pieceCode.charAt(0) + '_' + pieceCode.charAt(1).toLowerCase() + '.png';
                img.src = 'images/' + imgName;
                img.alt = pieceInfo.name;
                pieceElement.appendChild(img);
                square.appendChild(pieceElement);
                if (boardElement === board && isKingInCheck(boardState, pieceInfo.color) && pieceInfo.type === 'K') { pieceElement.classList.add('in-check'); }
                if (boardElement === setupBoard && pieceToMove && r === pieceToMove.r && c === pieceToMove.c) { pieceElement.classList.add('selected');}
            }
            if (boardElement === board && validMoves.some(move => move.to.r === r && move.to.c === c)) {
                const moveIndicator = document.createElement('div');
                moveIndicator.classList.add('valid-move-indicator');
                if (boardData[r][c]) moveIndicator.style.backgroundColor = "rgba(255, 0, 0, 0.4)";
                square.appendChild(moveIndicator);
            }
            boardElement.appendChild(square);
        }
    }
     if (boardElement === board && selectedPiece) { boardElement.children[selectedPiece.r * COLS + selectedPiece.c]?.querySelector('.piece')?.classList.add('selected'); }
}

function onSquareClick(r, c) {
    if (gameEnded || isAiThinking || (gameMode === 'pve' && currentPlayer === aiColor)) return;

    const clickedPieceInfo = getPieceInfo(boardState[r][c]);

    // If a piece is selected
    if (selectedPiece) {
        const isSamePiece = selectedPiece.r === r && selectedPiece.c === c;
        const isValidMove = validMoves.find(m => m.to.r === r && m.to.c === c);

        // 1. Clicked on a valid move square
        if (isValidMove) {
            if (isRepetitiveCheckViolation(isValidMove, boardState, currentPlayer)) {
                alert("違反規則：不能使用同一棋子連續將軍超過五次！");
                return;
            }
            animateAndMovePiece(isValidMove.from, isValidMove.to);
            return; // Action complete
        }

        // 2. Clicked on the same piece again (deselect)
        if (isSamePiece) {
            selectedPiece = null;
            validMoves = [];
            renderBoard(board); // Render to remove highlights
            return;
        }

        // 3. Clicked on another of your own pieces (switch selection)
        if (clickedPieceInfo && clickedPieceInfo.color === currentPlayer) {
            selectPiece(r, c); // selectPiece calls renderBoard
            return;
        }

        // 4. Clicked on an empty square or opponent piece (deselect)
        selectedPiece = null;
        validMoves = [];
        renderBoard(board); // Render to remove highlights

    } else { // No piece is selected
        // 5. Clicked on your own piece (select it)
        if (clickedPieceInfo && clickedPieceInfo.color === currentPlayer) {
            selectPiece(r, c); // selectPiece calls renderBoard
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
    moveHistory.push({
        board: boardBeforeMove,
        player: playerBeforeMove,
        move: { from, to },
        isCheck: isCheckAfterMove
    });
    undoBtn.disabled = isAiThinking;
    const fromSquare = board.children[from.r * COLS + from.c];
    const toSquare = board.children[to.r * COLS + to.c];
    const pieceElement = fromSquare.querySelector('.piece');
    if (!pieceElement) return;
    const fromRect = fromSquare.getBoundingClientRect(); const toRect = toSquare.getBoundingClientRect();
    const movingPiece = pieceElement.cloneNode(true); movingPiece.classList.add('moving-piece'); document.body.appendChild(movingPiece);
    movingPiece.style.left = `${fromRect.left}px`; movingPiece.style.top = `${fromRect.top}px`;
    pieceElement.classList.add('is-moving');
    selectedPiece = null; validMoves = []; renderBoard(board); 
    if (boardState[to.r][to.c]) { const effect = document.createElement('div'); effect.classList.add('capture-effect-standalone'); document.body.appendChild(effect); effect.style.left = `${toRect.left + toRect.width / 2}px`; effect.style.top = `${toRect.top + toRect.height / 2}px`; setTimeout(() => effect.remove(), 400); }
    requestAnimationFrame(() => { movingPiece.style.transform = `translate(${toRect.left - fromRect.left}px, ${toRect.top - fromRect.top}px)`; });
    movingPiece.addEventListener('transitionend', () => {
        movingPiece.remove();
        boardState[to.r][to.c] = boardState[from.r][from.c]; boardState[from.r][from.c] = null;
        currentPlayer = (currentPlayer === 'red') ? 'black' : 'red';
        statusDisplay.textContent = `${currentPlayer === 'red' ? '紅方' : '黑方'}回合`;
        renderBoard(board); 
        checkForEndOfGame();
        if (!gameEnded && gameMode === 'pve' && currentPlayer === aiColor) {
            isAiThinking = true; undoBtn.disabled = true; statusDisplay.textContent = 'AI思考中...'; setTimeout(makeAiMove, 100);
        }
    }, { once: true });
}

function undoMove() {
    if (isAiThinking || moveHistory.length === 0) return;
    const statesToPop = (gameMode === 'pve' && moveHistory.length >= 2) ? 2 : 1;
    let lastState;
    for (let i = 0; i < statesToPop; i++) {
        lastState = moveHistory.pop();
    }
    if (lastState) {
        boardState = lastState.board;
        currentPlayer = lastState.player;
        gameEnded = false;
        checkmateOverlay.classList.add('hidden');
        selectedPiece = null;
        validMoves = [];
        statusDisplay.textContent = `${currentPlayer === 'red' ? '紅方' : '黑方'}回合`;
        renderBoard(board);
    }
    undoBtn.disabled = moveHistory.length === 0;
}

function hideCheckmateOverlay() {
    document.getElementById('checkmate-overlay').classList.add('hidden');
    undoBtn.disabled = true; // Disable undo button when viewing the final board
}

// --- Custom Setup Logic ---
function showSetupScreen() { startScreen.classList.add('hidden'); setupContainer.classList.remove('hidden'); clearSetupBoard(); populatePalette(); }
function populatePalette() { piecePalette.innerHTML = ''; const pieces = ['rK','rA','rB','rN','rR','rC','rP', 'bK','bA','bB','bN','bR','bC','bP']; pieces.forEach(code => { const pieceInfo = getPieceInfo(code); const pieceElement = document.createElement('div'); pieceElement.classList.add('piece'); const img = document.createElement('img'); const imgName = code.charAt(0) + '_' + code.charAt(1).toLowerCase() + '.png'; img.src = 'images/' + imgName; img.alt = pieceInfo.name; pieceElement.appendChild(img); pieceElement.dataset.pieceCode = code; pieceElement.addEventListener('click', () => selectPieceForPlacement(code, pieceElement)); piecePalette.appendChild(pieceElement); }); }
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
                alert("不合理的棋子位置！");
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
                alert("不合理的棋子位置或數量超出限制！");
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
        case 'K': case 'A':
            if (c < 3 || c > 5) return false;
            if (info.color === 'red' && r < 7) return false;
            if (info.color === 'black' && r > 2) return false;
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
        alert("局面必須包含且僅包含一個帥和一個將！");
        return;
    }
    if (isKingInCheck(customBoardState, 'red')) {
        alert("開局時，紅方(帥)不能處於被將軍狀態！");
        return;
    }
    if (isKingInCheck(customBoardState, 'black')) {
        alert("開局時，黑方(將)不能處於被將軍狀態！");
        return;
    }
    document.getElementById('custom-pve-overlay').classList.remove('hidden');
}

function confirmCustomPveStart() {
    const playerChoice = document.getElementById('custom-pve-color-select-popup').value;
    const selectedDifficulty = document.getElementById('custom-pve-difficulty-select-popup').value;
    
    aiDifficulty = selectedDifficulty;

    if (aiDifficulty === 'custom') {
        const input = document.getElementById('custom-pve-movetime-input');
        customMovetime = parseInt(input.value, 10);
        if (isNaN(customMovetime) || customMovetime < 1 || customMovetime > 500) {
            alert("請輸入1到500之間的有效數字！");
            return;
        }
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
    if (redKingCount !== 1 || blackKingCount !== 1) { alert("局面必須包含且僅包含一個帥和一個將！"); return; }

    if (isKingInCheck(customBoardState, 'red')) {
        alert("開局時，紅方(帥)不能處於被將軍狀態！");
        return;
    }
    if (isKingInCheck(customBoardState, 'black')) {
        alert("開局時，黑方(將)不能處於被將軍狀態！");
        return;
    }
    const startPlayer = startPlayerSelect.value;
    const customSetup = { board: customBoardState.map(row => [...row]), player: startPlayer };
    startGame('pvp', 'red', customSetup); // pColor doesn't matter much in pvp
}

// WebSocket connection
const ws = new WebSocket('ws://localhost:3000'); // Assuming server runs on port 3000

ws.onopen = () => {
    console.log('WebSocket connected.');
};

ws.onmessage = (event) => {
    const message = JSON.parse(event.data);
    console.log('Message from server:', message);

    if (message.type === 'engineMove') {
        console.log('Engine move received:', message.move);
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

        isAiThinking = false;
        undoBtn.disabled = (moveHistory.length === 0);
        statusDisplay.textContent = `${currentPlayer === 'red' ? '紅方' : '黑方'}回合`; // Restore status

        animateAndMovePiece(move.from, move.to);

    } else if (message.type === 'error') {
        console.error('Server error:', message.data);
        alert('Server error: ' + message.data);
        isAiThinking = false;
        statusDisplay.textContent = "AI錯誤，請刷新頁面";
    }
};

ws.onclose = () => {
    console.log('WebSocket disconnected.');
};

ws.onerror = (error) => {
    console.error('WebSocket error:', error);
};

// Helper to convert board state to FEN
function boardToFen(board, player) {
    const fenMap = {
        'rK': 'K', 'rA': 'A', 'rB': 'B', 'rN': 'N', 'rR': 'R', 'rC': 'C', 'rP': 'P',
        'bK': 'k', 'bA': 'a', 'bB': 'b', 'bN': 'n', 'bR': 'r', 'bC': 'c', 'bP': 'p'
    };
    let fen = '';
    for (let r = 0; r < ROWS; r++) {
        let rowFen = '';
        let emptyCount = 0;
        for (let c = 0; c < COLS; c++) {
            const piece = board[r][c];
            if (piece) {
                if (emptyCount > 0) {
                    rowFen += emptyCount;
                    emptyCount = 0;
                }
                rowFen += fenMap[piece] || ''; // Use the map
            } else {
                emptyCount++;
            }
        }
        if (emptyCount > 0) {
            rowFen += emptyCount;
        }
        fen += rowFen;
        if (r < ROWS - 1) {
            fen += '/';
        }
    }
    fen += ` ${player === 'red' ? 'w' : 'b'} - - 0 1`; // Standard FEN for player turn
    return fen;
}

// Helper to get movetime based on difficulty
function getMovetimeForDifficulty(difficulty) {
    switch (difficulty) {
        case 'easy': return 1;
        case 'medium': return 25;
        case 'hard': return 100;
        case 'expert': return 250;
        case 'custom': return customMovetime;
        default: return 25;
    }
}

function makeAiMove() {
    isAiThinking = true;
    statusDisplay.textContent = 'AI思考中...';
    undoBtn.disabled = true;

    // Convert boardState to FEN for the engine
    const fen = boardToFen(boardState, currentPlayer);

    ws.send(JSON.stringify({
        type: 'getmove',
        fen: fen,
        movetime: getMovetimeForDifficulty(aiDifficulty)
    }));
}