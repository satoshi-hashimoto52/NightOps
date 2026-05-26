
.app 起動後、Browse ボタンでディレクトリ変更すると以下のエラーが出ています。

Error invoking remote method 'settings:save': Error: ENOTDIR: not a directory, open '/Users/hashimoto/vscode/_app/NightOps/release/mac-arm64/NightOps.app/Contents/Resources/app.asar/settings.json'

原因は、packaged .app で settings.json を app.asar 内へ保存しようとしているためです。
app.asar は書き込み先として使えないため、settings.json の保存先を Electron の userData 配下へ変更してください。

Terminal Dock / node-pty / xterm / Preview / Editor / TREE の機能は触らず、settings の保存先だけを修正してください。

---

# 目的

packaged .app でも Settings / Browse 後の rootPath 保存が正常に動くようにする。

---

# 現状の問題

現在、settings:save が以下へ書き込もうとしている。

```text
NightOps.app/Contents/Resources/app.asar/settings.json
```

これは packaged app では不正です。

app.asar はディレクトリではなくアーカイブ扱いであり、書き込み先にしてはいけません。

---

# 修正方針

settings.json の保存先を以下へ変更してください。

```js
app.getPath("userData")
```

例：

```js
const settingsPath = path.join(app.getPath("userData"), "settings.json");
```

macOS では通常、以下のような場所になります。

```text
~/Library/Application Support/NightOps/settings.json
```

---

# 対象

主に以下を確認してください。

* electron/main.js
* settings:load
* settings:save
* defaultSettings
* rootPath 保存処理
* Browse 後に呼ばれる settings 保存処理

---

# 1. settingsPath の定義を修正

NG 例：

```js
const settingsPath = path.join(app.getAppPath(), "settings.json");
```

または：

```js
const settingsPath = path.join(__dirname, "../settings.json");
```

OK：

```js
function getSettingsPath() {
  return path.join(app.getPath("userData"), "settings.json");
}
```

---

# 2. userData ディレクトリを作成

保存前にディレクトリが存在することを保証してください。

```js
function ensureSettingsDir() {
  const settingsDir = app.getPath("userData");
  fs.mkdirSync(settingsDir, { recursive: true });
}
```

保存時：

```js
function saveSettings(settings) {
  ensureSettingsDir();
  fs.writeFileSync(
    getSettingsPath(),
    JSON.stringify(settings, null, 2),
    "utf-8"
  );
}
```

---

# 3. load 側も userData から読む

```js
function loadSettings() {
  const settingsPath = getSettingsPath();

  if (!fs.existsSync(settingsPath)) {
    return defaultSettings;
  }

  try {
    const raw = fs.readFileSync(settingsPath, "utf-8");
    return {
      ...defaultSettings,
      ...JSON.parse(raw)
    };
  } catch (error) {
    console.warn("[settings] failed to load settings", error);
    return defaultSettings;
  }
}
```

---

# 4. 初回起動時

初回起動時に settings.json がなくても正常に起動すること。

* settings.json がなければ defaultSettings を使う
* 保存時に userData/settings.json を作成する

---

# 5. 開発時との互換

開発時も同じ userData 保存でよいです。

ただし、既存のプロジェクト直下 settings.json を使っていた場合、必要なら移行処理を追加してもよいです。

今回は最小修正でよいので、移行は必須ではありません。

---

# 6. 既存 settings 項目を維持

以下の既存設定が保存・読み込みできることを確認してください。

* rootPath
* Appearance
* backgroundOpacity
* containerOpacity
* terminalFontSize
* terminalFontFamily
* その他既存 settings

---

# 7. packaged app での確認

以下を実行してください。

```bash
npm run build
npm run pack:mac
open release/mac-arm64/NightOps.app
```

確認：

1. .app が起動する
2. Browse を押す
3. 任意ディレクトリを選択する
4. settings:save エラーが出ない
5. TREE が選択ディレクトリへ切り替わる
6. アプリを終了して再起動する
7. 選択した rootPath が復元される
8. settings.json が userData 配下に作成される

---

# 8. userData パスの確認ログ

一時的に以下のログを出してもよいです。

```js
console.log("[settings] path", getSettingsPath());
```

ただし確認後、不要なら削除してください。

---

# 9. 禁止

* settings.json を app.asar 内へ保存しない
* settings.json を electron/main.js と同じ場所へ保存しない
* Terminal Dock を変更しない
* node-pty を変更しない
* xterm を変更しない
* Preview / Editor を変更しない
* TREE を変更しない
* electron-builder 設定を大きく変更しない
* asar を無効化して回避しない

---

# 出力

以下のみ提示してください。

* settings:save が app.asar に書き込もうとしていた原因
* settings.json の保存先を app.getPath("userData") に変更した箇所
* userData 上の settings.json パス
* Browse 後の settings:save 確認結果
* npm run build の結果
* npm run pack:mac の結果
* .app 起動確認結果
