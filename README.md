Preview / Editor のタブ操作UX改善と、テキスト編集時の拡張子別シンタックスハイライトを追加してください。
Terminal Dock / node-pty / xterm / Settings保存周辺は触らないこと。
既存の Cmd+F / Cmd+D / Save / dirty / Preview同期 / TREE は壊さず、最小差分で実装してください。

---

# 目的

Preview / Editor をIDEらしく使いやすくする。

今回の対象：

1. タブ操作UX改善
2. テキスト編集時のシンタックスハイライト表示

---

# 1. タブ操作UX改善

## 実装すること

- タブをドラッグで並び替え
- タブの右クリックメニュー
- 未保存タブを閉じる時の確認

---

## 1-1. タブをドラッグで並び替え

### 目的

Preview / Editor のタブをドラッグで任意の順番に並び替えられるようにする。

---

### 対象

主に以下を確認してください。

- src/components/PreviewPane.jsx
- src/styles.css

対象候補：

- preview-tabs
- preview-tab
- tab list
- pane.tabs
- activeTabPath
- pane state 更新処理

---

### 仕様

- 同一 pane 内のタブをドラッグで並び替える
- 左右 pane を分けている場合、それぞれの pane 内だけで並び替える
- 今回は pane 間のタブ移動は不要
- activeTabPath は維持する
- dirty 状態は維持する
- tab.content / tab.isDirty / tab.path などは壊さない

---

### 実装方針

HTML5 drag and drop でよいです。

タブに draggable を付ける。

```jsx
<div
  className="preview-tab"
  draggable
  onDragStart={(event) => handleTabDragStart(event, paneId, tab.path)}
  onDragOver={(event) => handleTabDragOver(event)}
  onDrop={(event) => handleTabDrop(event, paneId, tab.path)}
>
````

---

### state例

```js
const [draggingTab, setDraggingTab] = useState(null);
```

```js
{
  paneId,
  path
}
```

---

### 並び替え処理例

```js
function reorderTabs(tabs, sourcePath, targetPath) {
  const sourceIndex = tabs.findIndex((tab) => tab.path === sourcePath);
  const targetIndex = tabs.findIndex((tab) => tab.path === targetPath);

  if (sourceIndex < 0 || targetIndex < 0 || sourceIndex === targetIndex) {
    return tabs;
  }

  const nextTabs = [...tabs];
  const [removed] = nextTabs.splice(sourceIndex, 1);
  nextTabs.splice(targetIndex, 0, removed);

  return nextTabs;
}
```

---

### 注意

* drag中にタブの中身を変更しない
* activeTabPath を変えない
* drop後も active tab は元のまま
* dirty tab の状態は維持する

---

### CSS

```css
.preview-tab.dragging {
  opacity: 0.55;
}

.preview-tab.drag-over {
  outline: 1px solid rgba(96, 165, 250, 0.8);
}
```

既存デザインに合わせて調整してください。

---

# 2. タブ右クリックメニュー

## 実装すること

タブを右クリックした時にコンテキストメニューを表示する。

メニュー項目：

* Close
* Close Others
* Close to Right
* Copy Path
* Reveal in Tree

---

## 2-1. 表示仕様

タブ右クリック時、viewport座標でメニューを表示してください。

```js
setTabContextMenu({
  x: event.clientX,
  y: event.clientY,
  paneId,
  tabPath: tab.path
});
```

---

## 2-2. Portal表示推奨

TREEメニューと同じく、メニューが背面に埋まらないように document.body 直下へ Portal 表示してください。

```jsx
{tabContextMenu
  ? createPortal(
      <div
        className="preview-tab-context-menu"
        style={{
          left: tabContextMenu.x,
          top: tabContextMenu.y
        }}
      >
        ...
      </div>,
      document.body
    )
  : null}
