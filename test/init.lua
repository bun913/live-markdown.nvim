-- Minimal config for testing
-- Usage: nvim -u test/init.lua test/sample.md

-- Add plugin root to runtimepath
local plugin_root = vim.fn.fnamemodify(debug.getinfo(1, "S").source:sub(2), ":h:h")
vim.opt.rtp:prepend(plugin_root)

-- Load plugin
vim.cmd("runtime plugin/live-markdown.lua")

-- Setup with defaults
require("live-markdown").setup({
  browser = {
    strategy = "open", -- macOS; use "xdg-open" on Linux
  },
})

-- Enable filetype detection
vim.cmd("filetype on")
