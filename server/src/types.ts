// Neovim -> Server (stdin, JSON Lines)
export type NvimMessage =
  | { type: "content"; bufId: number; text: string }
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

// Browser -> Server (WebSocket) - STEP2 以降の双方向同期に備えて定義だけしておく
export type BrowserToServerMessage =
  | { type: "scroll"; targetLine: number };
