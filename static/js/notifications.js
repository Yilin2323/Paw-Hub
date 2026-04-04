/**
 * Notifications page: filter pills, unread count, mark one / mark all as read.
 */
(function () {
  function initNotifications() {
    var root = document.querySelector(".owner-notifications-page");
    if (!root) return;

    var items = root.querySelectorAll(".nt-item");
    var pills = root.querySelectorAll("[data-nt-filter]");
    var countEl = document.getElementById("nt-unread-count");
    var markAllBtn = document.getElementById("nt-mark-all-read");

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

    /** Replace unread control with non-interactive read label. */
    function setTagRead(tag) {
      if (!tag || !tag.parentNode) return;
      var read = document.createElement("span");
      read.className = "nt-tag nt-tag--read";
      read.textContent = "Read";
      tag.parentNode.replaceChild(read, tag);
    }

    function markItemRead(item, skipRefilter) {
      if (!item || item.getAttribute("data-nt-state") !== "unread") return;
      item.classList.remove("nt-item--unread");
      item.setAttribute("data-nt-state", "read");
      var tag = item.querySelector("button.nt-tag--unread");
      if (tag) setTagRead(tag);
      syncCount();
      if (!skipRefilter) applyFilter(activeFilter());
    }

    pills.forEach(function (p) {
      p.addEventListener("click", function () {
        var f = p.getAttribute("data-nt-filter") || "all";
        setPillActive(f);
        applyFilter(f);
      });
    });

    root.addEventListener("click", function (e) {
      var t = e.target;
      if (!t || !t.closest) return;
      var btn = t.closest("button.nt-tag--unread");
      if (!btn || !root.contains(btn)) return;
      e.preventDefault();
      var item = btn.closest(".nt-item");
      markItemRead(item);
    });

    if (markAllBtn) {
      markAllBtn.addEventListener("click", function () {
        items.forEach(function (el) {
          markItemRead(el, true);
        });
        applyFilter(activeFilter());
      });
    }

    syncCount();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initNotifications);
  } else {
    initNotifications();
  }
})();
