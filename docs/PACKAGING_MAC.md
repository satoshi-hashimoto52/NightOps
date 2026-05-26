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

## Distribution Artifacts

For local `.app` verification:

```bash
npm run pack:mac
```

For unsigned local DMG / ZIP artifacts:

```bash
npm run dist:mac
```

Generated artifacts are placed under:

```text
release/
```

These artifacts are currently unsigned and not notarized.
They are intended for local verification only.

## Gatekeeper / Unsigned App

The current `NightOps.app` is unsigned and not notarized.

This is expected for local builds.

On first launch, macOS may block the app with a security warning.

To open the app manually:

1. Open Finder
2. Right-click `NightOps.app`
3. Choose `Open`
4. Confirm `Open`

This project does not currently configure:

- Developer ID signing
- hardened runtime
- notarization
- distribution DMG signing

These should be added only when the app is intended for external distribution.

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

* The generated `.app` is unsigned.
* The app is not notarized.
* Gatekeeper warnings may appear on first launch.
* DMG distribution is not configured yet.
* Auto update is not configured yet.
* Running processes are not restored after app restart.

## Future Distribution Tasks

For external distribution, consider:

* Developer ID Application signing
* hardened runtime
* entitlements
* notarization
* signed DMG
* update mechanism
