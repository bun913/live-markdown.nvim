--- Buffer watching — autocmd-based change detection and buffer switching
--- Follows the Buffer state transitions from state-design.md

local state = require("live-markdown.state")
local server = require("live-markdown.server")

local M = {}

local augroup = nil

function M.start(buf_id)
  state.set_active_buffer(buf_id)
  server.send_content(buf_id)

  augroup = vim.api.nvim_create_augroup("LiveMarkdown", { clear = true })

  -- Send content on buffer change
  vim.api.nvim_create_autocmd({ "TextChanged", "TextChangedI" }, {
    group = augroup,
    buffer = buf_id,
    callback = function()
      if state.server() == "running" then
        server.send_content(buf_id)
      end
    end,
  })

  -- Send scroll position on cursor move
  vim.api.nvim_create_autocmd({ "CursorMoved", "CursorMovedI" }, {
    group = augroup,
    buffer = buf_id,
    callback = function()
      if state.server() == "running" then
        server.send_scroll(buf_id)
      end
    end,
  })

  -- Handle buffer switching
  vim.api.nvim_create_autocmd("BufEnter", {
    group = augroup,
    callback = function(args)
      if state.server() ~= "running" then
        return
      end

      local ft = vim.bo[args.buf].filetype
      if ft == "markdown" then
        -- Switched to another markdown buffer -> update target
        state.set_active_buffer(args.buf)
        server.send_content(args.buf)

        -- Watch the new buffer for changes too
        vim.api.nvim_create_autocmd({ "TextChanged", "TextChangedI" }, {
          group = augroup,
          buffer = args.buf,
          callback = function()
            if state.server() == "running" then
              server.send_content(args.buf)
            end
          end,
        })
      end
      -- Non-markdown buffer -> Suspended (preview stays, sync paused)
    end,
  })

  -- Handle buffer deletion
  vim.api.nvim_create_autocmd({ "BufDelete", "BufWipeout" }, {
    group = augroup,
    buffer = buf_id,
    callback = function()
      -- STEP1: single buffer, so stop the server
      require("live-markdown").close()
    end,
  })
end

function M.stop()
  if augroup then
    vim.api.nvim_del_augroup_by_id(augroup)
    augroup = nil
  end
  state.set_active_buffer(nil)
end

return M
