■ ① right を完全削除（最重要）

.outline-divider から以下を削除：

right: 0;
right: any;

※ 1つでも残っていたら絶対に右に張り付きます

---

■ ② left を強制適用（JSXで）

dividerに直接：

style={{
  left: `${outlineWidth}px`
}}

---

■ ③ transform があれば削除

NG：

transform: translateX(...)
transform: translate(...)

---

■ ④ 親の幅を確認（重要）

markdown-preview-layout に：

width: 100%;

---

■ ⑤ asideのwidthと一致させる

aside：

style={{
  width: `${outlineWidth}px`
}}

divider：

style={{
  left: `${outlineWidth}px`
}}

👉 この2つが完全一致

---

■ ⑥ position確認

.layout {
  position: relative;
}

.divider {
  position: absolute;
}

---

■ ⑦ 最終チェック（必須）

console.log({
  outlineWidth,
  dividerLeft: divider.style.left
})

---

■ ⑧ 強制テスト

一時的に：

divider.style.left = "200px";

👉 動けばOK（JSは正しい）
👉 動かなければCSSが勝っている

---

■ ゴール

- dividerが緑線（outline右端）に一致
- ドラッグで連動して動く