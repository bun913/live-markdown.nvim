import { join, dirname, fromFileUrl } from "https://deno.land/std@0.224.0/path/mod.ts";
import MarkdownIt from "markdown-it";
import type { NvimMessage, BrowserMessage, ServerMessage } from "./types.ts";

// --- Markdown renderer ---

const md = new MarkdownIt({
  html: true,
  linkify: true,
  typographer: true,
});

// Inject data-source-line attributes for scroll sync
const defaultRender =
  md.renderer.rules.heading_open ||
  ((tokens: unknown[], idx: number, options: unknown, _env: unknown, self: { renderToken: (t: unknown[], i: number, o: unknown) => string }) =>
    self.renderToken(tokens, idx, options));

// Block-level open tokens: inject data-source-line via renderToken
for (const rule of [
  "heading_open",
  "paragraph_open",
  "bullet_list_open",
  "ordered_list_open",
  "blockquote_open",
  "code_block",
  "hr",
  "table_open",
] as const) {
  // deno-lint-ignore no-explicit-any
  md.renderer.rules[rule] = (tokens: any[], idx: number, options: any, env: any, self: any) => {
    const token = tokens[idx];
    if (token.map && token.map[0] != null) {
      token.attrSet("data-source-line", String(token.map[0] + 1)); // 1-based
    }
    if (rule === "heading_open") {
      return defaultRender(tokens, idx, options, env, self);
    }
    return self.renderToken(tokens, idx, options);
  };
}

// Fence needs special handling: preserve default rendering (with <pre><code>)
// while injecting data-source-line on the wrapping <pre>
const defaultFence = md.renderer.rules.fence!.bind(md.renderer.rules);
// deno-lint-ignore no-explicit-any
md.renderer.rules.fence = (tokens: any[], idx: number, options: any, env: any, self: any) => {
  const token = tokens[idx];
  const line = token.map?.[0] != null ? ` data-source-line="${token.map[0] + 1}"` : "";
  const defaultHtml: string = defaultFence(tokens, idx, options, env, self);
  // Inject data-source-line into the <pre> tag
  return defaultHtml.replace("<pre>", `<pre${line}>`);
};

// --- Resolve client/ directory path ---

const serverDir = dirname(fromFileUrl(import.meta.url));
const clientDir = join(serverDir, "..", "..", "client");
const mermaidPath = join(clientDir, "vendor", "mermaid.min.js");

const CONTENT_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
};

// --- WebSocket connections ---

const clients = new Set<WebSocket>();
let lastRenderedHtml: string | null = null;

function broadcast(message: BrowserMessage): void {
  if (message.type === "render") {
    lastRenderedHtml = message.html;
  }
  const data = JSON.stringify(message);
  for (const ws of clients) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(data);
    }
  }
}

// --- Notify Neovim (stdout, JSON Lines) ---

function notifyNeovim(message: ServerMessage): void {
  const line = JSON.stringify(message) + "\n";
  const encoder = new TextEncoder();
  Deno.stdout.writeSync(encoder.encode(line));
}

// --- HTTP + WebSocket server ---

async function handleRequest(req: Request): Promise<Response> {
  // WebSocket upgrade
  if (req.headers.get("upgrade")?.toLowerCase() === "websocket") {
    const { socket, response } = Deno.upgradeWebSocket(req);

    socket.addEventListener("open", () => {
      clients.add(socket);
      // Send cached HTML immediately on connect
      if (lastRenderedHtml !== null) {
        socket.send(JSON.stringify({ type: "render", html: lastRenderedHtml }));
      }
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

  // Serve static files
  const pathname = new URL(req.url).pathname;

  // Serve mermaid.min.js from node_modules
  if (pathname === "/vendor/mermaid.min.js") {
    try {
      const content = await Deno.readFile(mermaidPath);
      return new Response(content, {
        headers: { "content-type": "application/javascript; charset=utf-8" },
      });
    } catch {
      return new Response("Not Found", { status: 404 });
    }
  }

  // Serve files from client/ directory
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

// --- Read stdin (JSON Lines) ---
// Defense line 2: auto-shutdown on stdin EOF

async function readStdin(): Promise<void> {
  const decoder = new TextDecoder();
  let buffer = "";

  const reader = Deno.stdin.readable.getReader();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      // Process complete lines delimited by newline
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
    // pipe broken — Neovim died
  }

  // stdin closed = Neovim exited -> close browser and shut down
  broadcast({ type: "close" });
  Deno.exit(0);
}

function handleNvimMessage(line: string): void {
  let msg: NvimMessage;
  try {
    msg = JSON.parse(line) as NvimMessage;
  } catch {
    return; // ignore malformed JSON
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
      // STEP1: single buffer, so close browser and shut down server
      broadcast({ type: "close" });
      Deno.exit(0);
      break;
    }
  }
}

// --- Entry point ---

// Defense line 3: port 0 lets the OS assign a random port
const server = Deno.serve({ port: 0, hostname: "localhost" }, handleRequest);
const port = server.addr.port;

// Notify Neovim of the assigned port
notifyNeovim({ type: "ready", port });

// Start reading stdin (process exits on EOF)
readStdin();
