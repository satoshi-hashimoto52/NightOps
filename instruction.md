NightOps の macOS .app 化まわりを整理してください。
今回は新機能追加ではなく、パッケージング仕様の固定、手順ドキュメント化、release成果物整理を行います。

Terminal Dock / node-pty / xterm / Preview / Editor / TREE / Settings の既存機能は変更しないでください。

---

# 目的

NightOps を macOS .app として再現性高く作成・確認できるようにする。

今回やること:

1. macOS .app 作成手順ドキュメントを追加する
2. release成果物を掃除する script を追加する
3. package.json scripts を必要最小限で整理する
4. .app 化時の注意点を明文化する
5. npm run build / npm run pack:mac が引き続き成功することを確認する

---

# 1. docs/PACKAGING_MAC.md を作成

新規ファイルを作成してください。

docs/PACKAGING_MAC.md

内容は以下の構成にしてください。

```markdown
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

```

---

# 2. clean:release script を追加

package.json に以下を追加してください。

```json
"clean:release": "rm -rf release"
```

既存 scripts は壊さないでください。

推奨 scripts の並び:

```json
{
  "dev": "node scripts/dev-electron.mjs",
  "dev:vite": "vite --host 127.0.0.1",
  "dev:electron": "electron .",
  "build": "vite build",
  "start": "electron .",
  "pack:mac": "npm run build && electron-builder --mac dir",
  "dist:mac": "npm run build && electron-builder --mac",
  "clean:release": "rm -rf release",
  "postinstall": "node scripts/ensure-node-pty-permissions.mjs",
  "rebuild:native": "electron-rebuild -f -w node-pty"
}
```

既存の順序や内容に合わせて、最小差分で調整してください。

---

# 3. .gitignore 確認

以下が含まれていることを確認してください。

```gitignore
dist/
release/
node_modules/
*.app/
*.dmg
*.zip
*.asar
app.asar.unpacked/
```

不足していれば追加してください。

---

# 4. README への最小追記

README.md が存在する場合、macOS .app 作成手順へのリンクだけ追加してください。

例:

```markdown
## macOS App Packaging

See:

```text
docs/PACKAGING_MAC.md
```

```

README.md が大きく変わりそうなら、今回は docs 追加だけでよいです。

---

# 5. 禁止事項

以下は変更しないこと。

- Terminal Dock
- node-pty のPTY管理実装
- xterm
- Preview / Editor
- TREE
- Settings
- electron/main.js の大規模変更
- vite.config.js の base / server 設定
- electron-builder の asarUnpack 設定
- spawn-helper permission 補正

---

# 6. 確認

以下を確認してください。

1. docs/PACKAGING_MAC.md が作成されている
2. package.json に clean:release が追加されている
3. .gitignore に release成果物除外が入っている
4. npm run build が成功する
5. npm run pack:mac が成功する
6. release/mac-arm64/NightOps.app が生成される

---

# 出力

以下のみ提示してください。

- 作成した docs/PACKAGING_MAC.md
- 追加した clean:release script
- .gitignore 確認結果
- README 追記の有無
- npm run build の結果
- npm run pack:mac の結果
```

この作業が終わったら、次は **アイコン設定** に進むのが自然です。
