--- 状態管理 — 設計の中心
--- state-design.md の状態遷移図をコードで表現する。
--- Error は状態ではなくイベント（遷移の原因）として扱う。

local M = {}

-- 許可される遷移の定義
local valid_transitions = {
  server = {
    stopped  = { starting = true },
    starting = { running = true, stopped = true },
    running  = { stopping = true, stopped = true },
    stopping = { stopped = true },
  },
  browser = {
    disconnected = { connecting = true },
    connecting   = { connected = true, disconnected = true },
    connected    = { disconnected = true },
  },
}

-- 現在の状態
local state = {
  server = "stopped",
  browser = "disconnected",
  buffer_id = nil, -- 将来の複数バッファ対応に備え ID で管理
  port = nil,
  job_id = nil,
}

function M.get()
  return vim.deepcopy(state)
end

function M.server()
  return state.server
end

function M.browser()
  return state.browser
end

--- 状態遷移（不正な遷移は拒否）
local function transition(layer, new_state)
  local current = state[layer]
  local allowed = valid_transitions[layer][current]
  if not allowed or not allowed[new_state] then
    vim.notify(
      string.format("[live-markdown] invalid transition: %s %s -> %s", layer, current, new_state),
      vim.log.levels.ERROR
    )
    return false
  end
  state[layer] = new_state
  return true
end

function M.server_transition(new_state)
  return transition("server", new_state)
end

function M.browser_transition(new_state)
  return transition("browser", new_state)
end

function M.set_port(port)
  state.port = port
end

function M.port()
  return state.port
end

function M.set_job_id(id)
  state.job_id = id
end

function M.job_id()
  return state.job_id
end

function M.set_active_buffer(buf_id)
  state.buffer_id = buf_id
end

function M.active_buffer()
  return state.buffer_id
end

--- エラー発生時: 即座に stopped/disconnected に遷移 + ユーザー通知
function M.on_error(err)
  state.server = "stopped"
  state.browser = "disconnected"
  state.port = nil
  state.job_id = nil
  state.buffer_id = nil
  vim.notify("[live-markdown] " .. err, vim.log.levels.ERROR)
end

--- 全状態をリセット（クリーンアップ完了時）
function M.reset()
  state.server = "stopped"
  state.browser = "disconnected"
  state.port = nil
  state.job_id = nil
  state.buffer_id = nil
end

return M
