# Terminal Dock Specification

## Overview

Terminal Dock は NightOps 内で利用する統合ターミナルUIである。
xterm.js と node-pty を使用し、最大3つの独立したPTYセッションを扱う。

## Current Scope

- Right / Bottom のDock切替
- Cmd + J による表示 / 非表示
- Dock全体のリサイズ
- Dock内部の最大3ペイン分割
- 各paneごとの独立PTY
- 各paneごとのxterm表示
- CLR / KILL / RST
- SettingsからTerminal Font Size / Terminal Font Familyを変更
- Dock非表示時もPTYを維持
- pane削除時のみ対象PTYをkill
- rootPath変更時はPTYを再起動

## Layout

### Right Dock

- 右ペインとして表示
- 内部paneは縦方向に最大3分割
- Dock幅をドラッグで変更可能

### Bottom Dock

- 下部ドックとして表示
- 内部paneは横方向に最大3分割
- Dock高さをドラッグで変更可能

## Keyboard Shortcut

### Cmd + J

- Terminal Dock の表示 / 非表示を切り替える
- 非表示時もTerminalDock / TerminalPaneはunmountしない
- PTY sessionは維持する
- 再表示時に実行中プロセスと出力を継続表示する

## Pane Behavior

- paneは最大3つまで
- paneが3つの時は `[+]` ボタンを表示しない
- pane名は `Log 1`, `Log 2`, ... の形式
- `nextPaneNumber` により追加・削除を繰り返しても名前を重複させない
- pane削除時は、そのpaneのPTYだけkillする
- 他paneのPTYには影響しない

## PTY Management

Electron main側では `terminalSessions` を Map で管理する。

- key: ptyId
- value: ptyProcess / paneId / cwd / shell / createdAt

### IPC

- `terminal:pty-start`
- `terminal:pty-write`
- `terminal:pty-resize`
- `terminal:pty-kill`
- `terminal:pty-kill-all`

### Rules

- start時に他paneのPTYをkillしない
- write / resize / kill は ptyId 指定で対象sessionだけ操作する
- data / exit event には ptyId / paneId を含める
- renderer側では自分の ptyId と一致する data のみ xtermへ流す

## Session Controls

### CLR

- active pane の xterm画面だけclearする
- PTYは終了しない
- 実行中プロセスも止めない

### KILL

- READY / STARTING 状態で表示
- active pane のPTYだけ終了する
- pane自体は閉じない
- statusは KILLED になる

### RST

- KILLED / EXITED / FAILED 状態で表示
- active pane のPTYだけ再起動する
- 他paneには影響しない

## Status

paneごとに以下のstatusを持つ。

- STARTING
- READY
- EXITED
- KILLED
- FAILED

## Settings

Settings > Appearance から以下を変更できる。

### Terminal Font Size

- key: `terminalFontSize`
- default: 12
- min: 6
- max: 20
- Save前でも一時反映する
- Saveしない場合は保存済み値へ戻る

### Terminal Font Family

- key: `terminalFontFamily`
- select形式
- Save前でも一時反映する
- Saveしない場合は保存済み値へ戻る

## Persistence

localStorageに保存するもの。

- visible
- dock
- size
- paneCount
- paneSizes
- nextPaneNumber

保存しないもの。

- ptyId
- shell状態
- 実行中プロセス
- xterm buffer
- command history
- logs
- pane status

## node-pty Permission

node-pty の `spawn-helper` は実行ビットが落ちる場合がある。
以下で補正する。

- `scripts/ensure-node-pty-permissions.mjs`
- `package.json` の `postinstall`

この処理は削除しない。

## Known Limitations

- paneは最大3つまで
- shell profile切替UIは未実装
- コマンド履歴保存は未実装
- xterm buffer永続化はしない
- 実行中プロセスはアプリ再起動後に復元しない

## Do Not Change Without Explicit Instruction

- Dock非表示時にPTYをkillしない
- pane削除時は対象PTYだけkillする
- ptyIdをlocalStorageに保存しない
- spawn-helper権限補正を削除しない
- 複数PTY Map管理を単一PTY管理に戻さない
