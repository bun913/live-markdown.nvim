--- Public API: setup(), open(), close()
--- 各モジュールのオーケストレーション

local config = require("live-markdown.config")
local state = require("live-markdown.state")
local server = require("live-markdown.server")
local browser = require("live-markdown.browser")
local buffer = require("live-markdown.buffer")

local M = {}

function M.setup(opts)
  config.setup(opts)

  -- 防衛線1: VimLeavePre で確実にクリーンアップ
  vim.api.nvim_create_autocmd("VimLeavePre", {
    callback = function()
      M.close()
    end,
  })
end

function M.open()
  -- 二重起動防止
  if state.server() ~= "stopped" then
    vim.notify("[live-markdown] already running", vim.log.levels.WARN)
    return
  end

  local buf_id = vim.api.nvim_get_current_buf()
  if vim.bo[buf_id].filetype ~= "markdown" then
    vim.notify("[live-markdown] not a markdown buffer", vim.log.levels.WARN)
    return
  end

  -- サーバー起動 → ready でブラウザ起動 → バッファ監視開始
  server.start(function(port)
    browser.open(port)
    buffer.start(buf_id)
  end)
end

function M.close()
  buffer.stop()
  server.stop()
end

return M
