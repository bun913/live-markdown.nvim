# Architecture

## Overview

A markdown preview plugin for Neovim. A Go-based local server renders markdown and displays a real-time preview in the browser. Browser launch strategy is configurable: `open` (macOS) / `xdg-open` (Linux) or any custom command string.

## Tech Stack

| Layer | Technology | Notes |
|---|---|---|
| Neovim plugin | Lua | Server process launched via `vim.fn.jobstart()` |
| Preview server | Go | Single binary with `go:embed` for all assets |
| Markdown parser | goldmark + GFM | Server-side rendering with `data-source-line` attribute injection |
| Syntax highlighting | chroma | Server-side, CSS class-based (`WithClasses(true)`) |
| Math rendering | KaTeX | Client-side via `renderMathInElement()` |
| CSS | github-markdown-css | Bundled in `static/css/`, auto light/dark switching |
| Diagrams | mermaid.js | Bundled in `static/js/`, rendered client-side |
| Neovim <-> Server | stdin/stdout JSON Lines | `vim.fn.jobstart()` + `vim.fn.chansend()` |
| Server <-> Browser | WebSocket | Real-time delivery (render / scroll / close) |

## Design Philosophy

### Focus on state, not operations

Ref: https://zenn.dev/knowledgework/articles/c48539d2f35ecc

Design from "what states are possible" rather than "what operations to perform". State-first thinking reveals edge cases naturally, while operation-first thinking leads to ad-hoc if-branches.

### Design compromises as STEP1 of the ideal

Ref: https://zenn.dev/knowledgework/articles/c3f2f5986a24a6

Envision the ideal final form and design STEP1 toward it, so future extensions require minimal changes.

## State Design

Three layers of state govern the plugin:

### Server State

```
[*] -> Stopped -> Starting -> Running -> Stopping -> Stopped
```

- Error is an event (cause of transition), not a state
- On error, the server transitions immediately to Stopped — never left dangling
- `state.lua` enforces valid transitions via a `valid_transitions` table

### Browser Connection State

```
[*] -> Disconnected -> Connecting -> Connected -> Disconnected
```

- Driven by `connected` / `disconnected` messages from the server (stdout JSON Lines)
- On connect, the server sends cached HTML immediately for instant first render

### Buffer State

```
[*] -> Inactive -> Active <-> Editing (debounce)
                -> Suspended (non-markdown buffer focused)
                -> Closed (buffer deleted)
```

- **Suspended**: preview stays on last markdown content, sync paused, server keeps running
- **Active**: returning to a markdown buffer resumes sync

### Invariants

- Server=Stopped implies Browser=Disconnected (always)
- Browser=Connected implies Server=Running (always)
- At most one Running server at a time (port conflict prevention)

### Process Cleanup — Triple Defense

1. **VimLeavePre autocmd**: `close()` -> `jobstop()`
2. **stdin EOF detection**: Go server shuts down when stdin closes (covers Neovim crash / `kill -9`)
3. **Auto port assignment**: `localhost:0` lets OS assign a random port, preventing conflicts from orphaned processes

## Architecture Diagram

```
┌──────────────┐     stdin/stdout          ┌──────────────────┐     WebSocket     ┌──────────────┐
│   Neovim     │ ──── JSON Lines ────────> │  Go Server       │ ───────────────> │  Browser     │
│   (Lua)      │ <─── JSON Lines ──────── │  (go:embed)      │ <─────────────── │  (HTML/JS)   │
└──────────────┘                           └──────────────────┘                  └──────────────┘
  Buffer changes                             goldmark + chroma                    github-markdown-css
  Cursor position                            HTML rendering                       mermaid.js (client)
  Scroll position                            Static file serving                  KaTeX (client)
                                             Image path rewriting                 scrollIntoView sync
```

## Communication Protocol

### Neovim -> Server (stdin, JSON Lines)

- `{ type: "content", bufId, text, baseDir }` — Full buffer text + file directory
- `{ type: "scroll", bufId, topLine, cursorLine }` — Scroll position
- `{ type: "close", bufId }` — Buffer closed

### Server -> Neovim (stdout, JSON Lines)

- `{ type: "ready", port }` — Server started, assigned port
- `{ type: "connected" }` — First browser connected via WebSocket
- `{ type: "disconnected" }` — Last browser disconnected

### Server -> Browser (WebSocket)

- `{ type: "render", html }` — Rendered HTML
- `{ type: "scroll", targetLine }` — Scroll sync (cursor line)
- `{ type: "close" }` — Preview ended (close browser tab)

## Scroll Sync

- Server-side: goldmark AST transformer injects `data-source-line` attributes on block elements (1-based)
- Target elements: heading, paragraph, list, blockquote, code_block, fenced_code_block, thematic_break, table
- Client-side: finds the closest element with `data-source-line <= targetLine` and calls `scrollIntoView({ behavior: "smooth", block: "center" })`

## Image Path Resolution

- Neovim sends `baseDir` (markdown file's parent directory) with each content message
- Server rewrites relative `<img src="...">` paths to `/_local/<url-encoded-absolute-path>`
- The `/_local/` HTTP route reads and serves the file from the local filesystem
- Absolute URLs (`http://`, `https://`, `data:`, `//`) are left unchanged

## Browser Launch Strategy

Browser launch is abstracted via the Strategy pattern. Supports presets (`auto` / `open` / `xdg-open`) and arbitrary command strings.

```lua
-- Default: auto-detect based on OS
-- macOS -> open, Linux -> xdg-open

-- Custom command string example
require('live-markdown').setup({
  browser = {
    strategy = 'cmux browser open-split',
  },
})
```

When a non-preset command string is specified, it is executed directly as `strategy_name .. " " .. url`.

## Distribution

- **Development**: `go run ./cmd/live-markdown` or `test/run.sh` (builds + launches nvim)
- **Build**: `go build -o bin/live-markdown ./cmd/live-markdown`
- **Release**: GitHub Actions builds cross-platform binaries on tag push -> uploaded to GitHub Releases
- **Installation**: `scripts/install.sh` detects OS/arch and downloads the appropriate binary from Releases

### Build Targets

| Target | Asset |
|---|---|
| linux/amd64 | live-markdown-linux-x64 |
| linux/arm64 | live-markdown-linux-arm64 |
| darwin/amd64 | live-markdown-darwin-x64 |
| darwin/arm64 | live-markdown-darwin-arm64 |
| windows/amd64 | live-markdown-windows-x64.exe |

## Static Assets

All static assets are committed to git in `static/` — no CDN dependencies, no build-time downloads:

- `static/css/github-markdown.min.css` — GitHub-flavored markdown styling
- `static/css/chroma-github.css` — Syntax highlighting (light theme)
- `static/css/chroma-github-dark.css` — Syntax highlighting (dark theme)
- `static/css/katex.min.css` — KaTeX math rendering styles
- `static/fonts/KaTeX_*.woff2` — KaTeX font files
- `static/js/katex.min.js` — KaTeX math renderer
- `static/js/contrib/auto-render.min.js` — KaTeX auto-render extension
- `static/js/mermaid.min.js` — Mermaid diagram renderer

## Dependencies

### Go Server (`go.mod`)
- `github.com/yuin/goldmark` — Markdown parser (GFM extension)
- `github.com/yuin/goldmark-highlighting/v2` — Syntax highlighting (chroma)
- `github.com/alecthomas/chroma/v2` — Syntax highlighter engine
- `nhooyr.io/websocket` — WebSocket server

### Neovim Plugin
- No external dependencies (Lua only)
