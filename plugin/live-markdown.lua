-- エントリーポイント — コマンド定義のみ
-- 実際の処理は require() で遅延ロード（起動時間に影響しない）

vim.api.nvim_create_user_command("MarkdownPreview", function()
  require("live-markdown").open()
end, {})

vim.api.nvim_create_user_command("MarkdownPreviewStop", function()
  require("live-markdown").close()
end, {})
