# live-markdown.nvim — 技術スタック & アーキテクチャ

## 概要

Neovim 用のマークダウンプレビュープラグイン。Deno ベースのローカルサーバーでマークダウンをレンダリングし、ブラウザでリアルタイムプレビューを表示する。ブラウザの起動方式は設定可能で、`open`（macOS）/ `xdg-open`（Linux）のほか、cmux 等の任意のコマンドを指定できる。

## 技術スタック

| レイヤー | 技術 | 備考 |
|---|---|---|
| Neovim プラグイン | Lua | `vim.fn.jobstart()` でサーバープロセス起動 |
| プレビューサーバー | Deno (TypeScript) | 開発時は `deno` コマンド、配布は `deno compile` バイナリ |
| マークダウンパーサー | markdown-it | プラグインで拡張（タスクリスト、脚注、絵文字など） |
| CSS | github-markdown-css | MIT ライセンス、ライト/ダーク自動切り替え |
| ダイアグラム | mermaid.js（バンドル） | `deno.json` の imports で管理、バージョン更新容易 |
| 通信 | WebSocket | Neovim ↔ サーバー ↔ ブラウザ |
| コードハイライト | highlight.js or Shiki | 要検討 |

## アーキテクチャ

```
┌──────────────┐     stdio/WebSocket     ┌──────────────────┐     WebSocket     ┌──────────────┐
│   Neovim     │ ──────────────────────> │  Deno Server     │ ───────────────> │  Browser     │
│   (Lua)      │ <────────────────────── │  (TypeScript)    │ <─────────────── │  (HTML/CSS)  │
└──────────────┘                         └──────────────────┘                  └──────────────┘
  バッファ変更                              markdown-it で                       github-markdown-css
  カーソル位置                              HTML レンダリング                     mermaid.js (bundled)
  スクロール位置                            静的ファイル配信                      スクロール同期
```

## Neovim → サーバー通信

- `vim.fn.jobstart()` でサーバープロセスを起動
- stdio（stdin/stdout）または WebSocket で双方向通信
- 送信するデータ:
  - バッファの全文 or 差分
  - カーソル行番号
  - スクロール位置（ウィンドウの topline / botline）

## サーバー → ブラウザ通信

- WebSocket でリアルタイム配信
- レンダリング済み HTML を送信
- スクロール同期情報を送信

## プレビュー起動方式

ブラウザ起動は Strategy パターンで抽象化。デフォルトは OS 標準コマンド、オプションで任意のコマンドを指定可能。

```lua
-- デフォルト: OS に応じて自動選択
-- macOS → open, Linux → xdg-open

-- ユーザー設定例: cmux を使う場合
require('live-markdown').setup({
  browser = {
    strategy = 'cmux browser open-split',
  },
})
```

## 配布方式

- **開発時**: `deno run --allow-net --allow-read server.ts`
- **リリース**: `deno compile` で各プラットフォーム向けバイナリを生成
  - linux-x64
  - darwin-x64
  - darwin-arm64
  - windows-x64
- GitHub Actions で自動ビルド → Release にアップロード
- プラグイン初回起動時に適切なバイナリを自動ダウンロード

## セキュリティ（Deno パーミッション）

サーバーに必要な権限を最小限に制限:

```
--allow-net=localhost       # ローカルサーバーのみ
--allow-read=<project-dir>  # プレビュー対象ファイルのみ
```

## 依存ライブラリ（予定）

### Deno サーバー側
- `markdown-it` — マークダウンパーサー
- `markdown-it-task-lists` — タスクリスト
- `markdown-it-footnote` — 脚注
- `markdown-it-emoji` — 絵文字
- `mermaid` — ダイアグラム（バンドル）
- `github-markdown-css` — スタイルシート

### Neovim プラグイン側
- 外部依存なし（Lua のみ）

## Deno を選んだ理由

1. **パーミッションモデル**: デフォルトで全リソースへのアクセスが禁止。必要な権限のみ明示的に付与できるため、脆弱性リスクを構造的に低減
2. **依存管理**: URL ベースインポート + `deno.json` で管理。node_modules のような深いネストが発生しない
3. **単一バイナリ配布**: `deno compile` でランタイム不要の実行ファイルを生成。ユーザーは Deno のインストール不要
4. **Neovim での実績**: denops.vim、peek.nvim など先行事例あり

## 未決定事項

- [ ] コードシンタックスハイライト: highlight.js vs Shiki
- [ ] Neovim ↔ サーバー間の通信プロトコル詳細（stdio vs WebSocket）
- [ ] スクロール同期のアルゴリズム詳細
- [x] プラグイン名: live-markdown.nvim
- [ ] 数式レンダリング（KaTeX）の対応有無
