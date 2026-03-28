// live-markdown preview client
// WebSocket receive -> DOM update + auto-reconnect

(function () {
  "use strict";

  var contentEl = document.getElementById("content");
  var wsUrl = "ws://" + location.host + "/";
  var ws;
  var reconnectDelay = 1000;
  var closed = false; // explicitly closed by server

  function tryClose() {
    // window.close() has restrictions; fall back to a notice if it fails
    window.close();
    document.title = "Preview closed";
    contentEl.innerHTML =
      '<p style="color:#888;text-align:center;padding:2rem">' +
      "Preview server stopped. You can close this tab.</p>";
  }

  function connect() {
    if (closed) return;
    ws = new WebSocket(wsUrl);

    ws.addEventListener("open", function () {
      reconnectDelay = 1000; // reset
    });

    ws.addEventListener("message", function (event) {
      var msg;
      try {
        msg = JSON.parse(event.data);
      } catch (e) {
        return;
      }

      switch (msg.type) {
        case "render":
          contentEl.innerHTML = msg.html;
          break;
        case "scroll":
          // TODO: basic scroll sync
          break;
        case "close":
          closed = true;
          tryClose();
          break;
      }
    });

    ws.addEventListener("close", function () {
      if (closed) return;
      // Auto-reconnect with exponential backoff (max 10s)
      setTimeout(connect, reconnectDelay);
      reconnectDelay = Math.min(reconnectDelay * 1.5, 10000);
    });
  }

  connect();
})();
