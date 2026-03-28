import { join, dirname, fromFileUrl } from "https://deno.land/std@0.224.0/path/mod.ts";
import MarkdownIt from "markdown-it";
import type { NvimMessage, BrowserMessage, ServerMessage } from "./types.ts";

// --- Markdown renderer ---

const md = new MarkdownIt({
  html: true,
  linkify: true,
  typographer: true,
});

// --- client/ ディレクトリのパス解決 ---

const serverDir = dirname(fromFileUrl(import.meta.url));
const clientDir = join(serverDir, "..", "..", "client");

const CONTENT_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
};

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

async function handleRequest(req: Request): Promise<Response> {
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

  // 静的ファイル配信（client/ ディレクトリ）
  const pathname = new URL(req.url).pathname;
  const filename = pathname === "/" ? "/index.html" : pathname;
  const filepath = join(clientDir, filename);

  try {
    const content = await Deno.readFile(filepath);
    const ext = filename.slice(filename.lastIndexOf("."));
    const contentType = CONTENT_TYPES[ext] ?? "application/octet-stream";
    return new Response(content, {
      headers: { "content-type": contentType },
    });
  } catch {
    return new Response("Not Found", { status: 404 });
  }
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
