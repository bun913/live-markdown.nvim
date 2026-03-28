local M = {}

local defaults = {
  server = {
    port = 0, -- 0 = OS が自動割り当て
    host = "localhost",
  },
  browser = {
    strategy = "auto", -- 'auto' | 'cmux' | 'open' | 'xdg-open'
  },
  render = {
    css = "github-markdown", -- 将来: テーマ名 or パス
    mermaid = true,
  },
  scroll_sync = true,
}

M.values = vim.deepcopy(defaults)

function M.setup(opts)
  M.values = vim.tbl_deep_extend("force", vim.deepcopy(defaults), opts or {})
end

return M
