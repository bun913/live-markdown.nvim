// live-markdown preview client
// WebSocket receive -> DOM update + scroll sync + auto-reconnect

(function () {
  "use strict";

  var contentEl = document.getElementById("content");
  var wsUrl = "ws://" + location.host + "/";
  var ws;
  var reconnectDelay = 1000;
  var closed = false; // explicitly closed by server

  // --- Mermaid rendering ---

  var mermaidCounter = 0;

  function renderMermaidBlocks() {
    // markdown-it renders ```mermaid as <pre><code class="language-mermaid">
    var codeBlocks = contentEl.querySelectorAll("code.language-mermaid");
    if (codeBlocks.length === 0) return;

    var nodes = [];
    for (var i = 0; i < codeBlocks.length; i++) {
      var code = codeBlocks[i];
      var pre = code.parentElement;
      if (!pre || pre.tagName !== "PRE") continue;

      // Replace <pre><code> with a <div class="mermaid">
      var div = document.createElement("div");
      div.className = "mermaid";
      div.id = "mermaid-" + (++mermaidCounter);
      div.textContent = code.textContent;
      pre.replaceWith(div);
      nodes.push(div);
    }

    if (nodes.length > 0) {
      mermaid.run({ nodes: nodes }).catch(function (err) {
        console.error("[live-markdown] mermaid error:", err);
      });
    }
  }

  // --- Scroll sync ---

  function scrollToLine(targetLine) {
    // Find the closest element with data-source-line <= targetLine
    var elements = contentEl.querySelectorAll("[data-source-line]");
    var best = null;
    var bestLine = 0;

    for (var i = 0; i < elements.length; i++) {
      var line = parseInt(elements[i].getAttribute("data-source-line"), 10);
      if (line <= targetLine && line > bestLine) {
        best = elements[i];
        bestLine = line;
      }
    }

    if (best) {
      best.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }

  // --- Connection ---

  function tryClose() {
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
          renderMermaidBlocks();
          break;
        case "scroll":
          scrollToLine(msg.targetLine);
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
