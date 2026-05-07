# Data Flow

## 全体像

```text
UI Action
  ↓
React Component
  ↓
src/utils/*.js
  ↓
window.api / window.nightOps
  ↓
Electron IPC
  ↓
main.js
  ↓
Filesystem / systeminformation / osascript
```

## ファイル読み込み

```text
FileTree / PreviewPane
  ↓ selectedFile.path
fileLoader.readFile(path)
  ↓
ipcRenderer.invoke("fs:read")
  ↓
main.js: readFileContent()
  ↓
fs.stat / fs.readFile
  ↓
renderer に内容を返す
```

補足:

- 非テキストはエラー扱い
- 5MB 以上の非 PDF は拒否
- CSV は renderer 側で最大 1000 行まで表示
- TREE の Finder ドロップは `File.path` を優先し、取れない場合は `FileReader` にフォールバックする

## ファイル変更監視

```text
PreviewPane
  ↓
watchFile(path)
  ↓
main.js: fs.watch(path)
  ↓
ファイル変更
  ↓
webContents.send("fs:file-changed", path)
  ↓
PreviewPane が再読込
```

TREE での変更操作:

- 内部 D&D は renderer 内で `moveFile(sourcePath, targetDirectoryPath)` を呼ぶ
- 外部取り込みは `copyFileToDirectory(sourcePath, rootPath)` または `FileReader` + `createFileFromBuffer()` を呼ぶ

## Codex ログ解析

```text
TopBar
  ↓
getCodexStats()
  ↓
ipcRenderer.invoke("codex:stats")
  ↓
main.js: readCodexHistory()
  ↓
~/.codex/history.jsonl の末尾だけを読む
  ↓
request / session / token を返す
```

## システム監視

```text
TopBar
  ↓
getSystemUsage()
  ↓
ipcRenderer.invoke("system:usage")
  ↓
systeminformation.currentLoad / mem
  ↓
CPU / MEM を返す
```