```

既に createPortal を使っている場合は重複importしないこと。

---

## 2-3. メニュー外クリックで閉じる

```js
useEffect(() => {
  if (!tabContextMenu) return;

  function handlePointerDown() {
    setTabContextMenu(null);
  }

  function handleKeyDown(event) {
    if (event.key === "Escape") {
      setTabContextMenu(null);
    }
  }

  window.addEventListener("pointerdown", handlePointerDown);
  window.addEventListener("keydown", handleKeyDown);

  return () => {
    window.removeEventListener("pointerdown", handlePointerDown);
    window.removeEventListener("keydown", handleKeyDown);
  };
}, [tabContextMenu]);
```

メニュー本体では stopPropagation してください。

---

# 3. タブ右クリックメニュー項目

## 3-1. Close

対象タブを閉じる。

既存の close tab 処理がある場合はそれを再利用してください。

未保存の場合は確認すること。

---

## 3-2. Close Others

同じ pane 内で、対象タブ以外を閉じる。

未保存タブが含まれる場合は確認してください。

確認対象：

* 閉じる対象に isDirty === true がある場合

仕様：

* Cancelなら何もしない
* OKなら対象以外を閉じる
* 対象タブは残す
* active tab が閉じられる場合は対象タブを active にする

---

## 3-3. Close to Right

同じ pane 内で、対象タブより右側のタブを閉じる。

未保存タブが含まれる場合は確認してください。

仕様：

* Cancelなら何もしない
* OKなら右側タブを閉じる
* 対象タブと左側タブは残す
* active tab が閉じられる場合は対象タブ、または残存する近いタブを active にする

---

## 3-4. Copy Path

対象タブの full path を clipboard にコピーする。

Electron / browser API の既存ラッパーがあればそれを使う。

簡易実装：

```js
navigator.clipboard.writeText(tab.path);
```

失敗時は console.warn 程度でよい。

---

## 3-5. Reveal in Tree

対象ファイルを TREE 上で選択・表示する。

既存の Tree 選択APIがある場合は再利用してください。

もし現在、PreviewPane から Tree へ直接指示する経路がなければ、今回は以下のどちらかにしてください。

優先：

* App.jsx に `onRevealInTree(path)` を用意
* PreviewPane から callback で渡す
* Tree 側で対象 path を選択し、必要なら親フォルダを展開

難しい場合：

* まずはメニュー項目だけ disabled にしない
* console.warn("Reveal in Tree is not wired yet") でよい
* ただし将来実装用の TODO コメントを残す

可能なら今回実装してください。

---

# 4. 未保存タブを閉じる時の確認

## 目的

未保存の編集内容を誤って失わないようにする。

---

## 対象操作

以下すべてで確認してください。

* タブの × Close
* 右クリック Close
* Close Others
* Close to Right
* pane削除や一括closeがある場合

---

## 確認方法

既存の Electron dialog がある場合はそれを使ってください。

例：

```js
const confirmed = await confirmDiscardUnsaved(count);
```

既に Browse切替時に未保存確認を実装済みなら、その経路を再利用してください。

---

## 仕様

未保存が1つの場合：

```text
Discard unsaved changes?
```

未保存が複数の場合：

```text
Discard 3 unsaved files?
```

選択：

* Cancel: 何もしない
* Discard / Continue: 閉じる

---

## 禁止

* 未保存タブを無確認で閉じない
* close処理ごとに別々の確認文言を乱立させない
* tab.isDirty を無視しない
* active tab の復元を壊さない

---

# 5. テキスト編集時のシンタックスハイライト

## 目的

Preview / Editor でテキスト編集する時、拡張子に応じて文字色を付ける。

対象例：

* .js / .jsx
* .ts / .tsx
* .json
* .css
* .html
* .xml
* .py
* .sh / .bash / .zsh
* .md

---

## 現在の問題

textarea は通常、文字ごとに色を変えられません。
そのため、VSCode風にするには overlay layer が必要です。

---

## 方針

既存の editor highlight layer がある場合は、それを利用してください。

構成例：

```text
editor-shell
  editor-highlight-layer  ← 色付きHTML表示
  textarea.editor-area    ← 実入力
```

textarea の文字色は透明にしすぎると過去に「64行目以降が透明」バグがあったため注意してください。

---

# 5-1. 推奨実装

既に highlight layer がある場合：

* textarea は通常表示のまま維持
* highlight layer は背景的に使う
* 文字色透明化は慎重に行う
* まずは編集テキストの下地として軽く色が見える程度でもよい

ただし本格的に色を反映するなら、textareaの文字を透明にして、背面のhighlight HTMLを見せる必要があります。

過去に透明化バグがあったため、今回は以下を推奨します。

```text
Phase A:
- textarea はそのまま表示
- highlight layer は使わず、code-preview側とMarkdown Preview側のハイライト強化を優先

Phase B:
- editor overlay方式を慎重に導入
```

ただし今回の要望は「テキスト編集時」なので、最低限 overlay 方式で対応してください。

---

# 5-2. highlight.js を使う

既に highlight.js を使っている場合はそれを再利用してください。

確認：

* hljs import
* detectLanguage(fileName)
* renderedHtml
* code preview 処理

既に PreviewPane.jsx に `detectLanguage(fileName)` がある場合、それを編集用highlightにも使うこと。

---

## 5-3. highlight HTML生成

```js
function renderHighlightedEditValue(fileName, value) {
  const language = detectLanguage(fileName);

  try {
    if (language && language !== "plaintext") {
      return hljs.highlight(value, { language }).value;
    }
  } catch (error) {
    console.warn("highlight failed", error);
  }

  return escapeHtml(value);
}
```

escapeHtml がなければ追加。

```js
function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}
```

---

## 5-4. 改行保持

highlight layer は textarea と同じ行高・フォント・paddingにしてください。

```jsx
<pre
  className="editor-syntax-layer"
  aria-hidden="true"
  dangerouslySetInnerHTML={{
    __html: highlightedEditHtml
  }}
