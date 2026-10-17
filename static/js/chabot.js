/**
 * Paw Hub Assistant — posts to Flask /chatbot/message (local rule-based replies).
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
  var quickWrap = document.getElementById("ph-chatbot-quick");
  var resizeGrip = document.getElementById("ph-chatbot-resize-grip");
  var SIZE_KEY = "pawhub_chatbot_panel_size_v2";
  var MIN_W = 304;
  var MIN_H = 384;

  var busy = false;
  var trail = ["menu"];
  var backBtn = document.getElementById("ph-chatbot-back");
  var homeBtn = document.getElementById("ph-chatbot-home");
  var topicEl = document.getElementById("ph-chatbot-topic");

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
    if (!open) toggleBtn.focus();
    if (open) {
      window.setTimeout(function () {
        var firstOption = quickWrap && quickWrap.querySelector("button");
        if (firstOption && !panel.hasAttribute("inert")) firstOption.focus();
      }, 200);
    }
  }

  function setLoading(loading) {
    busy = loading;
    if (backBtn) backBtn.disabled = loading || trail.length < 2;
    if (homeBtn) homeBtn.disabled = loading || trail[trail.length - 1] === "menu";
    if (quickWrap) quickWrap.setAttribute("aria-busy", String(loading));
    if (quickWrap) quickWrap.querySelectorAll("button").forEach(function (button) {
      button.disabled = loading;
    });
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
    appendBubble("bot", "Loading help…", "ph-chatbot-msg--typing");
  }

  function renderChoices(options) {
    quickWrap.replaceChildren();
    options.forEach(function (option) {
      var button = document.createElement("button");
      button.type = "button";
      button.className = "ph-chatbot-chip";
      button.dataset.phChoice = option.value;
      button.textContent = option.label;
      quickWrap.appendChild(button);
    });
  }

  async function choose(value, label, navigation) {
    if (!value || busy) return;
    appendBubble("user", label);
    setLoading(true);
    showTyping();
    var controller = new AbortController();
    var timeout = window.setTimeout(function () { controller.abort(); }, 15000);
    try {
      var res = await fetch(postUrl, {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ option: value }),
        signal: controller.signal,
      });
      if (res.redirected || res.status === 401) {
        throw new Error("Please sign in again, then choose an option.");
      }
      var data = await res.json();
      if (!res.ok || typeof data.reply !== "string" || typeof data.node !== "string" || !Array.isArray(data.options)) {
        throw new Error("Help is unavailable right now. Please try the option again.");
      }
      if (navigation === "home" || data.node === "menu") trail = ["menu"];
      else if (navigation === "back") trail.pop();
      else trail.push(data.node);
      removeTyping();
      appendBubble("bot", data.reply);
      topicEl.textContent = data.title;
      renderChoices(data.options);
    } catch (err) {
      removeTyping();
      appendBubble("bot", err.name === "AbortError"
        ? "The request timed out. Please choose the option again."
        : (err instanceof TypeError || err instanceof SyntaxError)
          ? "Could not load help. Check your connection and try again."
          : err.message);
    } finally {
      window.clearTimeout(timeout);
      setLoading(false);
      scrollToBottom();
      var firstOption = quickWrap.querySelector("button");
      if (firstOption && !panel.hasAttribute("inert")) firstOption.focus();
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

  if (quickWrap) {
    quickWrap.addEventListener("click", function (event) {
      var chip = event.target.closest("[data-ph-choice]");
      if (chip && quickWrap.contains(chip)) choose(chip.dataset.phChoice, chip.textContent);
    });
  }
  if (backBtn) backBtn.addEventListener("click", function () {
    if (trail.length > 1) choose(trail[trail.length - 2], "Back", "back");
  });
  if (homeBtn) homeBtn.addEventListener("click", function () {
    choose("menu", "Main menu", "home");
  });

  applySavedSize();
})();
