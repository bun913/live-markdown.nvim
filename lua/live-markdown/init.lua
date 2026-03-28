--- Public API: setup(), open(), close()
--- Orchestrates all modules

local config = require("live-markdown.config")
local state = require("live-markdown.state")
local server = require("live-markdown.server")
local browser = require("live-markdown.browser")
local buffer = require("live-markdown.buffer")

local M = {}

function M.setup(opts)
  config.setup(opts)

  -- Defense line 1: ensure cleanup on VimLeavePre
  vim.api.nvim_create_autocmd("VimLeavePre", {
    callback = function()
      M.close()
    end,
  })
end

function M.open()
  -- Prevent double start
  if state.server() ~= "stopped" then
    vim.notify("[live-markdown] already running", vim.log.levels.WARN)
    return
  end

  local buf_id = vim.api.nvim_get_current_buf()
  if vim.bo[buf_id].filetype ~= "markdown" then
    vim.notify("[live-markdown] not a markdown buffer", vim.log.levels.WARN)
    return
  end

  -- Start server -> on ready, open browser -> start buffer watching
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
