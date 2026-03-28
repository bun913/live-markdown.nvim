--- Deno server lifecycle: start, stop, stdin communication

local state = require("live-markdown.state")

local M = {}

--- Resolve server entry point path from plugin root
local function server_script_path()
  local source = debug.getinfo(1, "S").source:sub(2) -- strip leading @
  -- lua/live-markdown/server.lua -> plugin root
  local plugin_root = vim.fn.fnamemodify(source, ":h:h:h")
  return plugin_root .. "/server/src/main.ts"
end

--- Start the server
function M.start(on_ready)
  if state.server() ~= "stopped" then
    return
  end

  if not state.server_transition("starting") then
    return
  end

  local script = server_script_path()
  local stdout_buffer = ""

  local job_id = vim.fn.jobstart({
    "deno", "run",
    "--allow-net=localhost",
    "--allow-read",
    script,
  }, {
    stdin = "pipe",
    stdout_buffered = false,
    stderr_buffered = false,

    on_stdout = function(_, data)
      for _, line in ipairs(data) do
        if line == "" then
          goto continue
        end

        stdout_buffer = stdout_buffer .. line

        -- JSON Lines: process complete JSON objects
        local ok, msg = pcall(vim.json.decode, stdout_buffer)
        if ok and msg then
          stdout_buffer = ""
          M._handle_server_message(msg, on_ready)
        end

        ::continue::
      end
    end,

    on_stderr = function(_, data)
      for _, line in ipairs(data) do
        if line ~= "" then
          -- Deno's "Listening on ..." etc. — ignore for now
        end
      end
    end,

    on_exit = function(_, exit_code)
      if state.server() ~= "stopped" then
        if exit_code == 0 then
          state.reset()
        else
          state.on_error("server exited with code " .. exit_code)
        end
      end
    end,
  })

  if job_id <= 0 then
    state.on_error("failed to start server (is deno installed?)")
    return
  end

  state.set_job_id(job_id)
end

--- Handle messages from the server
function M._handle_server_message(msg, on_ready)
  if msg.type == "ready" then
    state.set_port(msg.port)
    if state.server_transition("running") then
      if on_ready then
        on_ready(msg.port)
      end
    end
  elseif msg.type == "connected" then
    state.browser_transition("connected")
    -- Resend content on connect (timing safety net)
    local buf_id = state.active_buffer()
    if buf_id and vim.api.nvim_buf_is_valid(buf_id) then
      M.send_content(buf_id)
    end
  elseif msg.type == "disconnected" then
    state.browser_transition("disconnected")
  end
end

--- Send a message via stdin
function M.send(msg)
  local job_id = state.job_id()
  if not job_id or state.server() ~= "running" then
    return
  end
  local line = vim.json.encode(msg) .. "\n"
  vim.fn.chansend(job_id, line)
end

--- Send full buffer content
function M.send_content(buf_id)
  local lines = vim.api.nvim_buf_get_lines(buf_id, 0, -1, false)
  local text = table.concat(lines, "\n")
  M.send({ type = "content", bufId = buf_id, text = text })
end

--- Send scroll position
function M.send_scroll(buf_id)
  local cursor = vim.api.nvim_win_get_cursor(0)
  local topline = vim.fn.line("w0")
  M.send({
    type = "scroll",
    bufId = buf_id,
    topLine = topline,
    cursorLine = cursor[1],
  })
end

--- Stop the server
function M.stop()
  local job_id = state.job_id()
  if not job_id then
    state.reset()
    return
  end

  local current = state.server()
  if current == "stopped" then
    return
  end

  if current == "running" then
    state.server_transition("stopping")
  end

  vim.fn.jobstop(job_id)
  state.reset()
end

return M
