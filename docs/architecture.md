# Architecture

## Overview

A markdown preview plugin for Neovim. A Deno-based local server renders markdown and displays a real-time preview in the browser. Browser launch strategy is configurable: `open` (macOS) / `xdg-open` (Linux) or any custom command string.

## Tech Stack

| Layer | Technology | Notes |
|---|---|---|
| Neovim plugin | Lua | Server process launched via `vim.fn.jobstart()` |
| Preview server | Deno (TypeScript) | `deno run` in dev, `deno compile` binary for distribution |
| Markdown parser | markdown-it | Server-side rendering with `data-source-line` attribute injection |
| CSS | github-markdown-css | Loaded from CDN (cdnjs), auto light/dark switching |
| Diagrams | mermaid.js | Downloaded at build time, served as `/vendor/mermaid.min.js`, rendered client-side |
| Neovim <-> Server | stdin/stdout JSON Lines | `vim.fn.jobstart()` + `vim.fn.chansend()` |
| Server <-> Browser | WebSocket | Real-time delivery (render / scroll / close) |
| Code highlighting | TBD | highlight.js vs Shiki (STEP2+) |

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
2. **stdin EOF detection**: Deno server shuts down when stdin closes (covers Neovim crash / `kill -9`)
3. **Auto port assignment**: `port: 0` lets OS assign a random port, preventing conflicts from orphaned processes

## Architecture Diagram

```
┌──────────────┐     stdin/stdout          ┌──────────────────┐     WebSocket     ┌──────────────┐
│   Neovim     │ ──── JSON Lines ────────> │  Deno Server     │ ───────────────> │  Browser     │
│   (Lua)      │ <─── JSON Lines ──────── │  (TypeScript)    │ <─────────────── │  (HTML/JS)   │
└──────────────┘                           └──────────────────┘                  └──────────────┘
  Buffer changes                             markdown-it                          github-markdown-css (CDN)
  Cursor position                            HTML rendering                       mermaid.js (vendored)
  Scroll position                            Static file serving                  scrollIntoView sync
                                             mermaid.min.js serving
```

## Communication Protocol

### Neovim -> Server (stdin, JSON Lines)

- `{ type: "content", bufId, text }` — Full buffer text
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

- Server-side: markdown-it injects `data-source-line` attributes on block elements (1-based)
- Target elements: heading, paragraph, bullet_list, ordered_list, blockquote, code_block, hr, table, fence
- Fence has special handling: preserves default renderer output (`<pre><code class="language-xxx">`) while injecting `data-source-line` on the `<pre>` tag
- Client-side: finds the closest element with `data-source-line <= targetLine` and calls `scrollIntoView({ behavior: "smooth", block: "center" })`

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

- **Development**: `cd server && deno task dev`
- **Build**: `cd server && deno task build` (runs `setup` to download mermaid.min.js, then `deno compile`)
- **Release**: GitHub Actions builds cross-platform binaries on tag push -> uploaded to GitHub Releases
- **Installation**: `scripts/install.sh` detects OS/arch and downloads the appropriate binary from Releases

### Build Targets

| Target | Asset |
|---|---|
| x86_64-unknown-linux-gnu | live-markdown-linux-x64 |
| aarch64-unknown-linux-gnu | live-markdown-linux-arm64 |
| x86_64-apple-darwin | live-markdown-darwin-x64 |
| aarch64-apple-darwin | live-markdown-darwin-arm64 |
| x86_64-pc-windows-msvc | live-markdown-windows-x64.exe |

## Security (Deno Permissions)

Server permissions are restricted to the minimum:

```
--allow-net=localhost       # Local server only
--allow-read                # Serve client/ files and node_modules
```

## Why Deno

1. **Permission model**: All resource access is denied by default. Required permissions are granted explicitly, structurally reducing vulnerability risk
2. **Dependency management**: `deno.json` imports + `nodeModulesDir: "auto"` for npm packages. `deno.lock` for reproducibility
3. **Single binary distribution**: `deno compile` produces a standalone executable. Users do not need Deno installed
4. **Neovim track record**: Prior art in denops.vim, peek.nvim, etc.

## Dependencies

### Deno Server (`server/deno.json`)
- `markdown-it` (npm:markdown-it@^14.1.0) — Markdown parser
- `@types/markdown-it` (npm:@types/markdown-it@^14.1.2) — Type definitions

### Vendored Assets (downloaded at build time)
- `mermaid.js` (v11.13.0) — Diagram rendering (served to browser as `/vendor/mermaid.min.js`)

### Browser (CDN)
- `github-markdown-css` — Loaded from CDN (cdnjs 5.8.1)

### Neovim Plugin
- No external dependencies (Lua only)

## Open Questions

- [ ] Code syntax highlighting: highlight.js vs Shiki
- [ ] Math rendering (KaTeX) support
- [ ] Bundling github-markdown-css (currently CDN, may bundle for offline support)
- [ ] Additional markdown-it plugins (task lists, footnotes, emoji, etc.)
