-- Minimal config for testing with compiled binary
-- Usage: nvim -u test/init-binary.lua test/sample.md
-- Requires: cd server && deno task build

-- Add plugin root to runtimepath
local plugin_root = vim.fn.fnamemodify(debug.getinfo(1, "S").source:sub(2), ":h:h")
vim.opt.rtp:prepend(plugin_root)

-- Load plugin
vim.cmd("runtime plugin/live-markdown.lua")

-- Setup with binary server
require("live-markdown").setup({
	server = {
		binary = plugin_root .. "/bin/live-markdown",
	},
	browser = {
		strategy = "cmux browser open-split", -- macOS; use "xdg-open" on Linux
	},
})

-- Enable filetype detection
vim.cmd("filetype on")
