# API

## Electron IPC 一覧

`electron/main.js` で `ipcMain.handle` している主な API は以下です。

| Channel | 用途 |
| --- | --- |
| `system:usage` | CPU / メモリ取得 |
| `codex:stats` | Codex 履歴集計 |
| `settings:get` | 設定読込 |
| `settings:save` | 設定保存 |
| `fs:root` | 初期ディレクトリ取得 |
| `fs:list` | ディレクトリ一覧取得 |
| `fs:watch` | 現在表示中ファイルの監視開始 |
| `fs:unwatch` | 監視停止 |
| `fs:read` | ファイル読込 |
| `fs:save` | ファイル保存 |
| `fs:create-file` | ファイル作成 |
| `fs:create-file-from-buffer` | Buffer / ArrayBuffer からファイル作成 |
| `fs:create-directory` | フォルダ作成 |
| `fs:move` | ファイル/フォルダ移動 |
| `fs:copy-into` | 外部ファイル/フォルダを指定ディレクトリへコピー |
| `codex:launch` | Terminal 経由で Codex CLI 起動 |

イベント通知:

- `fs:file-changed`
  - main から renderer へ変更通知

## preload で公開している API

```js
window.nightOps = {
  getSystemUsage,
  getCodexStats,
  getSettings,
  saveSettings,
  getSystemStatus,
  browseDirectory,
  getRootDirectory,
  listDirectory,
  watchFile,
  unwatchFile,
  onFileChanged,
  readFile,
  saveFile,
  createFile,
  createFileFromBuffer,
  createDirectory,
  moveFile,
  copyFileToDirectory,
  revealFile,
  copyFilePath,
  launchCodex
}
```

`window.api` も同じ内容で公開しています。

補足:

- `electronAPI.onExternalDrop(paths)` は Finder からの外部ドラッグを renderer に渡すためのブリッジです
- `window.api` / `window.nightOps` は互換のため両方公開しています

## renderer → main の通信内容

### 設定

- `getSettings()`
- `saveSettings({ initialDirectory })`

### ファイル操作

- `listDirectory(dirPath)`
- `readFile(filePath)`
- `saveFile(filePath, content)`
- `createFile(directoryPath, nextName)`
- `createDirectory(directoryPath, nextName)`
- `moveFile(sourcePath, targetDirectoryPath)`
- `copyFileToDirectory(sourcePath, targetDirectoryPath)`
- `createFileFromBuffer(directoryPath, nextName, content)`
- `watchFile(filePath)`
- `unwatchFile()`

### 実行系

- `launchCodex({ directoryPath, model, promptTemplate })`

### 監視・集計

- `getSystemUsage()`
- `getCodexStats()`

## ファイル操作 API の戻り値

### `listDirectory`

```js
[
  {
    name: "App.jsx",
    path: "/path/to/App.jsx",
    type: "file"
  }
]
```

### `readFile`

```js
{
  path: "/path/to/file",
  name: "file.json",
  type: "json",
  mimeType: "text/plain",
  content: "...",
  editable: true
}
```

PDF の場合は `content` が base64 になります。

### `createFileFromBuffer`

```js
{
  path: "/path/to/file",
  name: "file.txt",
  directoryPath: "/path/to",
  type: "file"
}
```
