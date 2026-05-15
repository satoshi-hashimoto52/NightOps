Terminal Dock の RST / KILL 周りを修正してください。
現在、READY 状態の Terminal pane で RST を押すと `suppressExitEventRef is not defined` が発生しています。
あわせて、ヘッダーの表示を節約するため、RST と KILL を同時表示せず、active pane の状態に応じて1ボタンで切り替えるようにしてください。

---

【問題】

READY 状態で RST 押下時に以下のエラーが発生しています。

ReferenceError: suppressExitEventRef is not defined

発生箇所：

```text
TerminalDock.jsx:182
restartCurrentSession
````

原因候補：

* `suppressExitEventRef` を使っているが `useRef` 宣言がない
* 変数名の typo
* restart 時だけ参照しているが、kill / exit 側と状態管理が不整合
* restart 中の意図的な kill による exit event を抑制したかったが、ref が未定義

---

# 1. suppressExitEventRef の未定義を修正

TerminalPane 内で `suppressExitEventRef` を使用している場合は、必ず定義してください。

```js
const suppressExitEventRef = useRef(false);
```

配置場所：

```js
const ptyIdRef = useRef(null);
const ptyStartingRef = useRef(false);
const ptyConnectedRef = useRef(false);
const ptyStartFailedRef = useRef(false);
const suppressExitEventRef = useRef(false);
```

---

# 2. Restart 時の exit event 抑制

RST は内部的に既存 PTY を kill して再起動するため、その kill による `pty-exit` を通常の EXITED 表示として扱わないでください。

Restart 開始時：

```js
suppressExitEventRef.current = true;
```

既存 PTY kill 後、新規 start 成功または失敗後に戻す：

```js
suppressExitEventRef.current = false;
```

PTY exit handler 側：

```js
if (suppressExitEventRef.current) {
  return;
}
```

または、必要なら表示だけ抑制し、状態更新も抑制してください。

---

# 3. finally で必ず戻す

restart が失敗しても suppress が戻らないと、以後の exit が無視されます。

```js
async function restartCurrentSession() {
  suppressExitEventRef.current = true;

  try {
    // kill current pty
    // clear xterm
    // start new pty
  } finally {
    suppressExitEventRef.current = false;
  }
}
```

---

# 4. RST / KILL ボタンを1つに統合

現在ヘッダーに `RST` と `KILL` が同時表示されていますが、active pane の状態によって1つだけ表示してください。

理由：

* READY / STARTING 中は KILL が必要
* KILLED / EXITED / FAILED 中は RST が必要
* RST と KILL を同時に出す必要はない
* ヘッダー幅を節約できる

---

# 5. active pane の status を取得

TerminalDock 側で active pane の状態を取得してください。

例：

```js
const activePane = layout.panes.find((pane) => pane.id === layout.activePaneId) || layout.panes[0];
const activeStatus = terminalStatuses[activePane?.id] || "unknown";
```

実際の状態管理が `TerminalPane` 内部にある場合は、親に status を通知する仕組みを追加してください。

---

# 6. pane status を親へ通知する

現在 status が TerminalPane 内部だけで管理されている場合、TerminalDock が active pane の状態を判断できません。

TerminalDock に `paneStatuses` state を追加してください。

```js
const [paneStatuses, setPaneStatuses] = useState({});
```

TerminalPane に callback を渡す：

```jsx
<TerminalPane
  ...
  onStatusChange={(paneId, status) => {
    setPaneStatuses((current) => ({
      ...current,
      [paneId]: status
    }));
  }}
/>
```

TerminalPane 側で status 変更時に通知：

```js
function updateStatus(nextStatus) {
  setStatus(nextStatus);
  onStatusChange?.(pane.id, nextStatus);
}
```

既存の status setter がある場合は、そこへ統合してください。

---

# 7. 状態ごとのボタン表示

active pane の状態に応じて表示するボタンを切り替えてください。

```js
const canKillActivePane =
  activeStatus === "ready" ||
  activeStatus === "starting";

const canRestartActivePane =
  activeStatus === "killed" ||
  activeStatus === "exited" ||
  activeStatus === "failed";
```

表示：

```jsx
{canKillActivePane ? (
  <button
    type="button"
    className="terminal-dock-button"
    onClick={killActivePane}
    title="Kill active terminal"
  >
    KILL
  </button>
) : (
  <button
    type="button"
    className="terminal-dock-button"
    onClick={restartActivePane}
    title="Restart active terminal"
  >
    RST
  </button>
)}
```

---

# 8. STARTING 中の扱い

STARTING 中は KILL を表示してよいですが、kill が不安定なら disabled にしてもよいです。

推奨：

```js
const canKillActivePane = activeStatus === "ready";
```

安全優先なら、STARTING 中は disabled 表示：

```jsx
<button disabled={activeStatus === "starting"}>
  KILL
</button>
```

---

# 9. READY 状態で Restart したい場合

今回は「1ボタン化」が目的なので、READY 状態では KILL を表示してください。

操作フロー：

```text
READY → KILL → KILLED → RST → READY
```

直接 Restart は出さない。

ただし、将来的に右クリックメニューやショートカットで Restart を追加してもよいです。

---

# 10. Clear は維持

CLR はそのまま残してください。

ヘッダー例：

READY時：

```text
TERMINAL [Right] [+] [CLR] [KILL] [×]
```

KILLED / EXITED / FAILED時：

```text
TERMINAL [Right] [+] [CLR] [RST] [×]
```

---

# 11. Kill の挙動

KILL 押下時：

* active pane の PTY だけ kill
* pane は閉じない
* xterm に `[terminal] session killed` を表示
* status を KILLED にする
* 他 pane は維持

---

# 12. Restart の挙動

RST 押下時：

* active pane の PTY を新規起動
* xterm を必要に応じて clear
* rootPath を cwd にする
* status を STARTING → READY にする
* 他 pane は維持

---

# 13. exit event の扱い

通常終了：

* status: EXITED
* `[terminal] session exited...` を表示

Kill 操作：

* status: KILLED
* `[terminal] session killed` を表示
* exit event による EXITED 上書きを防ぐ

Restart 操作：

* 旧 PTY の exit event では EXITED 表示しない
* 新 PTY 起動後 READY にする

---

# 14. 禁止

* RST / KILL を同時表示しない
* READY 状態で RST ボタンを表示しない
* KILLED / EXITED / FAILED 状態で KILL ボタンを表示しない
* suppressExitEventRef を未定義のまま使わない
* Restart 失敗時に suppressExitEventRef を true のまま残さない
* 他 pane の PTY を kill しない
* Cmd + J 非表示で PTY を kill しない
* pane削除時の kill 仕様を壊さない
* Right / Bottom / リサイズ処理を壊さない

---

# 15. 確認

以下を確認してください。

1. READY 状態で RST ボタンが表示されず、KILL が表示される
2. READY 状態で KILL を押す
3. active pane のみ KILLED になる
4. KILLED 状態では KILL が消え、RST が表示される
5. RST を押すと active pane のみ再起動する
6. `suppressExitEventRef is not defined` が出ない
7. Restart 時に一瞬 EXITED 表示で上書きされない
8. 他 pane の PTY は維持される
9. CLR は active pane の画面だけ消す
10. npm run build が成功する

---

【出力】

以下のみ提示してください。

* suppressExitEventRef 未定義エラーの原因
* suppressExitEventRef の追加箇所
* Restart / Kill 時の exit event 抑制処理
* RST / KILL を1ボタン化した箇所
* active pane status の取得方法
* npm run build の結果
