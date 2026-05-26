# macOS Packaging Guide

## Overview

NightOps は Electron + Vite で構成される macOS 向けデスクトップアプリである。
開発時は Vite 開発サーバーを使用し、packaged .app では dist/index.html を Electron が loadFile で読み込む。

## Development Startup

開発起動:

```bash
npm run dev
```

このコマンドは以下を行う。

* 空きポートを自動検出する
* VITE_PORT を設定する
* VITE_DEV_SERVER_URL を設定する
* Vite 開発サーバーを起動する
* Vite 応答確認後に Electron を起動する

関連ファイル:

* scripts/find-free-port.mjs
* scripts/dev-electron.mjs
* vite.config.js
* electron/main.js

## Production Build

Vite production build:

```bash
npm run build
```

dist/ が生成される。

## Create .app

macOS .app 作成:

```bash
npm run pack:mac
```

生成先:

```text
release/mac-arm64/NightOps.app
```

起動:

```bash
open release/mac-arm64/NightOps.app
```

## Important Vite Setting

Electron の loadFile で dist/index.html を読むため、vite.config.js では以下を設定する。

```js
base: "./"
```

これにより dist/index.html 内の assets path が相対パスになる。

正しい例:

```html
<script type="module" crossorigin src="./assets/index-xxxx.js"></script>
<link rel="stylesheet" crossorigin href="./assets/index-xxxx.css">
```

## Settings Storage

packaged .app では app.asar 内へ書き込んではいけない。

settings.json は以下へ保存する。

```text
~/Library/Application Support/nightops/settings.json
```

Electron main では以下を使う。

```js
app.getPath("userData")
```

## node-pty Notes

Terminal Dock は node-pty を使用する。

node-pty は native module のため、electron-builder では asarUnpack 対象にする。

```json
"asarUnpack": [
  "node_modules/node-pty/**"
]
```

また、spawn-helper の実行権限が落ちる場合があるため、以下の補正を維持する。

* scripts/ensure-node-pty-permissions.mjs
* package.json の postinstall
* electron/main.js 起動時の permission 補正

## Electron Builder

electron-builder 設定は package.json の build に記載する。

主な設定:

* productName: NightOps
* appId: local.nightops.app
* output: release
* target: dir
* asar: true
* node-pty は asarUnpack

## App Icon

アプリアイコンは以下を使用する。

* assets/icon.svg
* assets/icon.icns

macOS .app 作成時は package.json の build.mac.icon で assets/icon.icns を参照する。
アイコンを再生成する場合:

```bash
sh scripts/build-mac-icon.sh
```

## Clean Release Artifacts

release成果物を削除する場合:

```bash
npm run clean:release
```

その後、再作成:

```bash
npm run pack:mac
```

## Verification Checklist

packaged .app 作成後は以下を確認する。

1. .app が起動する
2. UI本体が表示される
3. Browse でディレクトリを変更できる
4. settings:save エラーが出ない
5. 再起動後に選択ディレクトリが復元される
6. Terminal Dock が開く
7. zsh / pwd / ls / git status が動く
8. Cmd + J でTerminal Dockを閉じてもPTYが維持される
9. Preview / Editor / TREE / Settings が動く

## Known Limitations

* 未署名 .app のため Gatekeeper 警告が出る可能性がある
* notarize は未対応
* dmg 配布は未対応
* auto update は未対応
* 実行中プロセスはアプリ再起動後に復元しない
