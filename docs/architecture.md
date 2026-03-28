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
