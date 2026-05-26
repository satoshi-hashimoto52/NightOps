instruction.md を以下の内容に置き換えてください。
Terminal Dock / node-pty / xterm / Settings保存周辺は触らず、Preview / Editor のタブ操作UX改善と、テキスト編集時のシンタックスハイライトのみ実装してください。

---

# Current Instruction

Preview / Editor のタブ操作UX改善と、テキスト編集時の拡張子別シンタックスハイライトを追加する。

## Do Not Touch

以下は変更しないこと。

- Terminal Dock
- node-pty
- xterm
- electron/main.js のPTY Map管理
- spawn-helper permission補正
- Terminal Font Size / Terminal Font Family
- Settings保存処理
- Cmd + J のTerminal Dock挙動
- docs/TERMINAL_DOCK.md

## Task 1: Tab UX

Preview / Editor のタブ操作を改善する。

実装すること。

- タブをドラッグで並び替え
- タブ右クリックメニューを追加
- メニュー項目:
  - Close
  - Close Others
  - Close to Right
  - Copy Path
  - Reveal in Tree
- 未保存タブを閉じる時は確認する
- active tab / dirty / content / path は維持する
- pane間のタブ移動は今回は不要

## Task 2: Syntax Highlight in Editor

Preview / Editor のテキスト編集時に、ファイル拡張子に応じたシンタックスハイライトを追加する。

対象例。

- js / jsx
- ts / tsx
- json
- css
- html / xml
- py
- sh / bash / zsh
- md
- yaml / yml
- sql

方針。

- 既存の highlight.js / detectLanguage があれば再利用する
- editor overlay layer 方式で実装する
- textarea の入力機能は壊さない
- textarea の caret / selection は見える状態を維持する
- 過去にあった「64行目以降が透明になる問題」を再発させない
- Cmd+F / Cmd+D / 複数選択編集 / Save / dirty は壊さない

## Required Output

以下のみ提示する。

- タブドラッグ並び替えの実装箇所
- タブ右クリックメニューの実装箇所
- 未保存タブ確認の実装箇所
- Reveal in Tree の対応内容
- テキスト編集シンタックスハイライトの実装箇所
- Cmd+F / Cmd+D / Save / dirty に影響させていないこと
- npm run build の結果

## macOS App Packaging

See:

```text
docs/PACKAGING_MAC.md
```

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
