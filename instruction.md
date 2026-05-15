
Terminal Settings のフォント設定まわりを追加調整してください。
既存の複数PTY、Cmd + J、Right / Bottom切替、リサイズ、KILL / RST、Settings保存処理は壊さず、以下3点を最小差分で修正してください。

---

【修正内容】

1. Terminal Font Size の最小値を 6 にする
2. Terminal Font Family の選択肢を増やす
3. Settings で値を変更した時点で、保存前でも背後のUIへ一時反映する  
   ただし、Saveしない限り永続保存はしない

---

# 1. Terminal Font Size の最小値を 6 に変更

現在の最小値が 10 などになっている場合、6 に変更してください。

対象：

- SettingsPanel の input min
- 値の clamp 処理
- default / load / save 時のバリデーション
- TerminalDock 側の安全値補正

仕様：

```text
min: 6
max: 20
default: 12
step: 1
````

例：

```jsx
<input
  type="number"
  min="6"
  max="20"
  step="1"
  value={draftSettings.terminalFontSize ?? 12}
  onChange={...}
/>
```

数値補正がある場合：

```js
function normalizeTerminalFontSize(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 12;
  return Math.min(Math.max(numeric, 6), 20);
}
```

---

# 2. Terminal Font Family の選択肢を増やす

Settings > Appearance の Terminal Font Family の候補を増やしてください。

候補例：

```js
const TERMINAL_FONT_OPTIONS = [
  {
    label: "System Mono",
    value: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace"
  },
  {
    label: "SF Mono",
    value: "SFMono-Regular, Menlo, Monaco, Consolas, monospace"
  },
  {
    label: "Menlo",
    value: "Menlo, Monaco, Consolas, monospace"
  },
  {
    label: "Monaco",
    value: "Monaco, Menlo, Consolas, monospace"
  },
  {
    label: "Consolas",
    value: "Consolas, Menlo, Monaco, monospace"
  },
  {
    label: "Courier New",
    value: "\"Courier New\", Courier, monospace"
  },
  {
    label: "Roboto Mono",
    value: "\"Roboto Mono\", ui-monospace, monospace"
  },
  {
    label: "JetBrains Mono",
    value: "\"JetBrains Mono\", ui-monospace, monospace"
  },
  {
    label: "Fira Code",
    value: "\"Fira Code\", ui-monospace, monospace"
  },
  {
    label: "Source Code Pro",
    value: "\"Source Code Pro\", ui-monospace, monospace"
  },
  {
    label: "Hack",
    value: "Hack, ui-monospace, monospace"
  },
  {
    label: "IBM Plex Mono",
    value: "\"IBM Plex Mono\", ui-monospace, monospace"
  }
];
```

注意：

* 未インストールフォントは fallback されてよい
* フォントファイルは同梱しない
* 外部フォントを勝手に追加しない
* select の候補を増やすだけでよい

---

# 3. Settings変更中の一時反映を追加

【目的】

Settings で Terminal Font Size / Terminal Font Family を変更した時、Save前でも背後のUIに一時的に反映されるようにしてください。

ただし、永続保存は Save 押下時のみです。

---

【現在の問題】

Settings内で値を変更しても、Saveするまで背後の Terminal Dock に変化が出ない。

---

【目標挙動】

Settings を開く
→ Terminal Font Size を変更
→ Save前でも背後のTerminalの文字サイズが変わる
→ Saveを押す
→ 設定として保存される

Settings を開く
→ Terminal Font Size を変更
→ Saveせず閉じる / Cancel
→ 保存済み設定へ戻る

---

# 4. draft settings と preview settings を分ける

SettingsPanel 内部の draft 値は維持してください。

ただし、値変更時に親へ一時反映する callback を追加してください。

例：

```jsx
<SettingsPanel
  settings={settings}
  onPreviewSettingsChange={handlePreviewSettingsChange}
  onSave={handleSaveSettings}
  onCancel={handleCancelSettings}
