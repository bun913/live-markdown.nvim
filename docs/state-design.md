# 状態設計

## 設計方針

mayah「操作より状態・性質に着目する」に従い、操作（コマンド）からではなく状態から設計する。

## 3つのレイヤーの状態

### Server 状態
```mermaid
stateDiagram-v2
    [*] --> Stopped
    Stopped --> Starting : start requested
    Starting --> Running : listen success
    Starting --> Stopped : listen failed (error)
    Running --> Stopping : stop requested
    Running --> Stopped : process died (error)
    Stopping --> Stopped : process exited
```

**Error は状態ではなくイベント（遷移の原因）。**
サーバーがエラーを起こしたら「エラー中」で宙ぶらりんにならず、即座に Stopped に遷移する。
エラー情報はユーザー通知の関心事として別途扱う（後述「エラー通知」参照）。

### Browser Connection 状態
```mermaid
stateDiagram-v2
    [*] --> Disconnected
    Disconnected --> Connecting : server running & open browser
    Connecting --> Connected : WebSocket handshake ok
    Connecting --> Disconnected : timeout / failed
    Connected --> Disconnected : browser closed / network error
    Connected --> Disconnected : server stopped
```

### Buffer 状態
```mermaid
stateDiagram-v2
    [*] --> Inactive
    Inactive --> Active : BufEnter (markdown file)
    Active --> Editing : TextChanged / TextChangedI
    Editing --> Active : idle (debounce)
    Active --> Suspended : BufLeave (non-markdown buffer entered)
    Active --> Active : BufEnter (another markdown file → switch target)
    Suspended --> Active : BufEnter (markdown file)
    Active --> Closed : BufDelete / BufWipeout
    Inactive --> Closed : BufDelete / BufWipeout
    Suspended --> Closed : last markdown buffer deleted
    Closed --> [*]
```

**Suspended 状態の性質:**
- プレビューは最後にアクティブだった markdown の表示を維持する
- サーバーは稼働し続ける（再起動のコストを避ける）
- バッファ変更・スクロールの同期は停止する
- markdown バッファに戻れば同期を再開する

## プラグイン全体の複合状態

```mermaid
stateDiagram-v2
    state "Plugin State" as plugin {
        [*] --> Idle
        Idle --> Previewing : MarkdownPreview command

        state "Previewing" as previewing {
            [*] --> ServerStarting
            ServerStarting --> ServerReady : listen ok
            ServerReady --> BrowserOpening : open browser
            BrowserOpening --> LivePreview : WebSocket connected

            LivePreview --> BrowserLost : browser disconnected
            BrowserLost --> BrowserOpening : auto reconnect / reopen
            BrowserLost --> Cleanup : user stop / timeout

            LivePreview --> Cleanup : MarkdownPreviewStop command
            LivePreview --> Cleanup : BufDelete (last markdown buffer)
        }

        Previewing --> Idle : error (notify user, then cleanup)
        Cleanup --> Idle : server stopped & browser closed

        state "LivePreview" as live {
            [*] --> Synced
            Synced --> Rendering : buffer changed
            Rendering --> Synced : render complete & sent to browser
            Synced --> ScrollSync : cursor/scroll moved
            ScrollSync --> Synced : scroll position sent
        }
    }
```

## 状態から見えるエッジケースと性質

### 性質（常に満たすべき不変条件）
- Server が Stopped なら Browser は必ず Disconnected
- Browser が Connected なら Server は必ず Running
- Buffer が Closed かつ他に markdown バッファがなければ → Cleanup に遷移すべき
- 同時に Running な Server は最大1つ（ポート競合防止）

### エッジケース（状態の組み合わせから自然に発見）
1. **Server Running + Browser Disconnected** → ブラウザが閉じられた。再接続を試みるか、ユーザーに通知
2. **Server Running + Buffer Closed** → 最後のバッファが閉じられた。サーバーを止めるべき
3. **Server Starting + 2回目の start requested** → 二重起動防止が必要

## エラー通知

Error は状態ではなく、Stopped / Idle への遷移を引き起こすイベントとして扱う。
状態をシンプルに保ちつつ、ユーザーへの通知は別の関心事として設計する。

### エラーが起きうるタイミングと通知方法

| タイミング | 原因例 | 遷移 | ユーザー通知 |
|---|---|---|---|
| Server Starting → Stopped | ポート bind 失敗、バイナリ不在 | Idle に戻る | `vim.notify()` でエラーメッセージ |
| Server Running → Stopped | プロセス予期せず終了 | Idle に戻る | `vim.notify()` + プレビューが止まった旨 |
| Browser Connecting → Disconnected | タイムアウト、URL open 失敗 | BrowserLost → リトライ or Cleanup | `vim.notify()` で警告 |

### 設計上のポイント
- エラー状態を持たないことで、状態遷移が常に「正常系」と同じパスを通る
- 「Stopped なのか Error なのか」を気にする if 分岐が不要になる
- エラーの詳細は `vim.notify()` のメッセージとログレベルで表現する
- 将来的にログファイル出力や `:checkhealth` 対応も可能（状態設計に影響しない）

## 理想像と STEP1

### 理想像（最終形）
- 複数バッファの同時プレビュー対応
- プレビュー側からの編集（双方向同期）
- カスタム CSS / テーマ切り替え UI
- プラグイン設定のホットリロード
- mermaid 以外のダイアグラム（PlantUML, D2 など）

### STEP1（今回の実装スコープ）
- 単一バッファのプレビュー
- Neovim → ブラウザの片方向同期（編集・スクロール）
- github-markdown-css 固定
- mermaid.js のみ
- cmux / open コマンドでのブラウザ起動

### STEP1 でも理想像に向けて整えておく構造
- Server はバッファ ID を受け取る設計にしておく（将来の複数バッファ対応）
- CSS はテンプレートに外部注入する形にしておく（将来のテーマ切替）
- ダイアグラムレンダリングはプラガブルな構造にしておく（将来の拡張）
- ブラウザ起動は strategy パターンで抽象化（cmux / open / xdg-open）
