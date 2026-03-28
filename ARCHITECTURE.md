# live-markdown.nvim — 技術スタック & アーキテクチャ

## 概要

Neovim 用のマークダウンプレビュープラグイン。Deno ベースのローカルサーバーでマークダウンをレンダリングし、ブラウザでリアルタイムプレビューを表示する。ブラウザの起動方式は設定可能で、`open`（macOS）/ `xdg-open`（Linux）のほか、任意のコマンド文字列を指定できる。

## 技術スタック

| レイヤー | 技術 | 備考 |
|---|---|---|
| Neovim プラグイン | Lua | `vim.fn.jobstart()` でサーバープロセス起動 |
| プレビューサーバー | Deno (TypeScript) | 開発時は `deno run`、配布は `deno compile` バイナリ |
| マークダウンパーサー | markdown-it | サーバー側でレンダリング、`data-source-line` 属性を注入 |
| CSS | github-markdown-css | CDN（cdnjs）から読み込み、ライト/ダーク自動切り替え |
| ダイアグラム | mermaid.js | npm で取得、`/vendor/mermaid.min.js` としてサーバーから配信、クライアント側でレンダリング |
| Neovim ↔ Server 通信 | stdin/stdout JSON Lines | `vim.fn.jobstart()` + `vim.fn.chansend()` |
| Server ↔ Browser 通信 | WebSocket | リアルタイム配信（render / scroll / close） |
| コードハイライト | 未定 | highlight.js vs Shiki（STEP2 以降で検討） |

## アーキテクチャ

```
┌──────────────┐     stdin/stdout          ┌──────────────────┐     WebSocket     ┌──────────────┐
│   Neovim     │ ──── JSON Lines ────────> │  Deno Server     │ ───────────────> │  Browser     │
│   (Lua)      │ <─── JSON Lines ──────── │  (TypeScript)    │ <─────────────── │  (HTML/JS)   │
└──────────────┘                           └──────────────────┘                  └──────────────┘
  バッファ変更                                markdown-it で                       github-markdown-css (CDN)
  カーソル位置                                HTML レンダリング                     mermaid.js (node_modules)
  スクロール位置                              静的ファイル配信                      scrollIntoView 同期
                                             mermaid.min.js 配信
```

## Neovim → サーバー通信（stdin, JSON Lines）

- `vim.fn.jobstart()` でサーバープロセスを起動
- stdin に JSON Lines で送信（1行1メッセージ）
- 送信するデータ:
  - `{ type: "content", bufId, text }` — バッファの全文
  - `{ type: "scroll", bufId, topLine, cursorLine }` — スクロール位置
  - `{ type: "close", bufId }` — バッファ閉じ

## サーバー → Neovim 通信（stdout, JSON Lines）

- `{ type: "ready", port }` — サーバー起動完了、割り当てポート通知
- `{ type: "connected" }` — 最初のブラウザが WebSocket 接続
- `{ type: "disconnected" }` — 最後のブラウザが切断

## サーバー → ブラウザ通信（WebSocket）

- `{ type: "render", html }` — レンダリング済み HTML
- `{ type: "scroll", targetLine }` — スクロール同期（カーソル行）
- `{ type: "close" }` — プレビュー終了（ブラウザタブを閉じる）

## スクロール同期

- サーバー側: markdown-it のレンダリング時にブロック要素に `data-source-line` 属性を注入（1-based）
- 対象要素: heading, paragraph, bullet_list, ordered_list, blockquote, code_block, hr, table, fence
- fence は特別なハンドリング: デフォルトレンダラーが生成する `<pre><code class="language-xxx">` を保持しつつ `<pre>` に `data-source-line` を注入
- クライアント側: `data-source-line <= targetLine` の最も近い要素を探して `scrollIntoView({ behavior: "smooth", block: "center" })` で同期

## プレビュー起動方式

ブラウザ起動は Strategy パターンで抽象化。プリセット（`auto` / `cmux` / `open` / `xdg-open`）のほか、任意のコマンド文字列をそのまま実行可能。

```lua
-- デフォルト: OS に応じて自動選択
-- cmux が使える → cmux、macOS → open、その他 → xdg-open

-- ユーザー設定例: 任意のコマンド文字列
require('live-markdown').setup({
  browser = {
    strategy = 'cmux browser open-split',
  },
})
```

プリセットにないコマンド文字列が指定された場合、`strategy_name .. " " .. url` として直接実行される。

## 配布方式

- **開発時**: `cd server && deno task dev`
- **リリース**: `deno compile --include ../client/ --output ../bin/live-markdown src/main.ts` で単一バイナリを生成
  - `--include` フラグで client/ ディレクトリをバイナリに含める
  - linux-x64, darwin-x64, darwin-arm64, windows-x64 向けにクロスコンパイル可能
- GitHub Actions で自動ビルド → Release にアップロード（予定）
- プラグイン初回起動時に適切なバイナリを自動ダウンロード（予定）

## セキュリティ（Deno パーミッション）

サーバーに必要な権限を最小限に制限:

```
--allow-net=localhost       # ローカルサーバーのみ
--allow-read                # client/ と node_modules のファイル配信
```

## 依存ライブラリ

### Deno サーバー側（`server/deno.json`）
- `markdown-it` (npm:markdown-it@^14.1.0) — マークダウンパーサー
- `@types/markdown-it` (npm:@types/markdown-it@^14.1.2) — 型定義
- `mermaid` (npm:mermaid@^11) — ダイアグラム（node_modules から mermaid.min.js を配信）

### ブラウザ側（CDN）
- `github-markdown-css` — CDN（cdnjs 5.8.1）から読み込み

### Neovim プラグイン側
- 外部依存なし（Lua のみ）

## Deno を選んだ理由

1. **パーミッションモデル**: デフォルトで全リソースへのアクセスが禁止。必要な権限のみ明示的に付与できるため、脆弱性リスクを構造的に低減
2. **依存管理**: `deno.json` の imports + `nodeModulesDir: "auto"` で npm パッケージも利用可能。deno.lock で再現性確保
3. **単一バイナリ配布**: `deno compile` でランタイム不要の実行ファイルを生成。ユーザーは Deno のインストール不要
4. **Neovim での実績**: denops.vim、peek.nvim など先行事例あり

## 未決定事項

- [ ] コードシンタックスハイライト: highlight.js vs Shiki
- [x] Neovim ↔ サーバー間の通信プロトコル: **stdin/stdout JSON Lines を採用**
- [x] スクロール同期のアルゴリズム: **data-source-line 属性 + scrollIntoView**
- [x] プラグイン名: live-markdown.nvim
- [ ] 数式レンダリング（KaTeX）の対応有無
- [ ] github-markdown-css のバンドル化（現在は CDN、将来的にオフライン対応のためバンドルも検討）
- [ ] markdown-it プラグイン追加（タスクリスト、脚注、絵文字等）
