# Codex Integration

## Codex CLI との連携方法

NightOps は Codex CLI 自体を内包せず、macOS の `Terminal.app` を開いて Codex CLI を実行します。アプリは実行補助と状況監視を担当します。

## Launch 機能の仕組み

Launch では以下を受け取ります。

- directory path
- model
- prompt template

main process で AppleScript を組み立て、`osascript` で実行します。

```applescript
tell application "Terminal"
activate
do script "cd \"<directory>\" && codex -m '<model>' '<template>'"
end tell
```

補足:

- 文字列は最低限のエスケープを行ってから埋め込む
- 実行失敗時はエラーを renderer に返す
- `getSystemStatus(directoryPath)` は選択ディレクトリの空き容量を表示するために使っている

## history.jsonl の扱い

対象ファイル:

```text
~/.codex/history.jsonl
```

扱い方:

- 全件読込はしない
- 末尾側だけを `createReadStream` で読む
- 最終的に末尾 1000 行を対象に集計する
- JSON parse 失敗行はスキップする
- `TopBar` は request / session / token 推定をこの結果から表示する

## トークン推定ロジック

厳密な tokenizer は使わず、各行の文字数を 4 で割った値を切り上げて合算します。

```text
tokenEstimate += ceil(line.length / 4)
```

この値はあくまで簡易推定です。実際の API 課金トークン数とは一致しません。
