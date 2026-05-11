outline toggle を tab action 側へ移動した結果、

[ Preview ] [ Edit ] [ ☰ Outline ]

の横幅によって、
ファイル名表示領域が圧迫されています。

タブタイトル（ファイル名）が優先して見えるよう、
tab layout を調整してください。

目的:
- ファイル名の視認性維持
- action button 群による圧迫防止
- AIドキュメント作業時の識別性向上

---

# 要件

現在:

[ FileName.md ][ Preview ][ Edit ][ ☰ Outline ]

action 側が固定幅寄りになっており、
ファイル名領域が圧迫されています。

以下へ調整してください。

---

# レイアウト方針

## ファイル名領域を優先

- file tab title を flex-grow
- action buttons は shrink 最小化

推奨:

- title: flex: 1 1 auto
- actions: flex: 0 0 auto

---

# ボタンサイズ縮小

Preview / Edit / Outline は
必要最小サイズへ調整。

推奨:

- padding 縮小
- gap 縮小
- icon + short label
- height 統一

---

# 長いファイル名

ファイル名領域は:

- overflow hidden
- text-overflow ellipsis
- white-space nowrap

を適用。

ただし可能な限り表示幅を確保してください。

---

# 優先順位

表示優先度:

1. ファイル名
2. Edit
3. Preview
4. Outline

outline は最悪 icon only へ縮退可能。

---

# レスポンシブ

横幅不足時:

☰ Outline
↓
☰

へ自動縮退しても良いです。

---

# 推奨構造

.tab-header
  ├─ .tab-title
  └─ .tab-actions

.tab-title
  flex: 1 1 auto
  min-width: 0

.tab-actions
  flex: 0 0 auto

---

# 追加推奨

可能なら:

hover 時に full file path tooltip 表示。

---

# 確認項目

- ファイル名表示幅が増えている
- 長いmd名でも見やすい
- ボタン群が右寄せされている
- 横幅不足時に崩れない
- build 通過

変更対象:
- src/components/PreviewPane.jsx
- src/styles.css