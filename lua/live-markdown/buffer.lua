--- バッファ監視 — autocmd による変更検知・バッファ切り替え
--- state-design.md の Buffer 状態遷移に従う

local state = require("live-markdown.state")
local server = require("live-markdown.server")

local M = {}

local augroup = nil

function M.start(buf_id)
  state.set_active_buffer(buf_id)
  server.send_content(buf_id)

  augroup = vim.api.nvim_create_augroup("LiveMarkdown", { clear = true })

  -- バッファ変更時に内容を送信
  vim.api.nvim_create_autocmd({ "TextChanged", "TextChangedI" }, {
    group = augroup,
    buffer = buf_id,
    callback = function()
      if state.server() == "running" then
        server.send_content(buf_id)
      end
    end,
  })

  -- バッファ切り替え
  vim.api.nvim_create_autocmd("BufEnter", {
    group = augroup,
    callback = function(args)
      if state.server() ~= "running" then
        return
      end

      local ft = vim.bo[args.buf].filetype
      if ft == "markdown" then
        -- 別の markdown バッファに切り替え → 対象更新
        state.set_active_buffer(args.buf)
        server.send_content(args.buf)

        -- 新しいバッファにも TextChanged を設定
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
      -- markdown 以外 → Suspended（プレビューは維持、同期停止）
    end,
  })

  -- バッファ削除
  vim.api.nvim_create_autocmd({ "BufDelete", "BufWipeout" }, {
    group = augroup,
    buffer = buf_id,
    callback = function()
      -- STEP1: 単一バッファなのでサーバー停止
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
