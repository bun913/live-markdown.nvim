# live-markdown.nvim — 開発ガイド（Claude Code 向け）

## このプロジェクトについて

Neovim 用のマークダウンリアルタイムプレビュープラグイン。
markdown-preview.nvim の後継を目指しており、脆弱性管理・モダンな依存・クリーンなプロセスライフサイクルを重視している。

## 設計思想 — 必ず読んでから実装に入ること

このプロジェクトは以下の2つの設計原則に従っている。

### 1. 操作より状態・性質に着目する

参考: https://zenn.dev/knowledgework/articles/c48539d2f35ecc

「何をするか（操作・コマンド）」からではなく「どんな状態がありうるか」から設計する。
操作起点で考えると、想定外の状態に if 文で場当たり対応してコードが複雑化する。
状態起点で考えれば、エッジケースが自然に見える。

具体例:
- Error は「状態」ではなく「イベント（遷移の原因）」として扱う。エラーが起きたらサーバーは Stopped に遷移する。Error 状態で宙ぶらりんにならない
- バッファ切り替え時の挙動は、操作（BufEnter コマンドが来たらどうする？）ではなく状態（Active / Suspended / Closed）で整理している

→ 詳細は `docs/state-design.md` を参照

### 2. 理想像の STEP1 として妥協案を設計する

参考: https://zenn.dev/knowledgework/articles/c3f2f5986a24a6

場当たり的な仮実装ではなく、理想的な最終形を描いた上でその STEP1 として設計する。
将来の拡張が最小限の変更で済むように、構造を最初から整えておく。

具体例:
- メッセージに `bufId` を含める（今は単一バッファだが、将来の複数バッファ対応に備える）
- ダイアグラムレンダリングはクライアント側で mermaid.js を直接実行（将来 PlantUML 等はクライアント側で追加可能）
- ブラウザ起動は Strategy パターン（プリセット以外に任意のコマンド文字列を設定可能）

→ 詳細は `docs/step1-design.md`「将来の STEP2 以降に向けて STEP1 で仕込む構造」を参照

## 設計ドキュメント

実装前に必ず以下を読むこと:

| ドキュメント | 内容 | いつ読むか |
|---|---|---|
| `ARCHITECTURE.md` | 技術スタック全体像、選定理由 | 最初に |
| `docs/state-design.md` | 状態遷移図、不変条件、エッジケース、エラー通知 | 状態に関わるコードを書くとき |
| `docs/step1-design.md` | ディレクトリ構成、モジュール責務、通信プロトコル、クリーンアップ | 実装するとき |

## 技術スタック

- **Neovim プラグイン**: Lua（外部依存なし）
- **プレビューサーバー**: Deno (TypeScript)
- **マークダウンパーサー**: markdown-it（サーバー側でレンダリング）
- **CSS**: github-markdown-css（CDN から読み込み）
- **ダイアグラム**: mermaid.js（npm 経由で取得、クライアント側でレンダリング）
- **通信**: Neovim ↔ Server は stdin/stdout (JSON Lines)、Server ↔ Browser は WebSocket
- **配布**: `deno compile --include ../client/` で単一バイナリ（ユーザーは Deno インストール不要）

## 実装時の注意

### 状態遷移を守る
- `state.lua` が設計の中心。状態遷移は必ずここを通す
- 不正な遷移（例: Server=Stopped なのに content を送ろうとする）を防ぐ
- 新しい機能を追加するときは、まず状態遷移図を更新してからコードを書く

### Error は状態ではない
- エラーが起きたら即座に Stopped / Disconnected に遷移する
- `if state == 'error'` のような分岐は書かない
- エラー情報は `vim.notify()` でユーザーに通知する

### プロセスのクリーンアップ
- 3重の防衛線: VimLeavePre autocmd + stdin EOF 検知 + ポート自動割り当て
- markdown-preview.nvim の孤児プロセス問題を繰り返さない
- `docs/step1-design.md`「プロセスライフサイクルとクリーンアップ」を参照

### 将来に向けた構造を崩さない
- `bufId` をメッセージから省略しない
- CSS をハードコードせず、テンプレートに外部注入する形を維持する

## STEP1 の実装状況（完了）

1. ~~Deno サーバー: 最小限の HTTP + WebSocket（markdown-it で HTML を返すだけ）~~ ✅
2. ~~ブラウザクライアント: HTML テンプレート + github-markdown-css + WebSocket 受信→DOM 更新~~ ✅
3. ~~Lua プラグイン: jobstart でサーバー起動 → stdin でコンテンツ送信 → ブラウザ起動~~ ✅
4. ~~スクロール同期: 行番号ベースの基本的な同期~~ ✅
5. ~~mermaid: クライアント側で mermaid.js レンダリング~~ ✅
6. ~~ビルド: deno compile でバイナリ生成~~ ✅

### STEP1 の実装上の決定事項
- **Neovim ↔ Server 通信**: stdin/stdout JSON Lines（WebSocket ではなく stdio を採用）
- **mermaid レンダリング**: クライアント側で実行（サーバー側ではなくブラウザで `mermaid.run()` を呼ぶ）
- **mermaid 配信**: npm の `node_modules/mermaid/dist/mermaid.min.js` を `/vendor/mermaid.min.js` として配信
- **github-markdown-css**: CDN（cdnjs）から読み込み（バンドルではない）
- **スクロール同期**: `data-source-line` 属性 + `scrollIntoView()` で実装
- **fence ルール**: `<pre>` タグに `data-source-line` を注入する特別なハンドリングが必要（class 属性を保持するため）
- **コード構文ハイライト**: 未実装（highlight.js vs Shiki は未決定）
- **ブラウザ起動**: プリセット以外に任意のコマンド文字列をそのまま実行可能
- **初回接続時**: サーバーが最後にレンダリングした HTML をキャッシュし、WebSocket 接続時に即送信
- **サーバー終了時**: ブラウザに `close` メッセージを送信し、`window.close()` を試みる