/>
<textarea
  className="editor-area"
  ...
/>
```

CSS：

```css
.editor-syntax-layer,
.editor-area {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: calc(10.5px * var(--preview-font-scale));
  line-height: 1.55;
  padding: 8px;
  tab-size: 2;
  white-space: pre;
}
```

---

## 5-5. scroll同期

textarea と syntax layer の scroll を同期してください。

```js
function handleEditorScroll(event) {
  const target = event.currentTarget;

  if (syntaxLayerRef.current) {
    syntaxLayerRef.current.scrollTop = target.scrollTop;
    syntaxLayerRef.current.scrollLeft = target.scrollLeft;
  }

  // 既存のPreview同期も維持
}
```

---

## 5-6. textarea文字色

本格的な overlay では textarea の文字を透明にする必要があります。

ただし、過去に文字透明化バグがあったため、以下のどちらかを選んでください。

### 安全案

textarea文字は薄く表示し、highlight layer は下に置く。

```css
.editor-area.syntax-enabled {
  color: rgba(255, 255, 255, 0.18);
  -webkit-text-fill-color: rgba(255, 255, 255, 0.18);
  background: transparent;
}
```

### 本格案

textarea文字を透明にする。

```css
.editor-area.syntax-enabled {
  color: transparent;
  -webkit-text-fill-color: transparent;
  caret-color: var(--text-main);
  background: transparent;
}
```

今回は安全案を優先してください。

---

## 5-7. 選択範囲とカーソル

textarea の selection / caret は必ず見えるようにしてください。

```css
.editor-area.syntax-enabled {
  caret-color: var(--text-main);
}
```

---

## 5-8. 対応拡張子

detectLanguage を拡張してください。

例：

```js
const map = {
  js: "javascript",
  jsx: "javascript",
  ts: "typescript",
  tsx: "typescript",
  json: "json",
  py: "python",
  sh: "bash",
  bash: "bash",
  zsh: "bash",
  html: "xml",
  xml: "xml",
  css: "css",
  md: "markdown",
  yml: "yaml",
  yaml: "yaml",
  sql: "sql"
};
```

highlight.js に存在しない言語は plaintext に fallback。

---

## 5-9. Markdown編集中

Markdownの場合は、Markdownそのものの記法が色分けされる程度でよいです。
Previewとは別。

---

## 5-10. パフォーマンス

highlight は editValue が変わるたびに走るため、useMemo を使ってください。

```js
const highlightedEditHtml = useMemo(() => {
  return renderHighlightedEditValue(activeTab?.name || "", editValue);
}, [activeTab?.name, editValue]);
```

---

# 6. 禁止事項

* Cmd+F / Cmd+D を壊さない
* 複数選択編集を壊さない
* Save / dirty を壊さない
* 64行目以降が透明になる問題を再発させない
* textarea を readOnly にしない
* Terminal Dock を触らない
* node-pty / xterm を触らない
* Settings保存を触らない
* TREEの右クリックや作成UIを触らない
* tab.content / isDirty を壊さない

---

# 7. 確認

## タブ操作

1. タブを複数開く
2. タブをドラッグして順番を変えられる
3. active tab は維持される
4. dirty tab の状態が維持される
5. タブ右クリックメニューが前面に表示される
6. Close が動く
7. Close Others が動く
8. Close to Right が動く
9. Copy Path が動く
10. Reveal in Tree が動く、または未実装なら明確に警告される
11. 未保存タブを閉じる時に確認が出る

---

## シンタックスハイライト

1. .js ファイルを編集すると関数 / keyword 等が色分けされる
2. .py ファイルを編集すると色分けされる
3. .json ファイルを編集すると色分けされる
4. .md ファイルでも最低限色分けされる
5. 入力・削除・貼り付けが従来通り動く
6. Cmd+F / Cmd+D が従来通り動く
7. 複数選択編集が壊れていない
8. 64行目以降の文字が消えない
9. スクロール時にsyntax layerがズレない
10. npm run build が成功する

---

# 出力

以下のみ提示してください。

* タブドラッグ並び替えの実装箇所
* タブ右クリックメニューの実装箇所
* 未保存タブ確認の実装箇所
* Reveal in Tree の対応内容
* テキスト編集シンタックスハイライトの実装箇所
* Cmd+F / Cmd+D / Save / dirty に影響させていないこと
* npm run build の結果
