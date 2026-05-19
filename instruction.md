今回の実装は一部不足しています。
Terminal Dock 周辺は引き続き触らず、Preview / Editor のタブUX未完了分と、テキスト編集中に37行目以降が非表示になる問題を修正してください。

---

【未完了の必須項目】

以下を実装・修正してください。

1. タブのドラッグ並び替え
2. タブ右クリックメニューに以下を追加
   - Close
   - Close Others
   - Close to Right
   - Copy Path
   - Reveal in Tree
3. 未保存タブを閉じる時の確認
4. テキスト編集中に37行目以降が非表示になる問題の修正
5. 既存の Cmd+F / Cmd+D / Save / dirty を壊さないこと
6. 透明 textarea + 背面ハイライトで、37行目以降 / 64行目以降の文字が消えないことを確認すること

---

【最重要バグ修正】

現在、テキスト編集中に37行目以降が非表示になります。
これは、シンタックスハイライト用の overlay layer と textarea の表示レイヤー、height / overflow / z-index / color transparent の組み合わせが原因の可能性が高いです。

必ず以下を確認して修正してください。

- textarea 自体の文字が37行目以降で透明になっていないか
- editor highlight layer が途中で高さ不足になっていないか
- editor shell / editor area / syntax layer の height が不足していないか
- overflow: hidden により下部行が隠れていないか
- textarea と syntax layer の scrollHeight が一致しているか
- z-index の上下関係で textarea が見えなくなっていないか
- color: transparent / -webkit-text-fill-color: transparent が原因になっていないか

---

【安全優先の修正方針】

37行目以降が消える場合は、textarea の文字を完全透明にしないでください。

NG：

```css
color: transparent;
-webkit-text-fill-color: transparent;
````

安全案：

```css
.editor-area.syntax-enabled {
  color: rgba(255, 255, 255, 0.22);
  -webkit-text-fill-color: rgba(255, 255, 255, 0.22);
  caret-color: var(--text-main);
  background: transparent;
}
```

または、まずは通常表示を優先してください。

```css
.editor-area {
  color: var(--text-main);
  -webkit-text-fill-color: currentColor;
}
```

ハイライトの見た目よりも、入力中の全文が見えることを優先してください。

---

【ハイライトレイヤーの高さ修正】

syntax layer / highlight layer は textarea と同じスクロール内容高さを持つようにしてください。

例：

```css
.editor-syntax-layer,
.editor-area {
  box-sizing: border-box;
  min-height: 100%;
  height: 100%;
  line-height: 1.55;
  white-space: pre;
  overflow: auto;
}
```

ただし、二重スクロールになる場合は、textarea を主スクロールにして syntax layer は scroll 同期してください。

---

【scroll同期】

textarea の scroll 時に syntax layer も同期してください。

```js
function handleEditorScroll(event) {
  const target = event.currentTarget;

  if (syntaxLayerRef.current) {
    syntaxLayerRef.current.scrollTop = target.scrollTop;
    syntaxLayerRef.current.scrollLeft = target.scrollLeft;
  }

  // 既存の Preview 同期も維持
}
```

---

【確認必須】

以下のような長いテキストで確認してください。

* 40行以上
* 70行以上
* コードファイル
* Markdownファイル

確認項目：

* 37行目以降が表示される
* 64行目以降も表示される
* 入力中の文字が見える
* caret が見える
* 選択範囲が見える
* scroll 時に syntax layer と textarea がズレない
* Cmd+F / Cmd+D が壊れていない
* Save / dirty が壊れていない

---

【タブドラッグ並び替え】

同一 pane 内だけでよいです。
pane 間移動は不要です。

* active tab は維持
* dirty 状態は維持
* tab.content / tab.path / tab.isDirty は壊さない

---

【右クリックメニュー】

右クリックメニューは document.body 直下に Portal 表示してください。

項目:

* Close
* Close Others
* Close to Right
* Copy Path
* Reveal in Tree

---

【未保存確認】

以下の操作で、閉じる対象に isDirty が含まれる場合は確認を出してください。

* タブの close button
* 右クリック Close
* Close Others
* Close to Right

Browse切替時の未保存確認ダイアログが既にある場合は再利用してください。

---

【Reveal in Tree】

既存の Tree 選択APIがある場合は実装してください。
難しい場合は、今回はメニュー項目を disabled にするか、console.warn で未実装を明示してください。
ただし、その場合は出力で「Reveal in Tree は未接続」と明記してください。

---

【禁止】

* Terminal Dock を触らない
* node-pty / xterm を触らない
* Settings保存を触らない
* Cmd+F / Cmd+D を壊さない
* Save / dirty を壊さない
* textarea を readOnly にしない
* 37行目以降が見えない状態で完了扱いにしない

---

【出力】

以下のみ提示してください。

* 37行目以降が非表示になっていた原因
* 37行目以降 / 64行目以降の表示修正箇所
* タブドラッグ並び替えの実装箇所
* タブ右クリックメニューの実装箇所
* Close Others / Close to Right / Copy Path / Reveal in Tree の対応内容
* 未保存タブ確認の実装箇所
* Cmd+F / Cmd+D / Save / dirty に影響させていないこと
* npm run build の結果

