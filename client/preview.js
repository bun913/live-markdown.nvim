// live-markdown preview client
// WebSocket 受信 → DOM 更新 + 自動再接続

(function () {
  "use strict";

  var contentEl = document.getElementById("content");
  var wsUrl = "ws://" + location.host + "/";
  var ws;
  var reconnectDelay = 1000;
  var closed = false; // サーバーから明示的に close された

  function tryClose() {
    // window.close() は制約があるため、ダメならページ内容を差し替え
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
      reconnectDelay = 1000;
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
          // STEP1: 基本的なスクロール同期（後で実装）
          break;
        case "close":
          closed = true;
          tryClose();
          break;
      }
    });

    ws.addEventListener("close", function () {
      if (closed) return;
      // 自動再接続（exponential backoff, max 10s）
      setTimeout(connect, reconnectDelay);
      reconnectDelay = Math.min(reconnectDelay * 1.5, 10000);
    });
  }

  connect();
})();
