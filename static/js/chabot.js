/**
 * Paw Hub Assistant — posts to Flask /chatbot/message (Gemini via server).
 */
(function () {
  var root = document.querySelector("[data-ph-chatbot]");
  if (!root) return;

  var postUrl = root.getAttribute("data-ph-chat-url");
  if (!postUrl) return;

  var toggleBtn = document.getElementById("ph-chatbot-toggle");
  var panel = document.getElementById("ph-chatbot-panel");
  var closeBtn = document.getElementById("ph-chatbot-close");
  var messagesEl = document.getElementById("ph-chatbot-messages");
  var inputEl = document.getElementById("ph-chatbot-input");
  var sendBtn = document.getElementById("ph-chatbot-send");
  var quickWrap = document.getElementById("ph-chatbot-quick");
  var resizeGrip = document.getElementById("ph-chatbot-resize-grip");
  var SIZE_KEY = "pawhub_chatbot_panel_size_v2";
  var MIN_W = 304;
  var MIN_H = 384;

  /** @type {{ role: string, text: string }[]} */
  var history = [];

  function esc(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function scrollToBottom() {
    if (!messagesEl) return;
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  function appendBubble(role, text, extraClass) {
    if (!messagesEl) return;
    var wrap = document.createElement("div");
    wrap.className =
      "ph-chatbot-msg ph-chatbot-msg--" +
      (role === "user" ? "user" : "bot") +
      (extraClass ? " " + extraClass : "");
    var bubble = document.createElement("div");
    bubble.className = "ph-chatbot-bubble";
    bubble.innerHTML = esc(text).replace(/\n/g, "<br>");
    wrap.appendChild(bubble);
    messagesEl.appendChild(wrap);
    scrollToBottom();
  }

  function setOpen(open) {
    if (!panel || !toggleBtn) return;
    panel.classList.toggle("ph-chatbot-panel--closed", !open);
    panel.setAttribute("aria-hidden", open ? "false" : "true");
    toggleBtn.setAttribute("aria-expanded", open ? "true" : "false");
    if (open) {
      panel.removeAttribute("inert");
    } else {
      panel.setAttribute("inert", "");
    }
    if (open) {
      window.setTimeout(function () {
        if (inputEl) inputEl.focus();
      }, 200);
    }
  }

  function setLoading(loading) {
    if (sendBtn) sendBtn.disabled = loading;
    if (inputEl) inputEl.disabled = loading;
  }

  function saveCurrentSize() {
    if (!panel) return;
    try {
      localStorage.setItem(
        SIZE_KEY,
        JSON.stringify({ w: panel.offsetWidth, h: panel.offsetHeight })
      );
    } catch (e) {}
  }

  function applySavedSize() {
    if (!panel) return;
    try {
      var raw = localStorage.getItem(SIZE_KEY);
      if (!raw) return;
      var obj = JSON.parse(raw);
      var w = Number(obj && obj.w);
      var h = Number(obj && obj.h);
      if (!w || !h) return;
      panel.style.width = w + "px";
      panel.style.height = h + "px";
    } catch (e) {}
  }

  function clamp(n, min, max) {
    return Math.max(min, Math.min(max, n));
  }

  function maxPanelWidth() {
    return Math.max(MIN_W, window.innerWidth - 20);
  }

  function maxPanelHeight() {
    return Math.max(MIN_H, window.innerHeight - 80);
  }

  function removeTyping() {
    if (!messagesEl) return;
    var t = messagesEl.querySelector(".ph-chatbot-msg--typing");
    if (t) t.remove();
  }

  function showTyping() {
    removeTyping();
    appendBubble("bot", "Thinking…", "ph-chatbot-msg--typing");
  }

  async function sendUserText(text) {
    var trimmed = (text || "").trim();
    if (!trimmed) return;

    appendBubble("user", trimmed);
    history.push({ role: "user", text: trimmed });
    if (inputEl) inputEl.value = "";

    setLoading(true);
    showTyping();

    try {
      var res = await fetch(postUrl, {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ messages: history }),
      });
      var data = {};
      try {
        data = await res.json();
      } catch (e) {
        data = {};
      }
      removeTyping();

      var reply = (data && data.reply) || "";
      if (!reply) {
        reply =
          "No response received. Please try again or check that you are still signed in.";
      }
      appendBubble("bot", reply);
      history.push({ role: "assistant", text: reply });
    } catch (err) {
      removeTyping();
      appendBubble(
        "bot",
        "Could not reach the server. Check your connection and try again."
      );
    } finally {
      setLoading(false);
      scrollToBottom();
    }
  }

  if (toggleBtn) {
    toggleBtn.addEventListener("click", function () {
      setOpen(true);
    });
  }
  if (closeBtn) {
    closeBtn.addEventListener("click", function () {
      setOpen(false);
    });
  }

  if (panel && typeof ResizeObserver !== "undefined") {
    var ro = new ResizeObserver(function () {
      saveCurrentSize();
    });
    ro.observe(panel);
  } else if (panel) {
    panel.addEventListener("mouseup", saveCurrentSize);
  }

  if (resizeGrip && panel) {
    resizeGrip.addEventListener("mousedown", function (ev) {
      if (window.innerWidth <= 576) return;
      ev.preventDefault();
      var startX = ev.clientX;
      var startY = ev.clientY;
      var startW = panel.offsetWidth;
      var startH = panel.offsetHeight;

      function onMove(mev) {
        var nextW = clamp(startW + (mev.clientX - startX), MIN_W, maxPanelWidth());
        var nextH = clamp(startH + (mev.clientY - startY), MIN_H, maxPanelHeight());
        panel.style.width = nextW + "px";
        panel.style.height = nextH + "px";
      }

      function onUp() {
        document.removeEventListener("mousemove", onMove);
        document.removeEventListener("mouseup", onUp);
        saveCurrentSize();
      }

      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup", onUp);
    });
  }

  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && panel && !panel.classList.contains("ph-chatbot-panel--closed")) {
      setOpen(false);
    }
  });

  if (sendBtn && inputEl) {
    sendBtn.addEventListener("click", function () {
      sendUserText(inputEl.value);
    });
    inputEl.addEventListener("keydown", function (e) {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        sendUserText(inputEl.value);
      }
    });
  }

  if (quickWrap) {
    quickWrap.querySelectorAll("[data-ph-quick]").forEach(function (chip) {
      chip.addEventListener("click", function () {
        var q = chip.getAttribute("data-ph-quick") || "";
        sendUserText(q);
      });
    });
  }

  applySavedSize();
})();
