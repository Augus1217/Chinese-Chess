# Flathub 上架指南

## 1. 準備工作

Flathub 要求使用 Manifest 檔案來定義如何建置您的應用程式。我們採用「重新打包 .deb」的方式，這是 Electron 應用程式最常見的做法。

### 檔案說明
*   `io.github.augus1217.ChineseChess.yml`: Flatpak Manifest 檔案。
*   `chinese-chess.sh`: 啟動腳本，負責設定 Electron 所需的沙盒環境 (Zypak)。

## 2. 提交前的修改

在提交給 Flathub 之前，您需要編輯 `io.github.augus1217.ChineseChess.yml`：

1.  **確認 URL**: 確保 `url` 指向您 GitHub Release 中最新版本的 `.deb` 檔案。
2.  **計算 SHA256**: 下載該 `.deb` 檔案並計算其雜湊值。
    ```bash
    sha256sum chinese-chess-by-augus_1.5.0_amd64.deb
    ```
3.  **填入 SHA256**: 將計算出的字串填入 yml 檔案中的 `sha256` 欄位。

## 3. 本地測試 (選擇性)

如果您安裝了 `flatpak-builder`，可以在本地測試建置：

```bash
# 安裝必要的 Runtime
flatpak install flathub org.freedesktop.Platform//23.08 org.freedesktop.Sdk//23.08

# 建置
flatpak-builder --user --install --force-clean build-dir flathub/io.github.augus1217.ChineseChess.yml

# 執行
flatpak run io.github.augus1217.ChineseChess
```

## 4. 提交到 Flathub

1.  前往 [Flathub GitHub](https://github.com/flathub/flathub) 並 Fork 專案 (或者直接在 Flathub 網站上尋找 "Submit an app")。
2.  實際上，Flathub 現在推薦直接提交一個新的 Repository。
    *   登入 GitHub。
    *   前往 [Flathub New App](https://github.com/flathub/flathub/issues/new?assignees=&labels=new-application&template=new-application.yml&title=New+Application%3A+%3CAppId%3E)。
    *   填寫 Issue，標題為 `New Application: io.github.augus1217.ChineseChess`。
    *   在內容中提供您的 Manifest 連結 (您可以先將 `flathub/` 資料夾中的內容推送到您的 GitHub Repo)。
3.  Flathub 的機器人會引導您建立專屬的 Repository (例如 `flathub/io.github.augus1217.ChineseChess`)。
4.  您將 Manifest 檔案推送到該 Repo 後，Flathub 的 CI 會自動建置並發布。

## 注意事項

*   **CPU Features**: Manifest 中已包含 `chmod +x` 指令，確保 `api/cpu_features_linux` 在 Flatpak 中有執行權限。
*   **App ID**: 我們使用了 `io.github.augus1217.ChineseChess`。建議您未來在 `package.json` 的 `build.appId` 也統一使用此 ID，雖然不強制，但能保持一致性。
