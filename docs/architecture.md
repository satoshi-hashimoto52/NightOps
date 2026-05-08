<!-- CREATED: true -->

# ARCHITECTURE

## システム構成

- Desktop App
- Electron Main Process
- Electron Preload
- React Renderer
- Local Filesystem
- OS Integration
- Codex History Source

## レイヤ構造

- Renderer
- UI、状態管理、表示制御

- Preload
- IPCラッパーの公開

- Main
- ファイル操作、設定保存、監視、OS連携

- External
- ローカルファイル、Terminal.app、Git、Codex履歴、システム情報

## コンポーネント構造

### Renderer

- `src/App.jsx`
- ルート状態
- 通知
- ルートディレクトリ切替
- Launch / Settings 開閉
- Codex リセット同期

- `src/components/TopBar.jsx`
- システム使用率表示
- Codex 利用状況表示
- 利用量履歴グラフ表示

- `src/components/FileTree.jsx`
- ツリー構築
- 遅延展開
- 複数選択
- コンテキストメニュー
- D&D
- 作成/削除/リネーム

- `src/components/PreviewPane.jsx`
- タブ管理
- 2ペイン管理
- ファイル読込
- プレビュー/編集
- Markdown表示
- PDF表示
- 画像表示

- `src/components/LaunchPanel.jsx`
- Codex CLI 起動入力

- `src/components/SettingsPanel.jsx`
- 外観設定
- 利用量設定
- リセット設定
- モデル設定

### Main

- `electron/main.js`
- IPCエンドポイント
- ファイル入出力
- ファイル監視
- Codex履歴集計
- Terminal起動
- Finder連携
- 設定読込/保存

- `electron/preload.js`
- Renderer へ公開する API ブリッジ

## データフロー

### 画面操作

- User Action
- React Component
- `src/utils/*`
- `window.api` / `window.nightOps`
- IPC
- Main Process
- OS / Filesystem

### ファイル読込

- ツリーまたはタブ選択
- `readFile(path)`
- `fs:read`
- Main が形式判定
- Renderer が形式ごとに表示

### ファイル保存

- エディタ編集
- `saveFile(path, content)`
- `fs:save`
- Main がUTF-8で保存

### 外部取り込み

- Finder/Open-file またはブラウザD&D
- パス取得可能時は `fs:copy-into`
- バイナリのみ取得時は `fs:create-file-from-buffer`

### ファイル監視

- アクティブタブ切替
- `fs:watch`
- Main が `fs.watch` を1本だけ保持
- 変更時に `fs:file-changed` を送信
- Renderer が再読込

### Codex 利用量

- TopBar / Settings が `codex:stats` を呼ぶ
- Main が `~/.codex/history.jsonl` を読む
- request数 / session数 / token推定値を返す
- Renderer が係数と分母で残量を算出する

## 状態管理構造

### Appレベル状態

- `rootPath`
- `selectedFile`
- `launchOpen`
- `settingsOpen`
- `settings`
- `systemStatus`
- `treeCollapsed`
- `sidebarWidth`
- `treeReloadToken`
- `notice`

### Treeレベル状態

- ツリー本体
- 展開状態
- 選択状態
- アクティブ行
- 警告行状態
- クリップボード状態
- D&D状態
- 作成/リネームダイアログ状態

### Previewレベル状態

- ペイン配列
- アクティブペイン
- タブ配列
- タブごとの表示状態
- 編集内容
- スクロール位置
- PDF状態
- 画像状態
- Markdown折りたたみ状態

### 永続化されるクライアント状態

- 選択ファイル
- ツリー展開状態
- 最近開いたファイル

## API概要

### System

- `system:usage`
- CPU / メモリ使用状況を返す

- `system:status`
- 指定ディレクトリの空き容量と総容量を返す

### Settings

- `settings:get`
- 正規化済み設定を返す

- `settings:save`
- 設定を保存し、保存後の設定を返す

### Filesystem

- `fs:browse-directory`
- ディレクトリ選択ダイアログを開く

- `fs:root`
- 保存済みルートを返す

- `fs:list`
- ディレクトリ一覧を返す

- `fs:read`
- 形式判定済みファイルデータを返す

- `fs:save`
- テキストを保存する

- `fs:rename`
- パスを変更する

- `fs:delete`
- ファイルまたはディレクトリを削除する

- `fs:create-file`
- 空ファイルを作成する

- `fs:create-file-from-buffer`
- バイナリ内容からファイルを作成する

- `fs:create-directory`
- ディレクトリを作成する

- `fs:move`
- エントリを移動する

- `fs:copy-into`
- エントリをコピーする

- `fs:watch`
- 単一ファイル監視を開始する

- `fs:unwatch`
- 監視を解除する

- `fs:reveal`
- Finder で表示する

- `fs:copy-path`
- パスをクリップボードへコピーする

### Launch

- `codex:launch`
- `directoryPath` と `model` を受け取り Terminal.app で Codex CLI を起動する

## 入出力データ

### ディレクトリエントリ

- `name`
- `path`
- `type`
- `ignored`

### 読み込みファイル

- `path`
- `name`
- `type`
- `mimeType`
- `content` または `buffer`
- `editable`

### 設定

- 初期ディレクトリ
- モデル一覧
- Launch既定モデル
- 利用量算出モデル
- 利用量分母
- 5H/Weekly リセット設定
- 利用量ベースライン
- 外観設定
- Markdown見出し色

## 前処理 / 推論 / 後処理

### Codex履歴処理

- 前処理
- JSON Lines を読み込む
- `session_id` / `sessionId` を抽出する

- 推論
- token推定値を request数ベースで算出する

- 後処理
- 利用量残量へ変換して表示する

### プレビュー処理

- 前処理
- 拡張子とサイズで表示可否を判定する

- 変換
- JSON整形
- CSVを最大1000行へ制限
- HEIC/HEIFはJPEGへ変換
- PDFはページ画像へ変換
- Markdownは簡易ブロック構造へ変換

- 後処理
- 形式ごとのビューへ描画する

## キャッシュ方針

- ツリー展開状態は `localStorage` に保存する
- 最近開いたファイルは `localStorage` に保存する
- 前回選択ファイルは `localStorage` に保存する
- HEIC変換結果は Main Process 内メモリキャッシュを使う
- `git check-ignore` 結果は Main Process 内メモリキャッシュを使う
- タブ状態は Renderer メモリ上で保持する

## 非同期処理

- システム使用率は2秒ごとに更新する
- Codexリセット同期は1分ごとに確認する
- ディレクトリ一覧取得は必要時のみ実行する
- プレビュー対象変更時のみ監視を切り替える
- HEIC変換は逐次キューで実行する

## 永続化方式

- `settings.json`
- アプリ設定の永続化

- `localStorage`
- UI補助状態の永続化

- `~/.codex/history.jsonl`
- 読み取り専用の利用状況ソース

## ディレクトリ構成

```text
electron/
  main.js
  preload.js
src/
  App.jsx
  main.jsx
  styles.css
  components/
    FileTree.jsx
    LaunchPanel.jsx
    PreviewPane.jsx
    SettingsPanel.jsx
    TopBar.jsx
  utils/
    codexLimits.js
    codexLog.js
    drop.js
    fileLoader.js
    system.js
docs/
  SPEC.md
  ARCHITECTURE.md
  TODO.md
```
