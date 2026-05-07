# Architecture

## 全体構成

NightOps は Electron の main process と React の renderer process で構成されています。

- `electron/main.js`: OS 操作、ファイルアクセス、IPC の受け口
- `electron/preload.js`: renderer に安全な API を公開
- `src/`: React UI

```text
Renderer (React)
  ↓ window.api / window.nightOps
Preload
  ↓ ipcRenderer.invoke / on
Main (Electron)
  ↓
Filesystem / osascript / systeminformation
```

## ディレクトリ構造

```text
electron/
  main.js        Electron main process
  preload.js     Renderer に公開するブリッジ

src/
  App.jsx        全体レイアウトと主要 state
  main.jsx       React 起動点
  styles.css     全体スタイル
  components/
    TopBar.jsx      上部メトリクス表示
    FileTree.jsx    ツリー表示
    PreviewPane.jsx プレビューと編集
    LaunchPanel.jsx Codex CLI 起動 UI
  utils/
    fileLoader.js   preload API ラッパー
    codexLog.js     Codex 統計取得ラッパー
    system.js       systeminformation 取得ラッパー
```

## 各主要ファイルの役割

- `src/App.jsx`
  - 画面全体を組み立てる
  - root directory、選択中ファイル、通知、Launch 開閉を管理する
- `src/components/FileTree.jsx`
  - ディレクトリを階層表示する
  - 展開時のみ子要素を遅延読み込みする
  - 複数選択、右クリック、コピー / カット / ペースト、内部 D&D を扱う
- `src/components/PreviewPane.jsx`
  - 選択中ファイルを表示する
  - テキスト編集、保存、ファイル監視、最近開いたファイルを扱う
- `src/components/LaunchPanel.jsx`
  - Codex CLI 実行パラメータを受け取って Launch する
- `electron/main.js`
  - ファイル操作
  - 設定ファイル読み書き
  - `history.jsonl` 集計
  - `Terminal.app` 起動
  - `fs.watch` 管理
  - Finder からの外部ドロップを renderer に転送する

## preload / main / renderer の関係

### main

Node API と OS API を直接扱います。renderer は直接 `fs` や `child_process` を使いません。

### preload

`contextBridge.exposeInMainWorld("api", ...)` と `contextBridge.exposeInMainWorld("nightOps", ...)` で必要な関数だけを公開します。
Finder の外部ドロップは `electronAPI.onExternalDrop()` で renderer に橋渡しします。

### renderer

UI 側は `window.nightOps` を直接触らず、`src/utils/*.js` の薄いラッパー経由で使います。これにより UI 実装と Electron API の境界を保っています。
現状は `window.api` も同じ内容を持ち、既存コードとの互換のために両方を公開しています。
