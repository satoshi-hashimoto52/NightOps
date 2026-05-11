TREEヘッダー行にソート切替ボタンを追加してください。
既存レイアウトは変更せず、最小差分で実装すること。

---

【配置】

Treeラベルと Fold(Cmd+B) がある行の「右端」に配置

例：

[Tree]  [Fold(Cmd+B)]                          [Name ▼]

---

【ボタン仕様】

単一ボタンでトグル切替

押下ごとに：

Name → Ext → Update → Name

表示も連動：

Name ▼
Ext ▼
Update ▼

---

【状態管理】

追加：

const [sortMode, setSortMode] = useState("name")

---

【永続化】

localStorage使用：

キー：treeSortMode

起動時に復元

---

【クリック処理】

setSortModeを以下順で切替：

name → ext → update → name

---

【ソート処理】

TREE描画前に適用：

sortFiles(files, sortMode)

---

【ソートルール】

① 共通
・ディレクトリは常に上

---

② name
・ファイル名昇順

---

③ ext
・拡張子 → ファイル名

---

④ update
・更新日時降順（新しい順）

---

【ソート関数】

function sortFiles(files, mode) {
  return [...files].sort((a, b) => {
    if (a.isDir !== b.isDir) {
      return a.isDir ? -1 : 1;
    }

    if (mode === "ext") {
      const extA = a.name.includes('.') ? a.name.split('.').pop() : ''
      const extB = b.name.includes('.') ? b.name.split('.').pop() : ''
      if (extA !== extB) return extA.localeCompare(extB)
      return a.name.localeCompare(b.name)
    }

    if (mode === "update") {
      return (b.mtime || 0) - (a.mtime || 0)
    }

    return a.name.localeCompare(b.name)
  })
}

---

【UIスタイル】

クラス：.tree-sort-btn

.tree-sort-btn {
  font-size: 12px;
  color: #aaa;
  cursor: pointer;
}

.tree-sort-btn:hover {
  color: #fff;
}

---

【動作】

・クリックで即時反映
・TREE再読み込み不要
・展開状態は維持

---

【禁止】

・ドロップダウン化
・複数ボタン化
・レイアウト変更

---

【ゴール】

・1ボタンでソート切替
・表示が即変わる
・状態が保持される

---

【出力】

変更箇所のみ提示