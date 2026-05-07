# Features

## 全機能一覧

- VSCode 風ディレクトリツリー
- 複数選択 / 範囲選択
- インラインリネーム
- 右クリックコンテキストメニュー
- コピー / カット / ペースト
- TREE 内ドラッグ移動
- Finder からの外部取り込み
- ファイルプレビュー
- テキスト編集と保存
- PDF 表示
- CSV 表示
- Launch 機能
- Codex ログ解析
- システム監視
- 最近開いたファイル
- コマンドテンプレート
- キーボードショートカット
- 設定ファイルによる初期ディレクトリ保存

## FileTree

- ルートを起点にディレクトリを階層表示
- 展開時のみ `listDirectory()` を呼ぶ遅延読み込み
- `node_modules`、`.git`、`.cache` は非表示
- 1 ディレクトリに 1000 件超のエントリがある場合は警告を表示
- 複数選択、範囲選択、`F2` リネーム、`Delete` 削除に対応
- 内部 D&D は `moveFile()`、外部取り込みは `copyFileToDirectory()` / `FileReader` を使う
- 右クリックから作成、削除、コピー、カット、ペースト、Finder で表示、パスコピーが可能

## Preview

- コードを syntax highlight 付きで表示
- JSON は整形表示
- CSV は最大 1000 行までテーブル表示
- PDF は iframe で表示
- テキストファイルは簡易編集可能
- 保存後は元ファイルへ書き戻し
- 表示中ファイルのみ `fs.watch` で監視し、変更時に再読込
- 5MB 以上の非 PDF ファイルはプレビューしない
- バイナリファイルは `プレビュー不可` と表示
- `Space` で選択中ファイルをプレビュー

## Launch

- 実行ディレクトリ入力
- モデル選択
- コマンドテンプレート選択
- `Terminal.app` を `osascript` で起動
- 実行中はボタンを無効化
- 実行失敗時はエラーメッセージ表示

## Codex ログ解析

- 対象: `~/.codex/history.jsonl`
- 全読み込みは行わず末尾 1000 行のみ解析
- request 数、session 数、token 推定を算出
- JSON parse 失敗行はスキップ

## システム監視

- `systeminformation` で CPU / MEM を取得
- 3 秒ごとに更新

## キーボードショートカット

- `Ctrl+P`: 簡易ファイル検索
- `Ctrl+R`: リロード
- `Ctrl+L`: Launch パネル表示または Launch 実行
- TREE 内:
  - `↑ / ↓`: フォーカス移動
  - `Shift + ↑ / ↓ / ← / →`: 範囲選択拡張
  - `Ctrl / Cmd + ↑ / ↓`: フォーカスのみ移動
  - `→`: 展開または子へ移動
  - `←`: 折りたたみまたは親へ移動
  - `Home / End / PageUp / PageDown`: 先頭 / 末尾 / ページ移動
  - `Space`: プレビュー
  - `F2`: リネーム
  - `Delete / Backspace`: 削除
  - `Ctrl / Cmd + C / X / V`: コピー / カット / ペースト

## 制限事項

- CSV パーサーは簡易実装で、複雑な引用符処理には未対応
- PDF は表示のみで編集不可
- ファイル検索は単純な名前一致で、最初の 1 件のみ開く
- `fs.watch` の挙動は OS に依存する
- Launch は macOS の `Terminal.app` と `osascript` 前提
