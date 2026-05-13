
Terminal Dock の Clear が動作せず、active pane のログが消えない問題を修正してください。
コマンド実行機能はほぼ正常なので、Clear 処理だけを最小差分で確認・修正してください。

---

【問題】

Terminal Dock の Clear を押してもログが消えない。
または Clear 実行時にエラーが出ている可能性がある。

---

【目的】

- Clear で active pane の logs だけを空にする
- 他 pane の logs は残す
- command input / running / paneSizes / layout は維持する
- localStorage 保存対象は変更しない

---

【確認対象】

主に以下を確認してください。

- src/components/TerminalDock.jsx
- src/App.jsx

---

# ① Clear ボタンの onClick を確認

TerminalDock.jsx の Clear ボタンが、正しい関数を呼んでいるか確認してください。

NG例：

```jsx
onClick={clearLogs}
````

ただし `clearLogs` が未定義、または古いダミー用関数ならNG。

OK例：

```jsx
onClick={handleClearActivePaneLogs}
```

または props 経由なら：

```jsx
onClick={() => onClearPaneLogs(layout.activePaneId)}
```

---

# ② activePaneId が取れているか確認

Clear 処理内で activePaneId が undefined になっていないか確認してください。

必ず fallback を入れてください。

```js
const activePaneId = current.activePaneId || current.panes[0]?.id;
```

---

# ③ Clear 処理は App.jsx 側で state 更新する

App.jsx に以下のような関数を追加、または既存関数を修正してください。

```js
function clearTerminalPaneLogs(paneId) {
  setTerminalLayout((current) => {
    const targetPaneId = paneId || current.activePaneId || current.panes[0]?.id;
    if (!targetPaneId) return current;

    return {
      ...current,
      panes: current.panes.map((pane) =>
        pane.id === targetPaneId
          ? {
              ...pane,
              logs: []
            }
          : pane
      )
    };
  });
}
```

---

# ④ TerminalDock に props として渡す

App.jsx で TerminalDock に渡してください。

```jsx
<TerminalDock
  layout={terminalLayout}
  onChangeLayout={setTerminalLayout}
  onRunCommand={runTerminalCommand}
  onClearPaneLogs={clearTerminalPaneLogs}
  rootPath={rootPath}
/>
```

既存 props 名がある場合は、それに合わせてください。

---

# ⑤ TerminalDock 側で呼び出す

TerminalDock.jsx の Clear ボタンを以下のようにしてください。

```jsx
<button
  type="button"
  className="terminal-dock-button"
  onClick={() => onClearPaneLogs?.(layout.activePaneId)}
>
  Clear
</button>
```

fallback が App.jsx 側にあるので、activePaneId が null でも安全にしてください。

---

# ⑥ pane内の Clear がある場合

各 pane に Clear ボタンがある場合は、対象 pane.id を渡してください。

```jsx
onClick={() => onClearPaneLogs?.(pane.id)}
```

---

# ⑦ Clear で消すのは logs のみ

以下は消さないこと。

```text
inputValue
running
paneSizes
panes
activePaneId
dock
size
visible
```

NG：

```js
pane = { logs: [] }
```

OK：

```js
{ ...pane, logs: [] }
```

---

# ⑧ Clear 後の空表示

logs が空になったら、既存の `No logs` 表示が出ることを確認してください。

もし logs が undefined で落ちる場合は、表示側で fallback してください。

```js
const logs = pane.logs || [];
```

---

# ⑨ エラーログ確認

Clear 押下時に DevTools に以下が出ていないか確認してください。

* onClearPaneLogs is not a function
* Cannot read properties of undefined
* activePaneId undefined
* logs.map is not a function

---

# ⑩ localStorage保存との関係

Clear で logs が変わっても、localStorage へ logs を保存しない仕様は維持してください。

保存対象は引き続き以下のみ。

```text
visible
dock
size
paneCount
paneSizes
```

---

【禁止】

* コマンド実行処理を変更しない
* IPC を変更しない
* logs を localStorage 保存しない
* panes 全体を localStorage 保存しない
* pane 削除処理を変更しない
* Right / Bottom 切替を壊さない
* リサイズ処理を壊さない

---

【確認】

以下を確認してください。

1. Log 1 で `pwd` を実行する
2. Clear を押す
3. Log 1 のログだけ消える
4. `No logs` が表示される
5. Log 2 / Log 3 のログは残る
6. Log 2 を active にして Clear
7. Log 2 のログだけ消える
8. 入力欄の値や running 状態は壊れない
9. Right / Bottom 切替後も Clear が動く
10. npm run build が成功する

---

【出力】

以下のみ提示してください。

* Clear が動かなかった原因
* 修正した App.jsx の clear 関数
* 修正した TerminalDock.jsx の Clear 呼び出し
* logs 以外を維持していること
* npm run build の結果

```
```
