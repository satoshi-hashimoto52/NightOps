・UIのLaunchボタンを機能はそのままにターミナルアイコンへ置き換える。アイコンデザインは右の歯車と同じ系統にする。
・TREE内のファイル・フォルダ作成UIが最背面に表示されてしまう問題を修正してください。
CSS / コンポーネント構造の最小差分で対応し、既存のTREE操作・D&D・選択・リネーム機能は壊さないこと。

---

【問題】

TREE内で新規ファイル / 新規フォルダを作成するUIが、他のUI要素の背面に回ってしまい、入力欄やメニューが見えにくい、または操作しづらい状態になっている。

想定される原因：

- z-index が低い
- 親要素に overflow: hidden がある
- TREEの仮想スクロール領域内に作成UIが描画されている
- panel / pane / preview 側の z-index が高い
- context menu / inline input が通常行と同じレイヤーにある
- position 指定が不足している

---

【目的】

- 新規ファイル / 新規フォルダ作成UIを常に前面に表示する
- 入力欄がTREE内で見やすく操作しやすい状態にする
- TREEのスクロールや仮想スクロールに邪魔されないようにする
- 既存のリネーム入力欄とも見た目・挙動を統一する

---

【対象】

主に以下を確認してください。

- src/components/FileTree.jsx
- src/styles.css

関連クラス候補：

- .tree-root
- .tree-virtual-viewport
- .tree-virtual-slice
- .tree-row
- .tree-context-menu
- .tree-rename-input
- .tree-create-input
- .tree-inline-editor
- .left-panel

実際のクラス名に合わせて修正すること。

---

【① 作成UIの描画レイヤーを上げる】

新規作成UI、リネームUI、コンテキストメニューはTREE通常行より前面に出してください。

例：

```css
.tree-create-input,
.tree-rename-input,
.tree-inline-editor {
  position: relative;
  z-index: 30;
}