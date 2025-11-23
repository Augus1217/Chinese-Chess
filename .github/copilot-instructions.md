# Chinese Chess (Xiangqi) - AI Coding Instructions

## 1. Project Overview & Architecture
This is a desktop Chinese Chess application built with **Electron**, **Node.js**, and the **Pikafish** engine.

### High-Level Architecture
The app follows a 3-tier architecture:
1.  **Frontend (Renderer):** `public/` (HTML/CSS/JS). Handles UI, game logic, and board rendering. Communicates via WebSocket.
2.  **Backend (Main/Node):** `api/websocket.js` & `main.js`.
    *   `main.js`: Electron entry point. Detects CPU features to select the optimal engine binary. Starts the WebSocket server.
    *   `api/websocket.js`: Express server (serves static files) + WebSocket server. Spawns the Pikafish process and bridges messages between Frontend and Engine.
3.  **Engine:** `engine 20250627/`. Native Pikafish binaries (UCI protocol) optimized for various CPU architectures (AVX2, BMI2, etc.).

### Key Data Flows
*   **Move Generation:** User interaction -> `script.js` -> WebSocket -> `websocket.js` -> `stdin` -> Pikafish.
*   **Engine Response:** Pikafish `stdout` -> `websocket.js` -> WebSocket -> `script.js` -> UI Update.

## 2. Critical Files & Directories
*   `main.js`: App lifecycle, window management, and **CPU feature detection** logic.
*   `api/websocket.js`: The core bridge. Manages the engine process (`spawn`), handles paths (Dev vs. Prod), and routes WebSocket messages.
*   `public/script.js`: Massive frontend controller. Manages `boardState`, game rules, drag-and-drop, and i18n.
*   `public/lang/*.json`: Localization files (en, zh-CN, zh-TW, vi).
*   `engine 20250627/`: Contains Pikafish binaries and `pikafish.nnue`.
*   `api/cpu_features*`: Native utilities for detecting CPU capabilities.

## 3. Development Workflows
*   **Start Dev Server:** `npm start` (Runs `electron . --no-sandbox`).
*   **Build/Package:** `npm run build` (Uses `electron-builder`).
*   **Engine Selection Logic:**
    *   The app attempts to run `api/cpu_features` to get JSON output of supported features.
    *   It iterates through `enginePriority` in `main.js` (e.g., `vnni512`, `avx2`) to pick the best binary.
    *   **Snap Packages:** Special handling in `main.js` copies binaries to `SNAP_USER_DATA` to bypass execution restrictions.

## 4. Coding Conventions & Patterns

### Engine Integration
*   **Path Resolution:** Always use `initializePaths()` logic in `api/websocket.js` to distinguish between development (local folder) and production (bundled resources).
*   **Communication:** The frontend does *not* talk to the engine directly. It sends JSON messages over WebSocket.
    *   *Example:* `socket.send(JSON.stringify({ type: 'go', ... }))`

### Frontend (script.js)
*   **Board State:** `boardState` is a 10x9 array. Pieces are strings like `'rK'` (Red King), `'bC'` (Black Cannon). `null` for empty.
*   **I18n:** Use `data-i18n="key"` in HTML. `loadTranslations(lang)` in JS fetches JSON and updates the DOM.
*   **Sound:** `playSound('capture')` uses HTML5 Audio. Respect `soundEffectsEnabled`.

### Platform Specifics
*   **Linux/Snap:** Be aware of read-only file system constraints. `main.js` has specific workarounds.
*   **Windows:** `.exe` extensions are appended dynamically in path logic.

## 5. Common Tasks
*   **Adding a Language:** Create `public/lang/new-lang.json` and update `loadTranslations` fallback logic if needed.
*   **Updating Engine:** Place new binaries in `engine 20250627/` and update `enginePriority` in `main.js` if naming conventions change.
*   **UI Changes:** Modify `public/index.html` and `public/style.css`. Ensure `script.js` event listeners match new IDs.
