# NightOps
NightOps は、Codex CLI を横に置いて使うための Electron + React ベースの補助ツールです。

主役はターミナルで、このアプリは
- ファイル確認
- 軽い編集
- 実行補助
- 状況監視
をすばやく行うためのサイドツールとして設計されています。

現在の主な特徴:

- Tree で `.md` を緑色表示
- Markdown Preview で見出しごとの折りたたみ
- Markdown 見出し色を H1 〜 H6 まで個別設定
- Settings はドラッグ移動・右下リサイズ対応
- Codex の 5H / 週次リセットを設定可能
- 週次リセットは月 + 日 + 時刻で指定
- Settings 内の Markdown 色編集は Preview にリアルタイム反映

## コンセプト

- CLI を邪魔しない
- 縦長レイアウトで横置きしやすい
- 無駄な UI を増やさない
- 重い処理を避けて即操作できる

## スクリーン構成

```text
┌──────────────────────────────┐
│ MONITOR | CODEX | LAUNCH     │
├─────────────┬────────────────┤
│ TREE        │ PREVIEW/EDITOR │
│             │                │
└─────────────┴────────────────┘
```

- 上部バー: CPU、メモリ、Codex 利用状況、Launch 導線
- 左ペイン: ディレクトリツリー
- 右ペイン: ファイルプレビューと簡易編集

## 主な機能

- VSCode 風のディレクトリツリー
- 複数選択、範囲選択、インラインリネーム
- 右クリックコンテキストメニュー
- TREE 内ドラッグ移動と Finder からの外部取り込み
- ファイルプレビュー
- テキストファイルの簡易編集と保存
- PDF 表示
- CSV の簡易テーブル表示
- Codex CLI の Launch
- Codex 履歴の集計表示
- CPU / メモリ監視
- 最近開いたファイル
- コマンドテンプレート
- Markdown の簡易レンダリングと見出し折りたたみ
- Settings のドラッグ移動とサイズ変更
- Codex 5H / Weekly リセット監視
- キーボードショートカット

## 技術スタック

- Electron
- React
- Vite
- highlight.js
- systeminformation

## クイックスタート

1. プロジェクト直下で依存関係を入れます
2. `npm run dev` でアプリを起動します
3. 起動後、保存済みの初期ディレクトリが TREE に表示されます
4. 左でファイルを選び、右でプレビューまたは編集します
5. Markdown は Preview で見出し単位に折りたためます
6. 必要なら `Launch` から Codex CLI を起動します
7. `⚙` から Settings を開き、位置とサイズを調整できます

`npm run dev` は内部で `vite` と `electron .` を同時に起動します。  
手動で分ける場合は、先に `npm run dev` 相当の Vite サーバーを立ち上げたうえで `npx electron .` を実行します。

## 起動方法（Mac）

```bash
cd /Users/hashimoto/vscode/_app/NightOps
npm install
npm run dev
```

手動起動する場合:

```bash
npx electron .
```

本番ビルド確認:

```bash
npm run build
```

## 使い方

1. 起動すると保存済みの初期ディレクトリを開きます
2. 左のツリーからファイルを選びます
3. 右ペインで内容を確認し、テキストなら編集して保存します
4. TREE では複数選択、コピー / カット / ペースト、リネーム、削除、フォルダ作成が使えます
5. Markdown は Preview で見出し単位に折りたためます
6. 必要に応じて Launch を開き、ディレクトリ・モデル・テンプレートを指定して Codex CLI を起動します
7. 上部バーで CPU / メモリ / Codex 利用状況を確認します

## ディレクトリ構成

```text
NightOps/
├── electron/
│   ├── main.js
│   └── preload.js
├── src/
│   ├── components/
│   │   ├── FileTree.jsx
│   │   ├── LaunchPanel.jsx
│   │   ├── PreviewPane.jsx
│   │   └── TopBar.jsx
│   ├── utils/
│   │   ├── codexLog.js
│   │   ├── fileLoader.js
│   │   └── system.js
│   ├── App.jsx
│   ├── main.jsx
│   └── styles.css
├── docs/
├── settings.json
├── package.json
└── vite.config.js
```

## 今後の拡張予定

- ファイル検索の強化
- プレビュー対応形式の追加
- Launch テンプレートの保存機能
- 大規模ディレクトリ向けのさらなる最適化
- 設定項目の追加

