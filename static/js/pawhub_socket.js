/**
 * Real-time notifications (Socket.IO): join room user_<id>, listen for new_notification.
 * Server: app.py (Flask-SocketIO) + create_notification().
 *
 * Also defines window.PAWHUB_RELATIVE_TIME for owner/sitter pages (notifications,
 * owner applications): elements with data-ph-ts (ISO …Z) and title (KL label).
 */
(function () {
  var uid = window.PAWHUB_USER_ID;
  if (uid === null || uid === undefined) return;

  function toastClass(t) {
    if (t === "success") return "success";
    if (t === "warning") return "warning";
    if (t === "danger") return "danger";
    return "info";
  }

  function showToast(message, type, title) {
    var stack = document.getElementById("ph-toast-stack");
    if (!stack) return;
    var el = document.createElement("div");
    el.className =
      "alert alert-" +
      toastClass(type) +
      " shadow-sm mb-2 py-2 px-3 small mb-0 border-0";
    el.setAttribute("role", "status");
    var head = title && String(title).trim();
    el.textContent = head ? head + " — " + message : message;
    stack.appendChild(el);
    window.setTimeout(function () {
      try {
        el.remove();
      } catch (e) {}
    }, 7000);
  }

  function bumpUnreadBadge() {
    var b = document.getElementById("pawhub-notif-badge");
    if (!b) return;
    var n = parseInt(String(b.textContent).trim(), 10);
    if (isNaN(n)) n = 0;
    b.textContent = String(n + 1);
    b.classList.remove("d-none");
  }

  var socket = io({ transports: ["websocket", "polling"] });

  socket.on("connect", function () {
    socket.emit("join", { user_id: uid });
  });

  socket.on("new_notification", function (data) {
    if (!data || !data.message) return;
    showToast(
      data.message,
      data.type || data.notif_type || "info",
      data.title
    );
    bumpUnreadBadge();
    try {
      document.dispatchEvent(new CustomEvent("pawhub:new-notification", { detail: data }));
    } catch (e) {}
  });
})();

(function () {
  var KL = "Asia/Kuala_Lumpur";
  var tickId = null;

  function parseUtcMs(iso) {
    if (!iso || typeof iso !== "string") return NaN;
    return Date.parse(iso);
  }

  function formatRelative(ms) {
    if (!isFinite(ms)) return "";
    var sec = Math.floor((Date.now() - ms) / 1000);
    if (sec < 45) return "Just now";
    var min = Math.floor(sec / 60);
    if (min < 60) return min <= 1 ? "1 minute ago" : min + " minutes ago";
    var hr = Math.floor(min / 60);
    if (hr < 24) return hr === 1 ? "1 hour ago" : hr + " hours ago";
    var day = Math.floor(hr / 24);
    if (day < 7) return day === 1 ? "1 day ago" : day + " days ago";
    var wk = Math.floor(day / 7);
    if (wk < 5) return wk === 1 ? "1 week ago" : wk + " weeks ago";
    return "";
  }

  function formatKlMedium(iso) {
    var ms = parseUtcMs(iso);
    if (!isFinite(ms)) return "";
    try {
      return new Intl.DateTimeFormat("en-MY", {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: KL,
      }).format(new Date(ms));
    } catch (e) {
      return "";
    }
  }

  function displayText(iso, labelFallback) {
    var ms = parseUtcMs(iso);
    if (!isFinite(ms)) return labelFallback || "";
    var rel = formatRelative(ms);
    if (rel) return rel;
    if (labelFallback) return labelFallback;
    var kl = formatKlMedium(iso);
    return kl || labelFallback || "";
  }

  function refreshIn(container) {
    var root = container || document;
    if (!root.querySelectorAll) return;
    root.querySelectorAll("[data-ph-ts]").forEach(function (el) {
      var iso = el.getAttribute("data-ph-ts");
      if (!iso) return;
      var label = el.getAttribute("data-ph-label") || el.getAttribute("title") || "";
      el.textContent = displayText(iso, label);
    });
  }

  function startTicker(intervalMs) {
    if (tickId) return;
    var ms = intervalMs > 0 ? intervalMs : 30000;
    tickId = setInterval(function () {
      refreshIn(document);
    }, ms);
  }

  function stopTicker() {
    if (tickId) {
      clearInterval(tickId);
      tickId = null;
    }
  }

  window.PAWHUB_RELATIVE_TIME = {
    refreshIn: refreshIn,
    startTicker: startTicker,
    stopTicker: stopTicker,
    displayText: displayText,
  };
})();
