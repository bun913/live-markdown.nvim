-- テスト用の最小設定
-- 使い方: nvim -u test/init.lua test/sample.md

-- プラグインルートを runtimepath に追加
local plugin_root = vim.fn.fnamemodify(debug.getinfo(1, "S").source:sub(2), ":h:h")
vim.opt.rtp:prepend(plugin_root)

-- プラグイン読み込み
vim.cmd("runtime plugin/live-markdown.lua")

-- setup（デフォルト設定）
require("live-markdown").setup({
  browser = {
    strategy = "open", -- macOS。Linux なら "xdg-open"
  },
})

-- filetype 検知を有効化
vim.cmd("filetype on")
