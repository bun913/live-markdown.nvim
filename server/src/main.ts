import MarkdownIt from "markdown-it";
import type { NvimMessage, BrowserMessage, ServerMessage } from "./types.ts";

// --- Markdown renderer ---

const md = new MarkdownIt({
  html: true,
  linkify: true,
  typographer: true,
});

// --- WebSocket connections ---

const clients = new Set<WebSocket>();

function broadcast(message: BrowserMessage): void {
  const data = JSON.stringify(message);
  for (const ws of clients) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(data);
    }
  }
}

// --- Neovim への通知 (stdout, JSON Lines) ---

function notifyNeovim(message: ServerMessage): void {
  const line = JSON.stringify(message) + "\n";
  const encoder = new TextEncoder();
  Deno.stdout.writeSync(encoder.encode(line));
}

// --- HTTP + WebSocket サーバー ---

function handleRequest(req: Request): Response {
  // WebSocket アップグレード
  if (req.headers.get("upgrade")?.toLowerCase() === "websocket") {
    const { socket, response } = Deno.upgradeWebSocket(req);

    socket.addEventListener("open", () => {
      clients.add(socket);
      if (clients.size === 1) {
        notifyNeovim({ type: "connected" });
      }
    });

    socket.addEventListener("close", () => {
      clients.delete(socket);
      if (clients.size === 0) {
        notifyNeovim({ type: "disconnected" });
      }
    });

    return response;
  }

  // 静的ファイル配信は STEP2 以降。今は最小限の HTML を返す
  if (new URL(req.url).pathname === "/") {
    return new Response(generatePreviewHtml(), {
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  }

  return new Response("Not Found", { status: 404 });
}

function generatePreviewHtml(): string {
  return `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>live-markdown preview</title>
  <style>
    body {
      max-width: 800px;
      margin: 0 auto;
      padding: 2rem;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif;
      line-height: 1.6;
      color: #24292f;
    }
    @media (prefers-color-scheme: dark) {
      body { background: #0d1117; color: #e6edf3; }
      a { color: #58a6ff; }
    }
    .connecting { color: #888; text-align: center; padding: 2rem; }
  </style>
</head>
<body>
  <div id="content"><p class="connecting">Connecting...</p></div>
  <script>
    const contentEl = document.getElementById('content');
    const wsUrl = 'ws://' + location.host + '/';
    let ws;

    function connect() {
      ws = new WebSocket(wsUrl);
      ws.addEventListener('message', (event) => {
        const msg = JSON.parse(event.data);
        if (msg.type === 'render') {
          contentEl.innerHTML = msg.html;
        } else if (msg.type === 'scroll') {
          // STEP1: 基本的なスクロール同期（後で実装）
        }
      });
      ws.addEventListener('close', () => {
        setTimeout(connect, 1000);
      });
    }
    connect();
  </script>
</body>
</html>`;
}

// --- stdin 読み取り (JSON Lines) ---
// 防衛線2: stdin EOF でサーバー自主シャットダウン

async function readStdin(): Promise<void> {
  const decoder = new TextDecoder();
  let buffer = "";

  const reader = Deno.stdin.readable.getReader();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      // 改行区切りで1行ずつ処理
      let newlineIdx: number;
      while ((newlineIdx = buffer.indexOf("\n")) !== -1) {
        const line = buffer.slice(0, newlineIdx).trim();
        buffer = buffer.slice(newlineIdx + 1);
        if (line.length > 0) {
          handleNvimMessage(line);
        }
      }
    }
  } catch {
    // pipe broken — Neovim が死んだ
  }

  // stdin 閉じた = Neovim 終了 → サーバーも終了
  Deno.exit(0);
}

function handleNvimMessage(line: string): void {
  let msg: NvimMessage;
  try {
    msg = JSON.parse(line) as NvimMessage;
  } catch {
    return; // 不正な JSON は無視
  }

  switch (msg.type) {
    case "content": {
      const html = md.render(msg.text);
      broadcast({ type: "render", html });
      break;
    }
    case "scroll": {
      broadcast({ type: "scroll", targetLine: msg.cursorLine });
      break;
    }
    case "close": {
      // STEP1: 単一バッファなのでサーバー終了
      Deno.exit(0);
      break;
    }
  }
}

// --- エントリーポイント ---

// 防衛線3: port 0 で OS にランダムポートを割り当てさせる
const server = Deno.serve({ port: 0, hostname: "localhost" }, handleRequest);
const port = server.addr.port;

// Neovim にポート番号を通知
notifyNeovim({ type: "ready", port });

// stdin の読み取りを開始（EOF でプロセス終了）
readStdin();
