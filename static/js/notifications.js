/**
 * Notifications page: filter pills and unread count (mark read via form POST).
 */
(function () {
  function initNotifications() {
    var root = document.querySelector(".owner-notifications-page");
    if (!root) return;

    var items = root.querySelectorAll(".nt-item");
    var pills = root.querySelectorAll("[data-nt-filter]");
    var countEl = document.getElementById("nt-unread-count");

    function unreadCount() {
      var n = 0;
      items.forEach(function (el) {
        if (el.getAttribute("data-nt-state") === "unread") n += 1;
      });
      return n;
    }

    function syncCount() {
      var n = unreadCount();
      if (countEl) countEl.textContent = String(n);
      var chip = document.getElementById("nt-unread-chip");
      if (chip) chip.style.display = n === 0 ? "none" : "";
    }

    function activeFilter() {
      var p = root.querySelector(".nt-pill.is-active[data-nt-filter]");
      return p ? p.getAttribute("data-nt-filter") : "all";
    }

    function applyFilter(filter) {
      items.forEach(function (el) {
        var st = el.getAttribute("data-nt-state") || "";
        var show = filter === "all" || st === filter;
        el.classList.toggle("d-none", !show);
      });
    }

    function setPillActive(filter) {
      pills.forEach(function (p) {
        p.classList.toggle("is-active", p.getAttribute("data-nt-filter") === filter);
      });
    }

    pills.forEach(function (p) {
      p.addEventListener("click", function () {
        var f = p.getAttribute("data-nt-filter") || "all";
        setPillActive(f);
        applyFilter(f);
      });
    });

    syncCount();
    applyFilter(activeFilter());
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initNotifications);
  } else {
    initNotifications();
  }
})();
