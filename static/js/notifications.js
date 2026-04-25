/**
 * Notifications page: filter pills and unread count (mark read via form POST).
 * Live rows: listens for pawhub:new-notification (from pawhub_socket.js).
 */
(function () {
  function initNotifications() {
    var root = document.querySelector(".owner-notifications-page");
    if (!root) return;

    var list = document.getElementById("nt-list");
    var pills = root.querySelectorAll("[data-nt-filter]");
    var countEl = document.getElementById("nt-unread-count");

    function allItems() {
      return root.querySelectorAll(".nt-item");
    }

    function unreadCount() {
      var n = 0;
      allItems().forEach(function (el) {
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
      allItems().forEach(function (el) {
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

    document.addEventListener("pawhub:new-notification", function (ev) {
      var d = ev.detail;
      if (!list || !d) return;
      var placeholder = list.querySelector("p.text-muted");
      if (placeholder) placeholder.remove();

      var art = document.createElement("article");
      art.className = "nt-item nt-item--unread";
      art.setAttribute("data-nt-state", "unread");
      art.setAttribute("role", "listitem");
      var t = (d.notif_type || d.type || "info").toLowerCase();
      var iconWrap = document.createElement("div");
      iconWrap.className = "nt-item__icon nt-item__icon--application";
      iconWrap.setAttribute("aria-hidden", "true");
      var ic = document.createElement("i");
      ic.className = t === "success" ? "bi bi-check-circle-fill" : t === "warning" ? "bi bi-calendar-event-fill" : "bi bi-bell-fill";
      if (t === "success") iconWrap.classList.add("nt-item__icon--success");
      if (t === "warning") iconWrap.classList.add("nt-item__icon--reminder");
      iconWrap.appendChild(ic);

      var body = document.createElement("div");
      body.className = "nt-item__body";
      var h = document.createElement("h2");
      h.className = "nt-item__title";
      h.textContent = (t.charAt(0).toUpperCase() + t.slice(1)) + " update";
      var p = document.createElement("p");
      p.className = "nt-item__text";
      p.textContent = d.message || "";
      var time = document.createElement("time");
      time.className = "nt-item__time";
      time.textContent = d.created_at || "";
      body.appendChild(h);
      body.appendChild(p);
      body.appendChild(time);

      var aside = document.createElement("div");
      aside.className = "nt-item__aside";
      var form = document.createElement("form");
      form.method = "post";
      form.className = "d-inline";
      form.action = "/notifications/" + d.notification_id + "/read";
      var btn = document.createElement("button");
      btn.type = "submit";
      btn.className = "nt-tag nt-tag--unread";
      btn.textContent = "Unread";
      form.appendChild(btn);
      aside.appendChild(form);

      art.appendChild(iconWrap);
      art.appendChild(body);
      art.appendChild(aside);
      list.insertBefore(art, list.firstChild);

      syncCount();
      applyFilter(activeFilter());
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initNotifications);
  } else {
    initNotifications();
  }
})();
