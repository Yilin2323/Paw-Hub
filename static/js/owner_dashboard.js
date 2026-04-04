/**
 * Owner dashboard: bind mock_data.js globals (user, dashboard) to DOM.
 */
(function () {
  const PIE_COLORS = ["#3b82f6", "#06b6d4", "#8b5cf6", "#10b981", "#f59e0b"];

  function buildConicGradient(items) {
    const total = items.reduce((sum, item) => sum + item.value, 0);
    if (total <= 0) {
      return "conic-gradient(#e2e8f0 0% 100%)";
    }
    let angle = 0;
    const stops = items.map((item, i) => {
      const slice = (item.value / total) * 360;
      const start = angle;
      angle += slice;
      const color = PIE_COLORS[i % PIE_COLORS.length];
      return `${color} ${start}deg ${angle}deg`;
    });
    return `conic-gradient(${stops.join(", ")})`;
  }

  function renderApplicationStatus(container, status) {
    const pending = status.pending || 0;
    const approved = status.approved || 0;
    const rejected = status.rejected || 0;
    const total = pending + approved + rejected;
    container.innerHTML = "";

    if (total === 0) {
      container.innerHTML =
        '<p class="text-muted small mb-0">No application data yet.</p>';
      return;
    }

    const pct = (n) => ((n / total) * 100).toFixed(1);

    const wrap = document.createElement("div");
    wrap.className = "dashboard-app-bars";

    const barRow = document.createElement("div");
    barRow.className = "progress dashboard-stacked-progress mb-3";
    barRow.setAttribute("role", "progressbar");
    barRow.setAttribute("aria-valuenow", String(total));
    barRow.setAttribute("aria-valuemin", "0");
    barRow.setAttribute("aria-valuemax", String(total));
    barRow.setAttribute(
      "aria-label",
      `Applications: ${pending} pending, ${approved} approved, ${rejected} rejected`
    );

    if (pending > 0) {
      const seg = document.createElement("div");
      seg.className = "progress-bar bg-warning text-dark";
      seg.style.width = pct(pending) + "%";
      seg.title = `Pending: ${pending}`;
      barRow.appendChild(seg);
    }
    if (approved > 0) {
      const seg = document.createElement("div");
      seg.className = "progress-bar bg-success";
      seg.style.width = pct(approved) + "%";
      seg.title = `Approved: ${approved}`;
      barRow.appendChild(seg);
    }
    if (rejected > 0) {
      const seg = document.createElement("div");
      seg.className = "progress-bar bg-danger";
      seg.style.width = pct(rejected) + "%";
      seg.title = `Rejected: ${rejected}`;
      barRow.appendChild(seg);
    }

    wrap.appendChild(barRow);

    const legend = document.createElement("ul");
    legend.className = "list-unstyled small mb-0 dashboard-app-legend";
    legend.innerHTML = `
      <li class="d-flex align-items-center gap-2 mb-1">
        <span class="dashboard-legend-swatch bg-warning"></span>
        <span><strong>Pending</strong> — ${pending} (${pct(pending)}%)</span>
      </li>
      <li class="d-flex align-items-center gap-2 mb-1">
        <span class="dashboard-legend-swatch bg-success"></span>
        <span><strong>Approved</strong> — ${approved} (${pct(approved)}%)</span>
      </li>
      <li class="d-flex align-items-center gap-2">
        <span class="dashboard-legend-swatch bg-danger"></span>
        <span><strong>Rejected</strong> — ${rejected} (${pct(rejected)}%)</span>
      </li>
    `;
    wrap.appendChild(legend);
    container.appendChild(wrap);
  }

  function renderServicePie(pieEl, legendEl, items) {
    const total = items.reduce((sum, item) => sum + item.value, 0);
    pieEl.style.background = buildConicGradient(items);
    pieEl.setAttribute(
      "aria-label",
      "Service types: " +
        items.map((i) => `${i.label} ${i.value}`).join(", ")
    );

    legendEl.innerHTML = "";
    items.forEach((item, i) => {
      const pct =
        total > 0 ? ((item.value / total) * 100).toFixed(1) + "%" : "0%";
      const li = document.createElement("li");
      li.className = "d-flex align-items-center gap-2 mb-2";
      const dot = document.createElement("span");
      dot.className = "dashboard-legend-swatch dashboard-legend-swatch--pie";
      dot.style.background = PIE_COLORS[i % PIE_COLORS.length];
      li.appendChild(dot);
      const text = document.createElement("span");
      text.innerHTML = `<strong>${item.label}</strong> — ${item.value} <span class="text-muted">(${pct})</span>`;
      li.appendChild(text);
      legendEl.appendChild(li);
    });
  }

  function init() {
    if (typeof dashboard === "undefined" || typeof user === "undefined") {
      return;
    }

    const totalEl = document.getElementById("dash-total-services");
    const ratingEl = document.getElementById("dash-my-rating");
    const appEl = document.getElementById("dash-application-status");
    const pieEl = document.getElementById("dash-service-pie");
    const legendEl = document.getElementById("dash-service-legend");

    if (totalEl) {
      totalEl.textContent = String(dashboard.totalServices);
    }
    if (ratingEl) {
      ratingEl.innerHTML =
        "⭐ " + Number(user.my_rating).toFixed(1);
    }
    if (appEl && dashboard.applicationStatus) {
      renderApplicationStatus(appEl, dashboard.applicationStatus);
    }
    if (pieEl && legendEl && dashboard.serviceTypes) {
      renderServicePie(pieEl, legendEl, dashboard.serviceTypes);
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
