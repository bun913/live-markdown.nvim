# live-markdown.nvim — Development Guide

## About

Real-time markdown preview plugin for Neovim. Aims to succeed markdown-preview.nvim with a focus on security, modern dependencies, and clean process lifecycle.

## Design Principles — Read before implementing

### 1. Focus on state, not operations

Ref: https://zenn.dev/knowledgework/articles/c48539d2f35ecc

Design from "what states are possible" rather than "what operations to perform". Operation-first thinking leads to ad-hoc if-branches for unexpected states. State-first thinking reveals edge cases naturally.

Examples:
- Error is an event (cause of transition), not a state. When an error occurs, the server transitions to Stopped — never left dangling in an "Error" state
- Buffer switching behavior is organized by state (Active / Suspended / Closed), not by operation (what to do when BufEnter fires)

See `docs/architecture.md` for details.

### 2. Design compromises as STEP1 of the ideal

Ref: https://zenn.dev/knowledgework/articles/c3f2f5986a24a6

Instead of ad-hoc implementations, envision the ideal final form and design STEP1 toward it. Structure the code so future extensions require minimal changes.

Examples:
- Messages include `bufId` (single buffer now, but ready for multi-buffer support)
- Diagram rendering runs client-side via mermaid.js (PlantUML etc. can be added the same way)
- Browser launch uses the Strategy pattern (presets + arbitrary command strings)

See `docs/architecture.md` for details.

## Design Document

Read before implementing:

`docs/architecture.md` — Tech stack, state design, communication protocol, distribution, and rationale.

## Tech Stack

- **Neovim plugin**: Lua (no external dependencies)
- **Preview server**: Deno (TypeScript)
- **Markdown parser**: markdown-it (server-side rendering)
- **CSS**: github-markdown-css (loaded from CDN)
- **Diagrams**: mermaid.js (downloaded at build time from CDN, rendered client-side)
- **Communication**: Neovim <-> Server via stdin/stdout (JSON Lines), Server <-> Browser via WebSocket
- **Distribution**: `deno compile` single binary -> GitHub Releases (users do not need Deno)

## Implementation Rules

### Respect state transitions
- `state.lua` is the design center. All transitions go through it
- Prevent invalid transitions (e.g. sending content when Server=Stopped)
- When adding features, update the state diagram before writing code

### Error is not a state
- On error, transition immediately to Stopped / Disconnected
- Never write `if state == 'error'` branches
- Notify users via `vim.notify()`

### Process cleanup
- Triple defense: VimLeavePre autocmd + stdin EOF detection + auto port assignment
- Never repeat markdown-preview.nvim's orphan process problem
- See "Process Cleanup — Triple Defense" in `docs/architecture.md`

### Preserve future-ready structure
- Never omit `bufId` from messages
- Keep CSS externally injected via templates, not hardcoded

## Key Implementation Decisions

- **Neovim <-> Server communication**: stdin/stdout JSON Lines (not WebSocket)
- **mermaid rendering**: Client-side (`mermaid.run()` in the browser, not server-side)
- **mermaid distribution**: Downloaded from CDN at build time to `client/vendor/mermaid.min.js`, served as `/vendor/mermaid.min.js`
- **github-markdown-css**: Loaded from CDN (cdnjs), not bundled
- **Scroll sync**: `data-source-line` attribute + `scrollIntoView()`
- **Fence rule**: Special handling to inject `data-source-line` on `<pre>` tags while preserving class attributes
- **Browser launch**: Presets + arbitrary command strings executed directly
- **Initial connection**: Server caches last rendered HTML, sends immediately on WebSocket connect
- **Server shutdown**: Sends `close` message to browser, attempts `window.close()`
