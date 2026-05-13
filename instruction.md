
Terminal Dock 第4-4段階として、PTYターミナルの操作性を上げるためのセッション制御を追加してください。
複数PTY化は完了済みなので、今回は「Restart / Kill / Clear / 状態表示」を中心に最小差分で実装してください。

---

【目的】

各 Terminal pane を実用しやすくする。

今回追加すること：

- active pane の Clear
- active pane の Restart
- active pane の Kill
- pane ごとの状態表示
- PTY exit 時の表示
- rootPath 変更時の挙動整理

---

【実装すること】

1. Terminal Dock ヘッダーに以下の操作を追加

```text
TERMINAL   [Right/Bottom] [+] [Clear] [Restart] [Kill] [×]
```

既存ヘッダー幅が狭い場合は、テキストを短くしてよいです。

例：

```text
Clear
Restart
Kill
```

または

```text
CLR
RST
KILL
```

---

# 1. Clear

【仕様】

* active pane の xterm 画面だけ clear する
* PTY 自体は終了しない
* 実行中プロセスも止めない
* 他paneには影響しない

実装例：

```js
setClearRequest({
  paneId: layout.activePaneId,
  token: Date.now()
});
```

TerminalPane 側：

```js
useEffect(() => {
  if (!clearRequest) return;
  if (clearRequest.paneId !== pane.id) return;

  xtermRef.current?.clear();
}, [clearRequest]);
```

---

# 2. Restart

【仕様】

* active pane の PTY だけ kill
* 同じ pane の xterm を clear
* 同じ rootPath で新しい PTY を起動
* 他paneには影響しない

挙動：

```text
Restart Log 2
→ Log 2 の zsh だけ再起動
→ Log 1 / Log 3 は維持
```

実装方針：

* restartRequest state を TerminalDock に持つ
* active pane に token を送る
* TerminalPane 側で自分宛なら restartPty() を実行

例：

```js
setRestartRequest({
  paneId: layout.activePaneId,
  token: Date.now()
});
```

TerminalPane 側：

```js
useEffect(() => {
  if (!restartRequest) return;
  if (restartRequest.paneId !== pane.id) return;

  restartPty();
}, [restartRequest]);
```

---

# 3. Kill

【仕様】

* active pane の PTY だけ kill
* xterm には `[terminal] session killed` を表示
* pane自体は閉じない
* 他paneには影響しない
* Kill後は入力しても実行されない、または echo fallback でよい
* Restart で復帰できる

実装方針：

```js
setKillRequest({
  paneId: layout.activePaneId,
  token: Date.now()
});
```

TerminalPane 側：

```js
useEffect(() => {
  if (!killRequest) return;
  if (killRequest.paneId !== pane.id) return;

  killPtyOnly();
}, [killRequest]);
```

---

# 4. paneごとの状態表示

TerminalPane header に状態を表示してください。

状態候補：

```text
READY
RUNNING
EXITED
KILLED
FAILED
```

最小実装では以下でよいです。

* PTY接続成功：READY
* PTY起動失敗：FAILED
* PTY終了：EXITED
* Kill押下：KILLED

表示例：

```text
Log 1    READY
Log 2    KILLED
Log 3    FAILED
```

CSS例：

```css
.terminal-pane-status {
  margin-left: auto;
  font-size: 10px;
  letter-spacing: 0.08em;
  opacity: 0.75;
}

.terminal-pane-status.ready {
  color: #60a5fa;
}

.terminal-pane-status.exited,
.terminal-pane-status.killed {
  color: #facc15;
}

.terminal-pane-status.failed {
  color: #f87171;
}
```

---

# 5. PTY exit 時の表示

PTY が終了したら、その pane の xterm に終了メッセージを表示してください。

例：

```text
[terminal] session exited. code=0 signal=null
```

その後、状態を EXITED にする。

注意：

* exit 通知は対象 pane にだけ出す
* 他paneには出さない

---

# 6. rootPath 変更時

既存仕様を維持してください。

推奨仕様：

* rootPath 変更時は全paneのPTYを再起動
* 新しい rootPath を cwd にする
* xterm には以下を表示

```text
[terminal] workspace changed. restarting session...
```

ただし、既に実装済みなら大きく変えないこと。

---

# 7. Dock非表示時

現在の仕様を維持してください。

* Cmd + J 非表示では PTY を終了しない
* 再表示時に続きが見える
* visible true で fit / resize を再実行

---

# 8. pane削除時

現在の仕様を維持してください。

* pane削除時だけ、対象paneのPTYを kill
* 他paneのPTYは維持

---

# 9. localStorage

保存しない：

```text
ptyId
shell状態
実行中プロセス
xterm buffer
command history
logs
pane status
```

保存するものは従来通り：

```text
visible
dock
size
paneCount
paneSizes
```

---

# 10. 禁止

* 複数PTY化を壊さない
* Cmd + J 非表示でPTYをkillしない
* pane削除時のkillを消さない
* ptyIdをlocalStorage保存しない
* xterm bufferを保存しない
* TREE / Preview / Editor を触らない
* node-ptyのspawn-helper権限補正を触らない
* rebuild設定を触らない
* Right / Bottom / リサイズ処理を壊さない

---

# 11. 確認

以下を確認してください。

1. Log 1 / Log 2 / Log 3 がそれぞれ独立して動く
2. Clear で active pane の画面だけ消える
3. Clear しても実行中プロセスは止まらない
4. Restart で active pane のPTYだけ再起動する
5. Restart しても他paneは維持される
6. Kill で active pane のPTYだけ終了する
7. Kill後、paneに KILLED 表示が出る
8. Restart で KILLED pane が復帰する
9. PTY exit 時に対象paneだけ終了メッセージが出る
10. Cmd + J 非表示 / 再表示でPTYが維持される
11. pane削除時は対象paneだけPTYが終了する
12. npm run build が成功する

---

【出力】

以下のみ提示してください。

* 追加した Clear / Restart / Kill 操作
* paneごとの status 表示
* PTY exit 時の表示処理
* rootPath変更時の扱い
* localStorageに保存しない項目
* npm run build の結果

```
```