/>
```

既存の props 名に合わせてよいです。

---

# 5. App.jsx 側に previewSettings を追加

App.jsx 側で、一時反映用の state を追加してください。

```js
const [previewSettings, setPreviewSettings] = useState(null);
```

有効設定を作る：

```js
const effectiveSettings = previewSettings ?? settings;
```

TerminalDock には `effectiveSettings` を渡してください。

```jsx
<TerminalDock
  ...
  terminalFontSize={effectiveSettings.terminalFontSize ?? 12}
  terminalFontFamily={
    effectiveSettings.terminalFontFamily ??
    "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace"
  }
/>
```

---

# 6. Settings変更時に previewSettings を更新

SettingsPanel の値変更時に、draftSettings を更新すると同時に親へ通知してください。

```js
function updateDraftSettings(nextDraft) {
  setDraftSettings(nextDraft);
  onPreviewSettingsChange?.(nextDraft);
}
```

Terminal Font Size / Terminal Font Family だけでなく、既存の Appearance 系も同じプレビューに乗せてよいです。

ただし影響範囲が大きい場合は、今回の対象は以下だけでよいです。

* terminalFontSize
* terminalFontFamily

---

# 7. Save時

Save時は、draftSettings を正式な settings として保存してください。

```js
async function handleSaveSettings(nextSettings) {
  await saveSettings(nextSettings);
  setSettings(nextSettings);
  setPreviewSettings(null);
}
```

---

# 8. Cancel / Close時

Saveせず Settings を閉じた場合、previewSettings を破棄してください。

```js
function handleCancelSettings() {
  setPreviewSettings(null);
}
```

Settingsを閉じる処理が複数ある場合、すべてで previewSettings を null に戻してください。

---

# 9. 保存しないこと

Settings変更中の previewSettings は localStorage / electron settings に保存しないでください。

保存するのは Save 押下時のみです。

禁止：

```js
onChange のたびに saveSettings(...)
```

OK：

```js
onChange → previewSettings更新のみ
Save → saveSettings(...)
```

---

# 10. xterm反映

TerminalPane 側では、受け取った `terminalFontSize` / `terminalFontFamily` の変更を既存 xterm に反映してください。

既存処理がある場合は維持し、最小値だけ 6 に対応してください。

```js
useEffect(() => {
  const term = xtermRef.current;
  if (!term) return;

  term.options.fontSize = normalizeTerminalFontSize(terminalFontSize);
  term.options.fontFamily = terminalFontFamily;

  requestAnimationFrame(() => {
    fitTerminal();
  });
}, [terminalFontSize, terminalFontFamily]);
```

---

# 11. PTY resize

フォントサイズやフォントファミリー変更後は cols / rows が変わる可能性があります。

既存の `fitTerminal()` が `resizeTerminalSession` まで送るなら、それを使ってください。

---

# 12. 禁止

* onChange のたびに設定を保存しない
* Save前の一時反映を永続化しない
* Terminal Font Size の最小値を 10 のままにしない
* xterm を再生成しない
* PTY を再起動しない
* xterm buffer を消さない
* ptyId を保存しない
* 複数PTY管理を壊さない
* Cmd + J 非表示時のPTY維持を壊さない
* pane削除時のkillを壊さない
* Settings既存項目を壊さない

---

# 13. 確認

以下を確認してください。

1. Settings > Appearance の Terminal Font Size の最小値が 6 になっている
2. Terminal Font Size に 6 を指定できる
3. Terminal Font Size を変更すると、Save前でも背後の Terminal に一時反映される
4. Saveせず Settings を閉じると、保存済みの値へ戻る
5. Saveすると再起動後も値が保持される
6. Terminal Font Family の候補が増えている
7. Terminal Font Family を変更すると、Save前でも背後の Terminal に一時反映される
8. Saveせず閉じると保存済みフォントへ戻る
9. Saveすると再起動後もフォントが保持される
10. フォント変更後に xterm が fit される
11. フォント変更後も入力・出力できる
12. PTY は再起動されない
13. npm run build が成功する

---

【出力】

以下のみ提示してください。

* Terminal Font Size の最小値を 6 にした箇所
* 追加した Terminal Font Family 候補
* Save前の一時反映に使う previewSettings / effectiveSettings
* Save / Cancel 時の previewSettings 処理
* xterm fontSize / fontFamily 反映処理
* npm run build の結果
