// Neovim -> Server (stdin, JSON Lines)
// All messages include bufId for future multi-buffer support
export type NvimMessage =
  | { type: "content"; bufId: number; text: string; baseDir?: string }
  | { type: "scroll"; bufId: number; topLine: number; cursorLine: number }
  | { type: "close"; bufId: number };

// Server -> Browser (WebSocket)
export type BrowserMessage =
  | { type: "render"; html: string }
  | { type: "scroll"; targetLine: number }
  | { type: "close" };

// Server -> Neovim (stdout, JSON Lines)
export type ServerMessage =
  | { type: "ready"; port: number }
  | { type: "connected" }
  | { type: "disconnected" };

// Browser -> Server (WebSocket) - defined ahead for future bidirectional sync
export type BrowserToServerMessage =
  | { type: "scroll"; targetLine: number };
