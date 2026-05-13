
Preview / Editor の本文表示で、スクロール操作による拡大・縮小がコードブロックにも反映されるように修正してください。
既存のズーム操作・Markdown表示・Cmd+F / Cmd+D・Save / dirty には触らず、CSS中心の最小差分で対応してください。

---

【問題】

現在、Preview / Editor の通常テキストはスクロール操作で拡大・縮小されますが、Markdown内のコードブロックには同じ拡大率が反映されていません。

そのため、本文だけ拡大され、コードブロック内の文字サイズが小さいままになり、視認性が悪くなっています。

---

【目的】

- Preview / Editor の本文ズーム倍率をコードブロックにも反映する
- 通常本文とコードブロックの表示サイズ差を減らす
- 最小サイズでは多少制限してよい
- コードブロックの可読性を維持する
- Terminal Glass風デザインは維持する

---

【対象】

主に以下のCSSを確認してください。

- .markdown-preview
- .markdown-body
- .markdown-main
- .markdown-preview pre
- .markdown-preview pre code
- .markdown-body pre
- .markdown-body pre code
- .code-preview
- .markdown-code-shell
- .markdown-inline-code
- :not(pre) > code

---

【確認する既存変数】

現在、本文ズームに使っている変数を確認してください。

候補：

```css
--preview-font-scale
--editor-font-scale
--markdown-font-scale
````

既存で本文に使っているものを流用してください。

例：

```css
font-size: calc(13px * var(--preview-font-scale));
```

---

【修正方針】

コードブロックの font-size を固定値にせず、本文と同じズーム変数を使ってください。

NG：

```css
.markdown-preview pre code {
  font-size: 12.5px;
}
```

OK：

```css
.markdown-preview pre code {
  font-size: clamp(
    11px,
    calc(12.5px * var(--preview-font-scale)),
    18px
  );
}
```

---

【コードブロック本体】

pre 内の code にズーム倍率を適用してください。

```css
.markdown-preview pre code,
.markdown-body pre code,
.markdown-code-shell pre code,
.code-preview code {
  font-size: clamp(
    11px,
    calc(12.5px * var(--preview-font-scale)),
    18px
  );
  line-height: 1.55;
}
```

既存のズーム変数名が `--preview-font-scale` でない場合は、実際に本文へ使われている変数へ合わせてください。

---

【code-preview全体】

ファイル全体をコード表示している場合も同じ倍率を反映してください。

```css
.code-preview {
  font-size: clamp(
    11px,
    calc(12.5px * var(--preview-font-scale)),
    18px
  );
  line-height: 1.55;
}
```

---

【インラインコード】

インラインコードも本文に合わせて拡大・縮小してください。

```css
.markdown-preview :not(pre) > code,
.markdown-body :not(pre) > code,
.markdown-inline-code {
  font-size: clamp(
    0.85em,
    calc(0.92em * var(--preview-font-scale)),
    1.15em
  );
}
```

ただし、本文とのバランスが崩れる場合は `font-size: 0.92em;` のままでもよいです。

優先はコードブロックです。

---

【ヘッダー帯の文字】

Terminal Glass風コードブロックの `pre::before` にある `code` ラベルは、本文ズームに完全追従しなくてもよいです。

ただし極端に小さく見える場合は以下のように調整してください。

```css
.markdown-preview pre::before,
.markdown-body pre::before {
  font-size: clamp(
    9px,
    calc(10px * var(--preview-font-scale)),
    12px
  );
}
```

---

【行間】

ズーム時に詰まりすぎないよう、コードブロックは line-height を維持してください。

推奨：

```css
line-height: 1.55;
```

または：

```css
line-height: calc(1.45 + (var(--preview-font-scale) * 0.05));
```

ただし、複雑にしすぎないこと。

---

【最小サイズ制限】

コードは小さすぎると読みにくいため、clampで最小サイズを持たせてください。

推奨：

* 最小：11px
* 基準：12.5px × preview scale
* 最大：18px

---

【最大サイズ制限】

拡大時にコードブロックだけ巨大になりすぎないようにしてください。

推奨：

* 最大：18px〜20px

---

【横スクロール】

ズーム後も長いコードが崩れないよう、横スクロールは維持してください。

```css
.markdown-preview pre,
.markdown-body pre,
.code-preview {
  overflow-x: auto;
  max-width: 100%;
}
```

---

【禁止】

* JSX変更
* Markdownパーサ変更
* Cmd+F / Cmd+D 変更
* Save / dirty 変更
* ズーム操作自体のロジック変更
* コードブロックのTerminal Glass風デザイン削除
* コードを折り返し固定に変更すること
* 親要素の opacity を変更すること

---

【確認】

以下を確認してください。

1. Preview / Editor で通常テキストを拡大する
2. Markdown内のコードブロック文字も拡大される
3. 通常テキストを縮小するとコードブロックも縮小される
4. コードブロックは小さくなりすぎない
5. Terminal Glass風の見た目は維持される
6. 横スクロールが維持される
7. インラインコードも極端に浮かない
8. npm run build が成功する

---

【出力】

以下のみ提示してください。

* 既存本文ズームに使われていたCSS変数名
* コードブロックへズーム反映したCSSクラス
* clampで設定した最小 / 基準 / 最大サイズ
* Terminal Glass風デザインを維持したこと
* npm run build の結果

```
```
