Outlineとテキスト表示領域の間をドラッグで伸縮できるようにしてください。
既存のPane分割とは独立して実装すること。

---

【目的】
- Outline幅を自由に調整
- 長い構造や本文を見やすくする
- IDE相当の操作性にする

---

■ ① レイアウト構造変更

現在：

[Outline][Text]

↓

変更：

[Outline][Divider][Text]

---

■ ② 状態追加

const [outlineWidth, setOutlineWidth] = useState(240)

---

■ ③ 幅制御

Outline：

width: outlineWidth px
flex: 0 0 auto

Text：

flex: 1

---

■ ④ Divider追加

<div className="outline-divider" />

---

■ ⑤ ドラッグ処理

mousedown：

isResizing = true

pointermove：

newWidth = mouseX - containerLeft

setOutlineWidth(newWidth)

---

■ ⑥ 制限（重要）

outlineWidth の範囲：

min: 160px
max: 600px

---

■ ⑦ pointerイベント（重要）

window にバインド：

pointermove
pointerup

---

■ ⑧ CSS

.outline-divider {
  width: 4px;
  cursor: col-resize;
  background: transparent;
}

.outline-divider:hover {
  background: rgba(255,255,255,0.1);
}

---

■ ⑨ スクロールとの分離

- Outline は独立スクロール
- Text も独立スクロール

---

■ ⑩ 保存（任意）

localStorage に保存：

outlineWidth

---

■ ⑪ Pane分割との独立性

- Pane分割の splitRatio と混ぜない
- 各Pane内で独立管理

---

■ ⑫ パフォーマンス

- requestAnimationFrame 推奨
- setState連打防止

---

■ 禁止

- flex:1 のまま width変更
- transformで位置調整
- 親レイアウト変更

---

■ ゴール

- Outlineと本文の境界をドラッグで調整可能
- 他の分割（Pane）と干渉しない

---

■ 出力

- 変更箇所のみ提示