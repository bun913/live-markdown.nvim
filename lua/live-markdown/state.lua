--- State management — the design center.
--- Encodes the state diagrams from state-design.md.
--- Error is not a state but an event (a cause of transition).

local M = {}

-- Allowed transitions
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
    connected    = { connecting = true, disconnected = true },
  },
}

-- Current state
local state = {
  server = "stopped",
  browser = "disconnected",
  buffer_id = nil, -- managed by ID for future multi-buffer support
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

--- Guarded state transition (rejects invalid ones)
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

--- On error: transition to stopped/disconnected immediately + notify user
function M.on_error(err)
  state.server = "stopped"
  state.browser = "disconnected"
  state.port = nil
  state.job_id = nil
  state.buffer_id = nil
  vim.notify("[live-markdown] " .. err, vim.log.levels.ERROR)
end

--- Reset all state (on cleanup completion)
function M.reset()
  state.server = "stopped"
  state.browser = "disconnected"
  state.port = nil
  state.job_id = nil
  state.buffer_id = nil
end

return M
