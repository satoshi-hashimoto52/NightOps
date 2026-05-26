# リリースチェックリスト

## 対象範囲

このチェックリストは、NightOps のローカル用 macOS `.app` ビルドを確認するためのものです。

現在の `NightOps.app` は未署名・未 notarize のローカル実行用アプリです。

## 事前確認

- [ ] 作業ツリーがクリーン、または意図した変更のみになっている
- [ ] `npm install` が完了している
- [ ] `npm run build` が成功する
- [ ] `npm run pack:mac` が成功する
- [ ] `release/mac-arm64/NightOps.app` が生成される

## アプリ起動

- [ ] `open release/mac-arm64/NightOps.app` でアプリが起動する
- [ ] NightOps のUI本体が表示される
- [ ] アプリアイコンが表示される
- [ ] macOS メニューバーに NightOps が表示される
- [ ] packaged `.app` では Reload / Toggle DevTools が表示されない

## ワークスペース

- [ ] 初回起動時に No workspace selected が表示される
- [ ] Browse でフォルダを選択できる
- [ ] TREE に選択したフォルダ内容が表示される
- [ ] settings.json が userData 配下に保存される
- [ ] 無効な保存済みフォルダの場合、Workspace unavailable が表示される
- [ ] Browse 成功後、ワークスペースエラー表示が消える

## Preview / Editor

- [ ] Markdown preview が表示される
- [ ] Editor で編集できる
- [ ] Save / dirty 状態が正しく動く
- [ ] Cmd+F が動く
- [ ] Cmd+D が動く
- [ ] 未保存タブを閉じる時に確認が出る
- [ ] タブ右クリックメニューが動く
- [ ] シンタックスハイライトで37行目以降 / 64行目以降が消えない

## Terminal Dock

- [ ] Terminal Dock が開く
- [ ] 各 pane で zsh が起動する
- [ ] `pwd` が動く
- [ ] `ls` が動く
- [ ] `git status` が動く
- [ ] Cmd+J で Terminal Dock を非表示 / 再表示できる
- [ ] Cmd+J で非表示にしても PTY が終了しない
- [ ] KILL は active pane のみ終了する
- [ ] RST は active pane のみ復帰する
- [ ] CLR は active pane の画面のみクリアする
- [ ] pane 削除時、その pane の PTY だけ終了する

## Settings

- [ ] Appearance 設定が保存される
- [ ] Container Opacity が保持される
- [ ] Terminal Font Size が保持される
- [ ] Terminal Font Family が保持される
- [ ] Settings は app.asar 内ではなく userData 配下に保存される

## Help / Documentation

- [ ] Help > NightOps Documentation で README が開く
- [ ] Help > Packaging Guide で docs/PACKAGING_MAC.md が開く
- [ ] Help > Terminal Dock Specification で docs/TERMINAL_DOCK.md が開く

## パッケージング確認

- [ ] `dist/` をコミット対象にしていない
- [ ] `release/` をコミット対象にしていない
- [ ] `node_modules/` をコミット対象にしていない
- [ ] `assets/icon.icns` はコミット対象に含めている
- [ ] `scripts/build-mac-icon.sh` はコミット対象に含めている

## 配布上の既知制限

- [ ] `.app` は未署名である
- [ ] `.app` は notarize されていない
- [ ] 初回起動時に Gatekeeper 警告が出る可能性がある
- [ ] DMG 署名は未設定である
- [ ] 自動アップデートは未設定である
