/**
 * Real-time notifications (Socket.IO): join room user_<id>, listen for new_notification.
 * Server: app.py (Flask-SocketIO) + create_notification().
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

  function showToast(message, type) {
    var stack = document.getElementById("ph-toast-stack");
    if (!stack) return;
    var el = document.createElement("div");
    el.className =
      "alert alert-" +
      toastClass(type) +
      " shadow-sm mb-2 py-2 px-3 small mb-0 border-0";
    el.setAttribute("role", "status");
    el.textContent = message;
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
    showToast(data.message, data.type || data.notif_type || "info");
    bumpUnreadBadge();
    try {
      document.dispatchEvent(new CustomEvent("pawhub:new-notification", { detail: data }));
    } catch (e) {}
  });
})();
