Markdown Preview / Editor 内のコードブロックを「Terminal Glass風」のスタイリッシュな見た目に変更してください。
CSS中心の最小差分で対応し、既存のMarkdown描画・Cmd+F / Cmd+D・Save / dirty・タブ状態管理には触らないこと。

---

【目的】

- コードブロックを黒ベタではなく、透過UIに合うガラス風デザインにする
- NightOps全体の透明感と統一する
- コードの可読性を上げる
- Markdown内のコードブロックを見つけやすくする

---

【対象】

主に以下のCSSを確認・修正してください。

- .markdown-body pre
- .markdown-body code
- .markdown-preview pre
- .markdown-preview code
- .code-preview
- pre
- code

実際にMarkdown Previewで使われているselectorを優先してください。

---

【デザイン方針】

Terminal Glass風にしてください。

イメージ：

┌──────────────────────────────┐
│ code                         │
│──────────────────────────────│
│ const value = 1;              │
│ console.log(value);           │
└──────────────────────────────┘

---

【コードブロック本体】

pre は以下の方向で調整してください。

```css
.markdown-body pre,
.markdown-preview pre {
  position: relative;
  margin: 12px 0;
  padding: 30px 14px 14px;
  overflow-x: auto;
  border-radius: 8px;
  border: 1px solid rgba(255, 255, 255, 0.10);
  background:
    linear-gradient(
      180deg,
      rgba(var(--bg-surface-base), calc(var(--surface-alpha) * 0.38)) 0%,
      rgba(var(--bg-panel-base), calc(var(--surface-alpha) * 0.24)) 100%
    );
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.05);
}