Browseで参照ディレクトリを切り替える時、現在開いている Preview / Editor の全タブを閉じるようにしてください。
ただし、未保存タブがある場合は事前に確認ダイアログを表示し、ユーザーが許可した場合のみ切り替えること。

---

【目的】

- 参照ディレクトリ変更時に、古いワークスペースのタブが残らないようにする
- 別ディレクトリのファイル状態が混ざる不具合を防ぐ
- 未保存内容を誤って失わないようにする

---

【対象】

Browseボタンで参照ディレクトリを変更する処理

対象ファイル例：

- src/App.jsx
- src/components/PreviewPane.jsx
- electron/main.js
- electron/preload.js

※ 実際のBrowse処理がある場所を確認して、そこだけ修正してください。

---

【仕様】

Browseで新しいディレクトリを選択した時：

1. 現在開いている全ペイン / 全タブを確認
2. isDirty === true のタブがあるか判定
3. 未保存タブがある場合は確認ダイアログを表示
4. ユーザーがキャンセルした場合はディレクトリ変更しない
5. ユーザーが続行した場合のみ以下を実行
   - 全タブを閉じる
   - activeTab をクリア
   - pane状態を初期化
   - selectedFile / activePath など表示対象をクリア
   - rootPath を新しいディレクトリへ変更

---

【未保存判定】

全pane / 全tabを対象にすること。

例：

const hasUnsavedTabs = panes.some(pane =>
  pane.tabs.some(tab => tab.isDirty)
);

未保存数も取得できるなら取得する。

例：

const unsavedCount = panes.reduce((count, pane) => {
  return count + pane.tabs.filter(tab => tab.isDirty).length;
}, 0);

---

【確認ダイアログ】

未保存タブがある場合：

表示文言例：

未保存のファイルが 2 件あります。
ディレクトリを切り替えると、未保存の変更は破棄されます。
続行しますか？

ボタン：

- Cancel
- Continue

Cancel：

- 何もしない
- Browse処理を中断

Continue：

- 未保存内容を破棄してディレクトリ変更

---

【Electron側の確認ダイアログ】

可能なら Electron の dialog.showMessageBox を使ってください。

electron/main.js：

ipcMain.handle("dialog:confirm-discard-unsaved", async (_, count) => {
  const result = await dialog.showMessageBox({
    type: "warning",
    buttons: ["Cancel", "Continue"],
    defaultId: 0,
    cancelId: 0,
    title: "Unsaved changes",
    message: `未保存のファイルが ${count} 件あります。`,
    detail: "ディレクトリを切り替えると、未保存の変更は破棄されます。続行しますか？"
  });

  return result.response === 1;
});

---

【preload】

window.api に追加してください。

confirmDiscardUnsaved: (count) =>
  ipcRenderer.invoke("dialog:confirm-discard-unsaved", count)

---

【Browse処理側】

疑似コード：

async function handleBrowseDirectory() {
  const nextDirectory = await browseDirectory();
  if (!nextDirectory) return;

  const unsavedCount = getUnsavedTabCount();

  if (unsavedCount > 0) {
    const ok = await window.api.confirmDiscardUnsaved(unsavedCount);
    if (!ok) {
      return;
    }
  }

  resetEditorWorkspace();
  setRootPath(nextDirectory);
}

---

【タブ・ペイン初期化】

追加または既存関数を利用してください。

例：

function resetEditorWorkspace() {
  setPanes([
    {
      id: "pane-1",
      tabs: [],
      activeTabPath: null
    }
  ]);

  setActivePaneId("pane-1");
  setSelectedFile(null);
  setFileData(null);
  setEditValue("");
  setBaseEditValue("");
  setSelections([]);
  setSearchQuery("");
  setShowSearchBar(false);
}

※ 実際のstate名に合わせて修正してください。

---

【重要】

rootPath を変更する前に resetEditorWorkspace() を実行すること。

理由：

- 古いrootPath配下のタブが残るのを防ぐ
- TREE / Preview / Editor の参照ズレを防ぐ

---

【localStorage対応】

タブやペイン状態を localStorage に保存している場合：

Browse切り替え時に古いタブ状態を削除してください。

例：

localStorage.removeItem("nightops:open-tabs");
localStorage.removeItem("nightops:panes");

※ 実際のキー名がある場合のみ対象。

---

【禁止】

- 未保存タブがある状態で無確認に閉じる
- rootPathだけ変更してタブを残す
- activeTabPathだけ残す
- selectedFileだけ残す
- 確認前にタブを閉じる
- Browseキャンセル時に状態を変更する
- 既存の保存処理を変更する

---

【確認】

以下を実際に確認してください。

1. ファイルを複数開く
2. 未保存なしでBrowseする
3. ディレクトリ変更後、全タブが閉じている
4. ファイルを編集して未保存状態にする
5. Browseする
6. 確認ダイアログが出る
7. Cancelで何も変わらない
8. Continueで全タブが閉じ、ディレクトリが切り替わる
9. selectedFile / Preview / Editor が空になる
10. npm run build が成功する

---

【出力】

変更箇所のみ提示してください。