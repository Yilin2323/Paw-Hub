(function () {
  const SERVICE_DONUT_COLORS = [
    "#93c5fd",
    "#3b82f6",
    "#2563eb",
    "#1d4ed8",
    "#0e7490",
  ];

  function buildConicGradient(items) {
    const total = items.reduce((sum, item) => sum + item.value, 0);

    if (total <= 0) {
      return "conic-gradient(#e2e8f0 0deg 360deg)";
    }

    let currentAngle = 0;
    const stops = items.map((item, index) => {
      const sliceAngle = (item.value / total) * 360;
      const start = currentAngle;
      const end = currentAngle + sliceAngle;
      currentAngle = end;

      return `${SERVICE_DONUT_COLORS[index % SERVICE_DONUT_COLORS.length]} ${start}deg ${end}deg`;
    });

    return `conic-gradient(${stops.join(", ")})`;
  }

  function buildPartialConicGradient(items, progress) {
    const total = items.reduce((sum, item) => sum + item.value, 0);
    if (total <= 0) {
      return "conic-gradient(#e2e8f0 0deg 360deg)";
    }
    const t = Math.min(1, Math.max(0, progress));
    if (t <= 0) {
      return "conic-gradient(#e2e8f0 0deg 360deg)";
    }

    let currentAngle = 0;
    const stops = [];
    items.forEach((item, index) => {
      const sliceAngle = (item.value / total) * 360 * t;
      const start = currentAngle;
      const end = currentAngle + sliceAngle;
      currentAngle = end;
      stops.push(
        `${SERVICE_DONUT_COLORS[index % SERVICE_DONUT_COLORS.length]} ${start}deg ${end}deg`
      );
    });
    if (currentAngle < 359.98) {
      stops.push(`#e2e8f0 ${currentAngle}deg 360deg`);
    }
    return `conic-gradient(${stops.join(", ")})`;
  }

  function animateDonutGradient(pieEl, items, durationMs) {
    const start = performance.now();
    function frame(now) {
      const raw = Math.min((now - start) / durationMs, 1);
      const eased = 1 - Math.pow(1 - raw, 3);
      pieEl.style.background = buildPartialConicGradient(items, eased);
      if (raw < 1) {
        requestAnimationFrame(frame);
      } else {
        pieEl.style.background = buildConicGradient(items);
      }
    }
    pieEl.style.background = buildPartialConicGradient(items, 0);
    requestAnimationFrame(frame);
  }

  function prefersReducedMotion() {
    return (
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    );
  }

  function animateCount(el, endValue, durationMs, format) {
    if (!el) return;
    if (prefersReducedMotion()) {
      el.textContent = format(endValue);
      return;
    }
    const start = performance.now();
    function frame(now) {
      const t = Math.min((now - start) / durationMs, 1);
      const eased = 1 - Math.pow(1 - t, 3);
      el.textContent = format(endValue * eased);
      if (t < 1) requestAnimationFrame(frame);
      else el.textContent = format(endValue);
    }
    requestAnimationFrame(frame);
  }

  function renderSummaryCards(dash) {
    const usersEl = document.getElementById("admin-dash-total-users");
    const ownersEl = document.getElementById("admin-dash-total-owners");
    const sittersEl = document.getElementById("admin-dash-total-sitters");

    [usersEl, ownersEl, sittersEl].forEach((el) => {
      if (el) el.textContent = "0";
    });

    if (usersEl) {
      animateCount(usersEl, dash.totalUsers || 0, 750, (n) =>
        String(Math.round(n))
      );
    }
    if (ownersEl) {
      animateCount(ownersEl, dash.totalOwners || 0, 750, (n) =>
        String(Math.round(n))
      );
    }
    if (sittersEl) {
      animateCount(sittersEl, dash.totalSitters || 0, 750, (n) =>
        String(Math.round(n))
      );
    }
  }

  function renderServiceTypesPie(dash) {
    const pieEl = document.getElementById("admin-dash-service-pie");
    const legendEl = document.getElementById("admin-dash-service-legend");

    if (!pieEl || !legendEl) return;

    const items = dash.serviceTypes || [];
    const total = items.reduce((sum, item) => sum + item.value, 0);

    const shell = pieEl.closest(".dashboard-donut-shell");

    if (items.length === 0 || total === 0) {
      if (shell) {
        shell.classList.remove("dash-donut-shell--enter");
      }
      pieEl.style.background = "#e2e8f0";
      pieEl.setAttribute("aria-label", "No completed jobs by service type yet.");
      legendEl.innerHTML = `<li class="text-muted small">No completed jobs by service type yet.</li>`;
      return;
    }

    pieEl.setAttribute(
      "aria-label",
      "Completed jobs by service type: " +
        items.map((i) => `${i.label} ${i.value}`).join(", ")
    );

    if (shell) {
      shell.classList.remove("dash-donut-shell--enter");
      void shell.offsetWidth;
      shell.classList.add("dash-donut-shell--enter");
    }

    const reduced = prefersReducedMotion();
    if (reduced) {
      pieEl.style.background = buildConicGradient(items);
    } else {
      animateDonutGradient(pieEl, items, 950);
    }

    legendEl.innerHTML = "";

    items.forEach((item, index) => {
      const li = document.createElement("li");
      li.className =
        "dash-service-legend-row dash-service-legend-row--enter d-flex align-items-center justify-content-between gap-3 mb-2";
      if (!reduced) {
        li.style.setProperty("--legend-delay", `${120 + index * 72}ms`);
      }

      const left = document.createElement("span");
      left.className = "d-flex align-items-center gap-2 min-w-0";
      const dot = document.createElement("span");
      dot.className = "dash-legend-dot flex-shrink-0";
      dot.style.background = SERVICE_DONUT_COLORS[index % SERVICE_DONUT_COLORS.length];
      const label = document.createElement("span");
      label.className = "dash-legend-label text-truncate";
      label.textContent = item.label;
      left.appendChild(dot);
      left.appendChild(label);

      const count = document.createElement("span");
      count.className = "dash-legend-count flex-shrink-0";
      count.textContent = reduced ? String(item.value) : "0";

      li.appendChild(left);
      li.appendChild(count);
      legendEl.appendChild(li);

      if (!reduced) {
        const delay = 180 + index * 72;
        const endVal = item.value;
        window.setTimeout(() => {
          animateCount(count, endVal, 550, (n) => String(Math.round(n)));
        }, delay);
      }
    });
  }

  const ACTIVITY_KIND_META = {
    user: { label: "User", icon: "bi-person-plus", wrap: "user" },
    service: { label: "Service", icon: "bi-briefcase-fill", wrap: "service" },
    application: { label: "Application", icon: "bi-file-earmark-text-fill", wrap: "application" },
    notification: { label: "Notice", icon: "bi-bell-fill", wrap: "notification" },
    review: { label: "Review", icon: "bi-star-fill", wrap: "review" },
  };

  function activityMetaForRow(row) {
    const k = String(row.kind || "").toLowerCase();
    if (ACTIVITY_KIND_META[k]) return ACTIVITY_KIND_META[k];
    const s = (row.summary || "").toLowerCase();
    if (s.startsWith("user registered")) return ACTIVITY_KIND_META.user;
    if (s.startsWith("service listing")) return ACTIVITY_KIND_META.service;
    if (s.startsWith("application:")) return ACTIVITY_KIND_META.application;
    if (s.startsWith("review:")) return ACTIVITY_KIND_META.review;
    return ACTIVITY_KIND_META.notification;
  }

  function renderRecentActivity(dash) {
    const listEl = document.getElementById("admin-dash-recent-activity");
    if (!listEl) return;

    const rows = dash.recentActivity || [];
    if (rows.length === 0) {
      listEl.innerHTML =
        '<li class="admin-recent-activity__empty" role="status">' +
        '<span class="admin-recent-activity__empty-icon" aria-hidden="true"><i class="bi bi-inbox"></i></span>' +
        "<span>No activity recorded yet.</span></li>";
      return;
    }

    const reducedMotion = prefersReducedMotion();
    listEl.innerHTML = "";
    rows.forEach((row, index) => {
      const meta = activityMetaForRow(row);
      const li = document.createElement("li");
      li.className = "admin-recent-activity__item";
      li.setAttribute("role", "listitem");
      if (!reducedMotion) {
        li.style.setProperty("--ra-delay", String(40 + index * 70) + "ms");
      }

      const shell = document.createElement("div");
      shell.className = "admin-recent-activity__shell";

      const rail = document.createElement("div");
      rail.className =
        "admin-recent-activity__rail admin-recent-activity__rail--" + meta.wrap;
      const iconI = document.createElement("i");
      iconI.className = "bi " + meta.icon;
      iconI.setAttribute("aria-hidden", "true");
      rail.appendChild(iconI);

      const body = document.createElement("div");
      body.className = "admin-recent-activity__main min-w-0";

      const badge = document.createElement("span");
      badge.className =
        "admin-recent-activity__badge admin-recent-activity__badge--" + meta.wrap;
      badge.textContent = meta.label;

      const title = document.createElement("p");
      title.className = "admin-recent-activity__title mb-0";
      title.textContent = row.summary || "";

      const timeRow = document.createElement("div");
      timeRow.className = "admin-recent-activity__time-row";
      const clock = document.createElement("i");
      clock.className = "bi bi-clock admin-recent-activity__time-ic";
      clock.setAttribute("aria-hidden", "true");
      const time = document.createElement("time");
      time.className = "admin-recent-activity__time";
      time.textContent = row.timeLabel || "";
      timeRow.appendChild(clock);
      timeRow.appendChild(time);

      body.appendChild(badge);
      body.appendChild(title);
      body.appendChild(timeRow);

      shell.appendChild(rail);
      shell.appendChild(body);
      li.appendChild(shell);
      listEl.appendChild(li);
    });
  }

  function initAdminDashboard() {
    const dash = window.PAWHUB_ADMIN_DASHBOARD;
    if (!dash) {
      console.error(
        "PAWHUB_ADMIN_DASHBOARD missing (server should inject before this script)."
      );
      return;
    }

    renderSummaryCards(dash);
    renderServiceTypesPie(dash);
    renderRecentActivity(dash);

    // Keep "Recent activity" live without full page refresh.
    let lastActivitySignature = JSON.stringify(dash.recentActivity || []);
    window.setInterval(async function () {
      try {
        const res = await fetch("/api/admin/recent-activity", {
          method: "GET",
          credentials: "same-origin",
          headers: { Accept: "application/json" },
        });
        if (!res.ok) return;
        const data = await res.json();
        const nextRows = (data && data.recentActivity) || [];
        const nextSig = JSON.stringify(nextRows);
        if (nextSig === lastActivitySignature) return;
        lastActivitySignature = nextSig;
        renderRecentActivity({ recentActivity: nextRows });
      } catch (e) {
        // Silent fail; next interval retries.
      }
    }, 8000);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initAdminDashboard);
  } else {
    initAdminDashboard();
  }
})();
