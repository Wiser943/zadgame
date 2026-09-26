const GRID_SIZE = 5;
const WIN_COUNT = 4;
const TURN_TIME_LIMIT = 10;

let board = Array(GRID_SIZE * GRID_SIZE).fill(null);
let currentPlayer = 0; // 0: P1(X), 1: P2(O), 2: P3(△), 3: P4(□)
let timeLeft = TURN_TIME_LIMIT;
let timerInterval = null;
let gameActive = true;

const players = [
    { name: "Player 1", symbol: "X", class: "p1", badge: "p1-active" },
    { name: "Player 2", symbol: "O", class: "p2", badge: "p2-active" },
    { name: "Player 3", symbol: "△", class: "p3", badge: "p3-active" },
    { name: "Player 4", symbol: "□", class: "p4", badge: "p4-active" }
];

const gridElement = document.getElementById('grid');
const playerIndicator = document.getElementById('player-indicator');
const timerBox = document.getElementById('timer-box');
const winOverlay = document.getElementById('win-overlay');
const victoryText = document.getElementById('victory-text');

// 1. Initialize Board Elements
function createBoard() {
    gridElement.innerHTML = '';
    for (let i = 0; i < GRID_SIZE * GRID_SIZE; i++) {
        const cell = document.createElement('div');
        cell.classList.add('cell');
        cell.dataset.index = i;
        cell.addEventListener('click', handleCellClick);
        gridElement.appendChild(cell);
    }
}

// 2. Handle Player Turn Movement
function handleCellClick(e) {
    const index = parseInt(e.target.dataset.index);

    if (board[index] !== null || !gameActive) return;

    makeMove(index);
}

function makeMove(index) {
    board[index] = currentPlayer;
    const cell = gridElement.children[index];
    cell.innerText = players[currentPlayer].symbol;
    cell.classList.add('taken', players[currentPlayer].class);

    const winningCombo = checkWin(index);
    if (winningCombo) {
        endGame(winningCombo);
        return;
    }

    if (board.every(cell => cell !== null)) {
        endGame(null); // Draw
        return;
    }

    nextPlayer();
}

function nextPlayer() {
    // Remove current badge style
    playerIndicator.classList.remove(players[currentPlayer].badge);
    
    // Advance player index
    currentPlayer = (currentPlayer + 1) % 4;
    
    // Apply new badge style & updates
    playerIndicator.classList.add(players[currentPlayer].badge);
    playerIndicator.innerText = `${players[currentPlayer].name} (${players[currentPlayer].symbol})`;
    
    resetTimer();
}

// 3. Automated Turn Timer Rules
function startTimer() {
    timeLeft = TURN_TIME_LIMIT;
    timerBox.innerText = `${timeLeft}s`;
    
    timerInterval = setInterval(() => {
        timeLeft--;
        timerBox.innerText = `${timeLeft}s`;

        if (timeLeft <= 0) {
            nextPlayer(); // Automatic skip when clock hits 0
        }
    }, 1000);
}

function resetTimer() {
    clearInterval(timerInterval);
    startTimer();
}

// 4. Algorithm checking for 4-in-a-row
function checkWin(lastIndex) {
    const row = Math.floor(lastIndex / GRID_SIZE);
    const col = lastIndex % GRID_SIZE;
    const target = board[lastIndex];

    // Setup movement vectors: [row_delta, col_delta]
    const directions = [,   // Horizontal,   // Vertical,   // Diagonal Down-Right
        [1, -1]   // Diagonal Up-Right
    ];

    for (let [dr, dc] of directions) {
        let matches = [lastIndex];

        // Check forward matching path
        let r = row + dr;
        let c = col + dc;
        while (r >= 0 && r < GRID_SIZE && c >= 0 && c < GRID_SIZE && board[r * GRID_SIZE + c] === target) {
            matches.push(r * GRID_SIZE + c);
            r += dr;
            c += dc;
        }

        // Check backward matching path
        r = row - dr;
        c = col - dc;
        while (r >= 0 && r < GRID_SIZE && c >= 0 && c < GRID_SIZE && board[r * GRID_SIZE + c] === target) {
            matches.push(r * GRID_SIZE + c);
            r -= dr;
            c -= dc;
        }

        if (matches.length >= WIN_COUNT) {
            return matches; // Return list of winning tile indices
        }
    }
    return null;
}

// 5. Game Over Configurations
function endGame(winningCombo) {
    gameActive = false;
    clearInterval(timerInterval);

    if (winningCombo) {
        winningCombo.forEach(idx => {
            gridElement.children[idx].classList.add('winning-cell');
        });
        victoryText.innerText = `${players[currentPlayer].name} Wins!`;
        victoryText.style.color = `var(--${players[currentPlayer].class}-color)`;
    } else {
        victoryText.innerText = "It's a Draw!";
        victoryText.style.color = "#ffffff";
    }

    setTimeout(() => {
        winOverlay.style.display = 'flex';
    }, 600);
}

function resetGame() {
    board.fill(null);
    gameActive = true;
    winOverlay.style.display = 'none';
    
    // Clean styles off standard grid cells
    Array.from(gridElement.children).forEach(cell => {
        cell.innerText = '';
        cell.className = 'cell';
    });

    playerIndicator.className = "player-badge p1-active";
    currentPlayer = 0;
    playerIndicator.innerText = `${players[currentPlayer].name} (${players[currentPlayer].symbol})`;

    resetTimer();
}

// Initialization triggers
createBoard();
startTimer();
