
TREE の右クリックメニューがまだ TREE コンテナ内に埋まって表示されています。
z-index 調整だけでは解決できていないため、必ず Portal 化して document.body 直下に描画してください。

---

【現状の問題】

添付画像を見る限り、右クリックメニューが TREE コンテナの表示領域内に閉じ込められています。

現在の問題は z-index だけではありません。

原因候補：

- .left-panel / .tree-root / .tree-virtual-viewport の overflow によりクリップされている
- TREE コンテナ内にメニューDOMを置いているため、パネル幅の制約を受けている
- position: fixed にしても、親の stacking context / transform / contain の影響を受けている
- z-index: 3000 でも、同じ親コンテキスト内でしか効いていない

したがって、CSSだけで直そうとしないこと。

---

【必須修正】

tree-context-menu を React Portal で document.body 直下に出してください。

---

【対象】

- src/components/FileTree.jsx
- src/styles.css

---

【① createPortal を import】

FileTree.jsx の先頭に追加：

```js
import { createPortal } from "react-dom";
````

既に import がある場合は重複させないこと。

---

【② contextMenu の座標は viewport 基準を維持】

右クリック時は必ず clientX / clientY を使うこと。

```js
function openContextMenu(event, targetPath) {
  event.preventDefault();
  event.stopPropagation();

  const menuWidth = 220;
  const menuHeight = 320;

  const x = Math.min(event.clientX, window.innerWidth - menuWidth - 8);
  const y = Math.min(event.clientY, window.innerHeight - menuHeight - 8);

  setContextMenu({
    x,
    y,
    targetPath
  });
}
```

pageX / offsetX / TREE内相対座標は使わないこと。

---

【③ メニュー描画を Portal 化】

現在、TREEコンポーネント内で直接描画している tree-context-menu を、以下のように変更してください。

```jsx
{contextMenu
  ? createPortal(
      <div
        className="tree-context-menu"
        style={{
          left: contextMenu.x,
          top: contextMenu.y
        }}
        onClick={(event) => event.stopPropagation()}
        onContextMenu={(event) => event.preventDefault()}
      >
        {/* 既存メニュー項目をここに移す */}
      </div>,
      document.body
    )
  : null}
```

重要：

* メニュー項目の中身は既存のまま移植
* New File / New Folder / Rename / Delete / Copy / Cut / Paste などの処理は変えない
* 表示場所だけ document.body 直下に変更する

---

【④ 外側クリックで閉じる処理】

Portal 化すると TREE 外クリックでも閉じる必要があります。

useEffect で以下を追加または既存処理を確認してください。

```js
useEffect(() => {
  if (!contextMenu) return;

  function handlePointerDown() {
    setContextMenu(null);
  }

  function handleKeyDown(event) {
    if (event.key === "Escape") {
      setContextMenu(null);
    }
  }

  window.addEventListener("pointerdown", handlePointerDown);
  window.addEventListener("keydown", handleKeyDown);

  return () => {
    window.removeEventListener("pointerdown", handlePointerDown);
    window.removeEventListener("keydown", handleKeyDown);
  };
}, [contextMenu]);
```

ただし、メニュー自身のクリックでは閉じすぎないように、メニュー側で stopPropagation すること。

---

【⑤ CSS 修正】

.tree-context-menu は body 直下に出る前提で、fixed / 高z-index にしてください。

```css
.tree-context-menu {
  position: fixed;
  z-index: 5000;
  min-width: 180px;
  max-width: 260px;
  padding: 6px;
  border-radius: 8px;
  background: var(--bg-panel-upper);
  color: var(--text-upper);
  border: 1px solid var(--border-upper);
  box-shadow: 0 16px 40px rgba(0, 0, 0, 0.28);
  overflow: visible;
}
```

---

【⑥ メニュー項目】

```css
.tree-context-menu button,
.tree-context-menu .tree-context-menu-item {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: flex-start;
  padding: 7px 10px;
  border: none;
  border-radius: 5px;
  background: transparent;
  color: var(--text-upper);
  font-size: 12px;
  text-align: left;
  cursor: pointer;
}

.tree-context-menu button:hover,
.tree-context-menu .tree-context-menu-item:hover {
  background: var(--bg-surface-upper-hover);
}
```

Delete など危険操作の色指定は既存を維持してよい。

---

【⑦ left-panel 側の overflow は変更しない】

以下は変更しないこと。

```css
.left-panel
.tree-root
.tree-virtual-viewport
.tree-virtual-slice
```

理由：

* TREEの仮想スクロールを壊す可能性がある
* overflow を visible にするのではなく、メニューを Portal 化して解決する

---

【⑧ z-index 基準】

以下を目安にしてください。

```text
TREE通常行: 1
TREE作成 / リネーム入力: 30
タブメニュー / 検索バー: 2500
TREE右クリックメニュー: 5000
Settings / modal: 6000
BootScreen: 9999
```

---

【⑨ 注意】

今回の修正で触るのは、右クリックメニューの描画場所とCSSだけです。

触らないこと：

* TREEのD&D
* TREEの仮想スクロール
* ファイル作成処理
* リネーム処理
* 削除処理
* 選択処理
* Preview / Editor
* Settings

---

【確認】

以下を実際に確認してください。

1. TREEで右クリックする
2. メニューがTREEコンテナ幅に閉じ込められない
3. メニューがPreview / Editor側に重なって表示できる
4. メニュー右端が切れない
5. New File / New Folder がクリックできる
6. Rename / Delete / Copy / Cut / Paste が動く
7. Finderで表示 / フルパスコピーが動く
8. Escapeで閉じる
9. 外側クリックで閉じる
10. TREEスクロール・仮想スクロールが壊れていない
11. npm run build が成功する

---

【出力】

以下のみ提示してください。

* Portal化した FileTree.jsx の箇所
* contextMenu 座標処理の修正箇所
* 修正した .tree-context-menu CSS
* overflow を変更していないこと
* npm run build の結果

```
```
