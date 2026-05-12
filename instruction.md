UI最上段の行の上下ベゼルをさらに細くしてください。
既存レイアウト・表示内容は変更せず、縦方向の余白だけを最小化すること。

---

【目的】

- UI最上段の高さを抑える
- ウィンドウ操作ボタン、ユーザー名、容量、Git、Unsaved、パス表示は維持
- VSCode風に情報密度を上げる

---

【対象】

- 最上段ヘッダー
- ウィンドウ操作ボタンがある行
- ユーザー名 / 容量 / Git / Unsaved / パス表示がある行

想定対象クラス例：

- .app-header
- .top-bar
- .title-bar
- .top-status-strip
- .path-display
- .window-controls

※ 実際のクラス名を確認して該当箇所のみ修正すること。

---

【修正内容】

1. 上下 padding を削減

例：

padding-top: 6px → 2px
padding-bottom: 6px → 2px

または：

padding: 6px 12px → 2px 10px

---

2. min-height / height を削減

例：

height: 36px → 26px〜28px
min-height: 36px → 26px〜28px

---

3. line-height を調整

例：

line-height: 1.4 → 1.1
line-height: 20px → 16px

---

4. align-items は center を維持

display: flex;
align-items: center;

---

5. gap は必要最小限に調整

例：

gap: 10px → 6px

---

【注意】

ウィンドウ操作ボタンと文字が縦方向にズレないようにしてください。

必要であれば、ウィンドウ操作ボタン側も以下のように調整します。

.window-controls {
  height: 24px;
  display: flex;
  align-items: center;
}

---

【禁止】

- 表示項目の削除
- 横方向レイアウトの大幅変更
- フォントサイズの大幅変更
- ウィンドウ操作ボタン位置の変更
- パス表示の削除
- TopBarを2行化すること

---

【推奨値】

最上段の最終高さは 26px〜30px 程度を目標にする。

---

【確認】

1. 最上段の高さが低くなる
2. ウィンドウ操作ボタンと表示文字が重ならない
3. ユーザー名 / 容量 / Git / Unsaved が表示される
4. パス表示が残っている
5. クリック操作に支障がない
6. npm run build が成功する

---

【出力】

styles.css の変更箇所のみ提示してください。