<p align="center">
  <img src="docs/images/icon.png" width="200" />
</p>

<h1 align="center">live-markdown.nvim</h1>

<p align="center">Real-time markdown preview for Neovim.</p>

<p align="center"><a href="docs/README.ja.md">日本語</a></p>

<p align="center">
  <img src="docs/images/demo.gif" alt="demo" />
</p>

## Features

- Single binary — no runtime dependencies (Deno not required)
- Real-time preview with scroll sync
- Mermaid diagram rendering
- GitHub-flavored styling (light/dark auto-switch)

## Installation

### lazy.nvim

```lua
{
  "bun913/live-markdown.nvim",
  cmd = { "MarkdownPreview", "MarkdownPreviewStop" },
  build = "scripts/install.sh",
  config = function()
    require("live-markdown").setup()
  end,
}
```

With a custom browser strategy:

```lua
{
  "bun913/live-markdown.nvim",
  cmd = { "MarkdownPreview", "MarkdownPreviewStop" },
  build = "scripts/install.sh",
  config = function()
    require("live-markdown").setup({
      browser = {
        strategy = "cmux browser open-split",
      },
    })
  end,
}
```

Pre-built binaries are downloaded from GitHub Releases. No runtime dependencies required.

## Usage

```vim
:MarkdownPreview       " Open preview in browser
:MarkdownPreviewStop   " Close preview
```

## Configuration

```lua
require("live-markdown").setup({
  server = {
    port = 0,            -- 0 = OS auto-assigns
    host = "localhost",
    binary = nil,        -- path to compiled binary (nil = use deno run)
  },
  browser = {
    strategy = "auto",   -- "auto" | "open" | "xdg-open" | custom command
  },
  render = {
    css = "github-markdown",
    mermaid = true,
  },
  scroll_sync = true,
})
```

### Browser strategy

| Strategy | Description |
|---|---|
| `"auto"` | Auto-detect: macOS `open`, Linux `xdg-open` |
| `"open"` | macOS default browser |
| `"xdg-open"` | Linux default browser |
| Custom string | Executed as shell command with URL appended |

Example with a custom command:

```lua
require("live-markdown").setup({
  browser = {
    strategy = "cmux browser open-split",
  },
})
```

## License

MIT
