# Current Instruction

Terminal Dock 実装は現在の仕様で完了扱いとする。
次の明示指示があるまで、Terminal Dock / node-pty / xterm / Settings保存周辺は変更しない。

## Current Stable Areas

- Terminal Dock Right / Bottom 切替
- Cmd + J 表示 / 非表示
- 非表示時のPTY維持
- 複数pane PTY
- 最大3pane
- CLR / KILL / RST
- Terminal Font Size / Terminal Font Family
- node-pty spawn-helper permission補正
- Terminal Dock layout persistence

## Do Not Touch

- electron/main.js のPTY Map管理
- node-pty spawn-helper補正
- TerminalDock.jsx のpaneごとのPTY管理
- Cmd + J 非表示時にunmountしない構造
- Settings のTerminal Font設定
- localStorage保存対象

## Reference

Terminal Dock の詳細仕様は以下を参照する。

docs/TERMINAL_DOCK.md
