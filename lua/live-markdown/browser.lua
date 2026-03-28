--- Browser launch — Strategy pattern
--- 'auto' detects cmux availability and falls back to OS default

local config = require("live-markdown.config")
local state = require("live-markdown.state")

local M = {}

local strategies = {
  cmux = function(url)
    vim.fn.system("cmux browser open-split " .. vim.fn.shellescape(url))
  end,
  open = function(url)
    vim.fn.system("open " .. vim.fn.shellescape(url))
  end,
  ["xdg-open"] = function(url)
    vim.fn.system("xdg-open " .. vim.fn.shellescape(url))
  end,
}

local function detect_strategy()
  if vim.fn.executable("cmux") == 1 then
    return "cmux"
  elseif vim.fn.has("mac") == 1 then
    return "open"
  else
    return "xdg-open"
  end
end

function M.open(port)
  if not state.browser_transition("connecting") then
    return
  end

  local strategy_name = config.values.browser.strategy
  if strategy_name == "auto" then
    strategy_name = detect_strategy()
  end

  local url = string.format("http://localhost:%d", port)

  local strategy = strategies[strategy_name]
  if strategy then
    strategy(url)
  else
    -- Treat as a custom command (e.g. "cmux browser open-split")
    vim.fn.system(strategy_name .. " " .. vim.fn.shellescape(url))
  end
end

return M
