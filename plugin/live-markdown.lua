-- Entry point — command definitions only
-- Actual work is lazy-loaded via require() (no startup cost)

vim.api.nvim_create_user_command("MarkdownPreview", function()
  require("live-markdown").open()
end, {})

vim.api.nvim_create_user_command("MarkdownPreviewStop", function()
  require("live-markdown").close()
end, {})
