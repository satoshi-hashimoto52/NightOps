
NightOps の .app 仕上げとして、Help / Documentation メニュー追加、リリース手順チェックリスト作成、dmg / zip 配布設定を行ってください。

今回は以下の順番で対応してください。

1. Help / Documentation メニュー追加
2. リリース手順チェックリスト作成
3. dmg / zip 配布設定

Terminal Dock / node-pty / xterm / Preview / Editor / TREE / Settings の既存機能は変更しないでください。

---

# 目的

NightOps をローカル利用向け .app として扱いやすくする。

実現したいこと:

- macOS メニューからドキュメントを開ける
- リリース前に確認すべき項目をチェックリスト化する
- 将来的な配布を見据えて dmg / zip 生成 script を整理する
- 未署名 / 未 notarize であることは維持する

---

# 1. Help / Documentation メニュー追加

## 対象

主に以下を確認してください。

- electron/main.js
- docs/PACKAGING_MAC.md
- docs/TERMINAL_DOCK.md
- README.md

---

## 1-1. Help メニューを追加

electron/main.js の macOS メニューに Help を追加してください。

追加するメニュー例:

```text
Help
- NightOps Documentation
- Packaging Guide
- Terminal Dock Specification
```

---

## 1-2. メニュー項目の動作

各メニューはローカルの Markdown ファイルを既定アプリまたはブラウザで開いてください。

候補:

* README.md
* docs/PACKAGING_MAC.md
* docs/TERMINAL_DOCK.md

Electron main では `shell.openPath()` または `shell.openExternal()` を使ってください。

推奨:

```js
shell.openPath(path.join(app.getAppPath(), "README.md"));
```

ただし packaged .app では `app.asar` 内のファイルを直接開けない可能性があります。

その場合は、以下のどちらかで対応してください。

### 案A: docs を extraResources に含める

electron-builder の build.extraResources に docs / README を含める。

例:

```json
"extraResources": [
  {
    "from": "docs",
    "to": "docs"
  },
  {
    "from": "README.md",
    "to": "README.md"
  }
]
```

packaged app では以下から開く。

```js
path.join(process.resourcesPath, "docs", "PACKAGING_MAC.md")
path.join(process.resourcesPath, "README.md")
```

### 案B: 開発時はプロジェクト内、packaged時は resourcesPath

以下のような helper を作る。

```js
function getResourcePath(...segments) {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, ...segments);
  }

  return path.join(app.getAppPath(), ...segments);
}
```

---

## 1-3. 推奨実装

今回は案Aを採用してください。

package.json の build に extraResources を追加してください。

```json
"extraResources": [
  {
    "from": "docs",
    "to": "docs"
  },
  {
    "from": "README.md",
    "to": "README.md"
  }
]
```

既存の files / asarUnpack は壊さないでください。

---

## 1-4. Help menu 実装例

```js
function getPackagedResourcePath(...segments) {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, ...segments);
  }

  return path.join(app.getAppPath(), ...segments);
}

function openLocalDocument(...segments) {
  const filePath = getPackagedResourcePath(...segments);
  shell.openPath(filePath).catch((error) => {
    console.warn("[help] failed to open document", filePath, error);
  });
}
```

メニュー例:

```js
{
  label: "Help",
  submenu: [
    {
      label: "NightOps Documentation",
      click: () => openLocalDocument("README.md")
    },
    {
      label: "Packaging Guide",
      click: () => openLocalDocument("docs", "PACKAGING_MAC.md")
    },
    {
      label: "Terminal Dock Specification",
      click: () => openLocalDocument("docs", "TERMINAL_DOCK.md")
    }
  ]
}
```

---

## 1-5. 注意

* Help メニュー追加で既存ショートカットを奪わない
* packaged .app でも docs が開けること
* docs が存在しない場合もアプリを落とさない

---

# 2. リリース手順チェックリスト作成

## 2-1. 新規ドキュメント追加

以下を新規作成してください。

```text
docs/RELEASE_CHECKLIST.md
```

---

## 2-2. 内容

以下の構成で作成してください。

