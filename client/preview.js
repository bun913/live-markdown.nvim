// live-markdown preview client
// WebSocket receive -> DOM update + scroll sync + auto-reconnect

(function () {
  "use strict";

  const contentEl = document.getElementById("content");
  const wsUrl = `ws://${location.host}/`;
  let ws;
  let reconnectDelay = 1000;
  let closed = false; // explicitly closed by server

  // --- KaTeX math rendering ---

  function renderMath() {
    if (typeof renderMathInElement === "function") {
      renderMathInElement(contentEl, {
        delimiters: [
          { left: "$$", right: "$$", display: true },
          { left: "$", right: "$", display: false },
        ],
        throwOnError: false,
      });
    }
  }

  // --- Mermaid rendering ---

  let mermaidCounter = 0;

  function renderMermaidBlocks() {
    // markdown-it renders ```mermaid as <pre><code class="language-mermaid">
    const codeBlocks = contentEl.querySelectorAll("code.language-mermaid");
    if (codeBlocks.length === 0) return;

    const nodes = [];
    for (const code of codeBlocks) {
      const pre = code.parentElement;
      if (!pre || pre.tagName !== "PRE") continue;

      // Replace <pre><code> with a <div class="mermaid">
      const div = document.createElement("div");
      div.className = "mermaid";
      div.id = `mermaid-${++mermaidCounter}`;
      div.textContent = code.textContent;
      pre.replaceWith(div);
      nodes.push(div);
    }

    if (nodes.length > 0) {
      mermaid.run({ nodes }).catch((err) => {
        console.error("[live-markdown] mermaid error:", err);
      });
    }
  }

  // --- Scroll sync ---

  function scrollToLine(targetLine) {
    // Find the closest element with data-source-line <= targetLine
    const elements = contentEl.querySelectorAll("[data-source-line]");
    let best = null;
    let bestLine = 0;

    for (const el of elements) {
      const line = parseInt(el.getAttribute("data-source-line"), 10);
      if (line <= targetLine && line > bestLine) {
        best = el;
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

    ws.addEventListener("open", () => {
      reconnectDelay = 1000;
    });

    ws.addEventListener("message", (event) => {
      let msg;
      try {
        msg = JSON.parse(event.data);
      } catch {
        return;
      }

      switch (msg.type) {
        case "render":
          contentEl.innerHTML = msg.html;
          renderMath();
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

    ws.addEventListener("close", () => {
      if (closed) return;
      // Auto-reconnect with exponential backoff (max 10s)
      setTimeout(connect, reconnectDelay);
      reconnectDelay = Math.min(reconnectDelay * 1.5, 10000);
    });
  }

  connect();
})();
