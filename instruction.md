アプリ全体のベゼル（余白・枠）を細くしてください。
レイアウトは変えず、数値のみ調整すること。

---

■ ① パネル系 padding 縮小

対象：

- 左TREE
- Preview / Editor
- Settings
- TopBar

変更：

padding: 16px → 8px
padding: 12px → 6px

---

■ ② コンテナ間ギャップ縮小

変更：

gap: 16px → 8px
gap: 12px → 6px

---

■ ③ border-radius 縮小

変更：

12px → 6px
10px → 5px
8px → 4px

---

■ ④ ボーダー細化

変更：

border: 1px → 0.5px or 1px透明度下げ

例：

border: 1px solid rgba(255,255,255,0.08);

---

■ ⑤ タブ高さ圧縮

変更：

height: 36px → 28px

padding:

8px → 4px

---

■ ⑥ カード内余白

変更：

padding: 16px → 8px

---

■ ⑦ Outline 行間

変更：

line-height: 1.6 → 1.3

---

■ ⑧ アイコン周り

変更：

margin: 8px → 4px

---

■ ⑨ Divider 太さ

変更：

4px → 2px

---

■ ⑩ TopBar 高さ

変更：

60px → 44px〜48px

---

■ ⑪ TREE 行高さ

変更：

24px → 20px

---

■ ⑫ 余白の優先順位

優先削減順：

1. 外側padding
2. gap
3. border-radius
4. 内側padding

---

■ 禁止

- フォントサイズ変更（今回はやらない）
- レイアウト構造変更
- スクロール領域変更

---

■ ゴール

- 全体が締まる
- VSCode寄りの密度
- 情報量増加

---

■ 出力

- styles.css の変更箇所のみ提示