```markdown
# リリースチェックリスト

## 対象範囲

このチェックリストは、NightOps のローカル用 macOS `.app` ビルドを確認するためのものです。

現在の `NightOps.app` は未署名・未 notarize のローカル実行用アプリです。

## 事前確認

- [ ] 作業ツリーがクリーン、または意図した変更のみになっている
- [ ] `npm install` が完了している
- [ ] `npm run build` が成功する
- [ ] `npm run pack:mac` が成功する
- [ ] `release/mac-arm64/NightOps.app` が生成される

## アプリ起動

- [ ] `open release/mac-arm64/NightOps.app` でアプリが起動する
- [ ] NightOps のUI本体が表示される
- [ ] アプリアイコンが表示される
- [ ] macOS メニューバーに NightOps が表示される
- [ ] packaged `.app` では Reload / Toggle DevTools が表示されない

## ワークスペース

- [ ] 初回起動時に No workspace selected が表示される
- [ ] Browse でフォルダを選択できる
- [ ] TREE に選択したフォルダ内容が表示される
- [ ] settings.json が userData 配下に保存される
- [ ] 無効な保存済みフォルダの場合、Workspace unavailable が表示される
- [ ] Browse 成功後、ワークスペースエラー表示が消える

## Preview / Editor

- [ ] Markdown preview が表示される
- [ ] Editor で編集できる
- [ ] Save / dirty 状態が正しく動く
- [ ] Cmd+F が動く
- [ ] Cmd+D が動く
- [ ] 未保存タブを閉じる時に確認が出る
- [ ] タブ右クリックメニューが動く
- [ ] シンタックスハイライトで37行目以降 / 64行目以降が消えない

## Terminal Dock

- [ ] Terminal Dock が開く
- [ ] 各 pane で zsh が起動する
- [ ] `pwd` が動く
- [ ] `ls` が動く
- [ ] `git status` が動く
- [ ] Cmd+J で Terminal Dock を非表示 / 再表示できる
- [ ] Cmd+J で非表示にしても PTY が終了しない
- [ ] KILL は active pane のみ終了する
- [ ] RST は active pane のみ復帰する
- [ ] CLR は active pane の画面のみクリアする
- [ ] pane 削除時、その pane の PTY だけ終了する

## Settings

- [ ] Appearance 設定が保存される
- [ ] Container Opacity が保持される
- [ ] Terminal Font Size が保持される
- [ ] Terminal Font Family が保持される
- [ ] Settings は app.asar 内ではなく userData 配下に保存される

## Help / Documentation

- [ ] Help > NightOps Documentation で README が開く
- [ ] Help > Packaging Guide で docs/PACKAGING_MAC.md が開く
- [ ] Help > Terminal Dock Specification で docs/TERMINAL_DOCK.md が開く

## パッケージング確認

- [ ] `dist/` をコミット対象にしていない
- [ ] `release/` をコミット対象にしていない
- [ ] `node_modules/` をコミット対象にしていない
- [ ] `assets/icon.icns` はコミット対象に含めている
- [ ] `scripts/build-mac-icon.sh` はコミット対象に含めている

## 配布上の既知制限

- [ ] `.app` は未署名である
- [ ] `.app` は notarize されていない
- [ ] 初回起動時に Gatekeeper 警告が出る可能性がある
- [ ] DMG 署名は未設定である
- [ ] 自動アップデートは未設定である
```

---

# 3. dmg / zip 配布設定

## 3-1. 現状

現在は `pack:mac` で dir target の `.app` 作成を優先している。

これを維持してください。

---

## 3-2. package.json scripts を整理

既存の `pack:mac` は維持してください。

```json
"pack:mac": "npm run build && electron-builder --mac dir"
```

配布用として、以下を追加または確認してください。

```json
"dist:mac": "npm run build && electron-builder --mac dmg zip"
```

すでに `dist:mac` がある場合は、target が dmg / zip になるように確認してください。

---

## 3-3. electron-builder mac target を整理

package.json の build.mac.target を以下のようにするか、script側で指定してください。

推奨は、既存 `pack:mac` を壊さないため、script側指定を優先します。

```json
"dist:mac": "npm run build && electron-builder --mac dmg zip"
```

build.mac.target は dir のままでもよいです。

---

## 3-4. 注意

今回は未署名 / 未 notarize のままでよいです。

* Developer ID signing は追加しない
* notarization は追加しない
* entitlements は追加しない
* auto update は追加しない

未署名 dmg / zip が生成される可能性があることを docs/PACKAGING_MAC.md に記載してください。

---

## 3-5. docs/PACKAGING_MAC.md 追記

以下を追記してください。

```markdown
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

```

---

# 4. .gitignore確認

以下が含まれていることを確認してください。

```gitignore
release/
*.dmg
*.zip
*.app/
```

不足があれば追加してください。

---

# 5. 禁止事項

以下は変更しないでください。

* Terminal Dock
* node-pty
* xterm
* Preview / Editor
* TREE
* Settings
* Vite dev 起動
* settings userData 保存
* app icon
* spawn-helper permission 補正
* 署名 / notarize / entitlements 設定

---

# 6. 確認

以下を確認してください。

1. npm run build が成功する
2. npm run pack:mac が成功する
3. release/mac-arm64/NightOps.app が生成される
4. npm run dist:mac が成功する
5. dmg / zip が release/ 配下に生成される
6. Help メニューの各ドキュメントが開ける
7. packaged .app で Help メニューが落ちない
8. docs/RELEASE_CHECKLIST.md が作成されている
9. README / docs の説明が更新されている

---

# 出力

以下のみ提示してください。

* Help / Documentation メニューの追加内容
* extraResources の追加内容
* docs/RELEASE_CHECKLIST.md の作成内容
* dist:mac の設定内容
* docs/PACKAGING_MAC.md の追記内容
* .gitignore 確認結果
* npm run build の結果
* npm run pack:mac の結果
* npm run dist:mac の結果