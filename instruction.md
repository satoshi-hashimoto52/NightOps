
NightOps の未署名 .app に関する注意書きと README / packaging docs を整理してください。
今回はドキュメント整理のみです。
実装コードは原則変更しないでください。

---

# 目的

現在の NightOps.app はローカル実行用の未署名 macOS アプリです。
そのため、初回起動時に macOS の Gatekeeper 警告が出る可能性があります。

この点を README と docs/PACKAGING_MAC.md に明記し、今後自分や他者が起動時に迷わないようにしてください。

---

# 対象ファイル

主に以下を変更してください。

- README.md
- docs/PACKAGING_MAC.md

原則として以下は変更しないこと。

- electron/main.js
- src/**
- package.json
- vite.config.js
- Terminal Dock
- node-pty
- xterm
- Settings
- Preview / Editor
- TREE

---

# 1. README.md に未署名 .app の注意を追記

README.md の macOS App Packaging 付近、または末尾に以下の内容を短く追記してください。

内容：

```markdown
## macOS App Notes

The generated `NightOps.app` is currently intended for local use.

It is not signed or notarized, so macOS may show a Gatekeeper warning on first launch.

If macOS blocks the app, open it from Finder by using:

1. Right-click `NightOps.app`
2. Choose `Open`
3. Confirm `Open`

For local development, continue to use:

```bash
npm run dev
```

For local `.app` packaging, use:

```bash
npm run pack:mac
```

```

日本語READMEの場合は、自然な日本語でも構いません。

---

# 2. docs/PACKAGING_MAC.md に Gatekeeper セクションを追加

docs/PACKAGING_MAC.md に以下のようなセクションを追加してください。

```markdown
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
```

---

# 3. 既存 Known Limitations を整理

docs/PACKAGING_MAC.md に既に Known Limitations がある場合、以下が含まれるように整理してください。

```markdown
- The generated `.app` is unsigned.
- The app is not notarized.
- Gatekeeper warnings may appear on first launch.
- DMG distribution is not configured yet.
- Auto update is not configured yet.
```

重複する場合は重複を避けてください。

---

# 4. 将来対応メモを追加

短く以下も入れてください。

```markdown
## Future Distribution Tasks

For external distribution, consider:

- Developer ID Application signing
- hardened runtime
- entitlements
- notarization
- signed DMG
- update mechanism
```

---

# 5. 禁止事項

今回はドキュメント整理のみです。

以下は変更しないでください。

* 実装コード
* package.json scripts
* electron-builder 設定
* Terminal Dock
* node-pty
* Settings
* Vite設定
* packaging の実挙動

---

# 6. 確認

以下を確認してください。

1. README.md に未署名 .app の注意がある
2. docs/PACKAGING_MAC.md に Gatekeeper / Unsigned App の説明がある
3. Known Limitations が重複せず整理されている
4. Future Distribution Tasks がある
5. 実装コードを変更していない
6. npm run build が成功する

---

# 出力

以下のみ提示してください。

* README.md に追記した内容
* docs/PACKAGING_MAC.md に追記した内容
* Known Limitations の整理内容
* 実装コードを変更していないこと
* npm run build の結果
