[English](#english) | [繁體中文](#繁體中文)

---
<a name="english"></a>

# Chinese Chess (Xiangqi)

[![made-by-augus](https://img.shields.io/badge/made%20by-Augus-blue.svg)](https://github.com/imlindora)

This is a desktop Chinese Chess (Xiangqi) application built with Electron and the Pikafish Xiangqi engine.

*(This is a sample screenshot. You are encouraged to replace it with an actual screenshot of your application.)*

### Project Status: Archived

Hello everyone, I'm Augus, the developer of this project.

This is a project I completed during my summer break between elementary and junior high school, with the assistance of the Gemini CLI. As the new school year begins, my studies will become more demanding, and I will no longer have sufficient time to maintain or update this project.

I have decided to archive this project and make the source code available, hoping it might be helpful or inspiring to others who are also learning to code.

A huge thank you to everyone who has shown interest in this project!

### ✨ Features

*   **Powerful AI Engine**: Integrated with the specialized [Pikafish for Xiangqi](https://github.com/official-pikafish/Pikafish) engine for a challenging gameplay experience.
*   **Cross-Platform Support**: Runs on both Windows and Linux.
*   **Smart Performance Optimization**: The application automatically detects your CPU architecture to enable the corresponding optimized engine version.
*   **Multi-language Support**: Includes interfaces in Traditional Chinese, Simplified Chinese, English, and Vietnamese.
*   **Game Sound Effects**: Includes sound effects for actions like "check" and "capture" to enhance immersion.

### 🛠️ Tech Stack

*   **Application Framework**: [Electron](https://www.electronjs.org/)
*   **Backend Environment**: [Node.js](https://nodejs.org/)
*   **Communication**: [Express](https://expressjs.com/) + [WebSocket](https://github.com/websockets/ws)
*   **Chess AI**: [Pikafish Xiangqi Engine](https://github.com/official-pikafish/Pikafish)

### 🚀 Installation and Usage

Want to run this project on your computer? Follow these steps:

1.  **Clone the repository**
    ```bash
    git clone https://github.com/imlindora/Chinese-chess.git
    ```

2.  **Navigate to the project directory**
    ```bash
    cd Chinese-chess
    ```

3.  **Install dependencies**
    ```bash
    npm install
    ```

4.  **Launch the application!**
    ```bash
    npm start
    ```

### 📦 Building the Application

If you want to package the project into a standalone executable, run the following command:

```bash
npm run build
```

The packaged files will appear in the `dist/` directory at the project root.

### ❤️ Acknowledgements

*   The core AI functionality of this project comes from the powerful open-source **Pikafish** engine team.
*   Thanks to the **Gemini CLI** for its assistance during the development process.

---
<a name="繁體中文"></a>

# 中華象棋 (Chinese Chess)

[![made-by-augus](https://img.shields.io/badge/made%20by-Augus-blue.svg)](https://github.com/imlindora)

這是一個使用 Electron 和 Pikafish 象棋引擎打造的桌面版中國象棋（Xiangqi）應用程式。

*(這是一個範例截圖，建議你換成自己應用程式的實際截圖)*

### 專案狀態：封存 (Archived)

大家好，我是本專案的開發者 Augus。

這是我在國小升國中的暑假期間，透過與 Gemini CLI 協作完成的專案。隨著開學，我即將成為一名國中生，課業將會變得更加繁重，因此我將沒有足夠的時間繼續維護和更新這個專案。

我決定將這個專案封存，並將原始碼開源，希望能對同樣在學習程式設計的朋友們有所幫助或啟發。

非常感謝所有關注這個專案的人！

### ✨ 功能特色

*   **強大的 AI 引擎**: 內建為象棋特製化的 [Pikafish](https://github.com/official-pikafish/Pikafish) 引擎，提供極具挑戰性的對弈體驗。
*   **跨平台支援**: 可在 Windows 和 Linux 系統上執行。
*   **智慧效能優化**: 應用程式會自動偵測你的 CPU 架構，並啟用對應的最佳化引擎版本。
*   **多國語言**: 內建繁體中文、簡體中文、英文、越南文等多種語言介面。
*   **遊戲音效**: 包含將軍、吃子等音效，增加遊戲沉浸感。

### 🛠️ 技術棧

*   **應用程式框架**: [Electron](https://www.electronjs.org/)
*   **後端環境**: [Node.js](https://nodejs.org/)
*   **通訊**: [Express](https://expressjs.com/) + [WebSocket](https://github.com/websockets/ws)
*   **象棋 AI**: [Pikafish Xiangqi Engine](https://github.com/official-pikafish/Pikafish)

### 🚀 安裝與執行

想在你的電腦上執行這個專案嗎？請依照以下步驟：

1.  **複製專案庫**
    ```bash
    git clone https://github.com/imlindora/Chinese-chess.git
    ```

2.  **進入專案目錄**
    ```bash
    cd Chinese-chess
    ```

3.  **安裝相依套件**
    ```bash
    npm install
    ```

4.  **啟動應用程式！**
    ```bash
    npm start
    ```

### 📦 打包應用程式

如果你想將專案打包成獨立的安裝檔，可以執行以下指令：

```bash
npm run build
```

打包完成後，對應平台的安裝檔會出現在根目錄下的 `dist/` 資料夾中。

### ❤️ 致謝

*   本專案的核心 AI 功能來自強大的 **Pikafish** 開源象棋引擎團隊。
*   感謝 **Gemini CLI** 在開發過程中提供的協助。

---