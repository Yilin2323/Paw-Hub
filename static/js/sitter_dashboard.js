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
    const joinedEl = document.getElementById("sitter-dash-joined-services");
    const myRatingEl = document.getElementById("sitter-dash-my-rating");

    if (joinedEl) {
      joinedEl.textContent = "0";
      animateCount(joinedEl, dash.joinedServices, 750, (n) =>
        String(Math.round(n))
      );
    }

    if (myRatingEl) {
      const rating = dash.myRating;
      if (rating == null || Number.isNaN(Number(rating))) {
        myRatingEl.textContent = "—";
      } else {
        const target = Number(rating);
        if (prefersReducedMotion()) {
          myRatingEl.textContent = `⭐ ${target.toFixed(1)}`;
        } else {
          myRatingEl.textContent = "⭐ 0.0";
          const start = performance.now();
          const dur = 700;
          function frame(now) {
            const t = Math.min((now - start) / dur, 1);
            const eased = 1 - Math.pow(1 - t, 3);
            myRatingEl.textContent = `⭐ ${(target * eased).toFixed(1)}`;
            if (t < 1) requestAnimationFrame(frame);
            else myRatingEl.textContent = `⭐ ${target.toFixed(1)}`;
          }
          requestAnimationFrame(frame);
        }
      }
    }
  }

  function animateBarHeights(container) {
    const fills = container.querySelectorAll(".dash-app-bar-fill");
    const reduced =
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    fills.forEach((el) => {
      const target = el.getAttribute("data-height") || "0%";
      if (reduced) {
        el.style.height = target;
      } else {
        el.style.height = "0%";
      }
    });

    if (reduced) return;

    requestAnimationFrame(() => {
      fills.forEach((el) => {
        el.style.height = el.getAttribute("data-height") || "0%";
      });
    });
  }

  function renderApplicationStatus(dash) {
    const container = document.getElementById("sitter-dash-application-status");
    if (!container) return;

    const pending = dash.applicationStatus.pending || 0;
    const approved = dash.applicationStatus.approved || 0;
    const rejected = dash.applicationStatus.rejected || 0;
    const total = pending + approved + rejected;

    if (total === 0) {
      container.innerHTML = `<p class="text-muted mb-0 small">No application data available.</p>`;
      return;
    }

    const maxVal = Math.max(pending, approved, rejected, 1);
    const pct = (n) => ((n / maxVal) * 100).toFixed(1);

    container.innerHTML = `
      <div
        class="dash-app-bar-chart"
        role="img"
        aria-label="Application status: ${pending} pending, ${approved} approved, ${rejected} rejected"
      >
        <div class="dash-app-bar-col">
          <div class="dash-app-bar-value">${pending}</div>
          <div class="dash-app-bar-track">
            <div
              class="dash-app-bar-fill dash-app-bar-fill--pending"
              style="height: 0%"
              data-height="${pct(pending)}%"
            ></div>
          </div>
          <div class="dash-app-bar-label">Pending</div>
        </div>
        <div class="dash-app-bar-col">
          <div class="dash-app-bar-value">${approved}</div>
          <div class="dash-app-bar-track">
            <div
              class="dash-app-bar-fill dash-app-bar-fill--approved"
              style="height: 0%"
              data-height="${pct(approved)}%"
            ></div>
          </div>
          <div class="dash-app-bar-label">Approved</div>
        </div>
        <div class="dash-app-bar-col">
          <div class="dash-app-bar-value">${rejected}</div>
          <div class="dash-app-bar-track">
            <div
              class="dash-app-bar-fill dash-app-bar-fill--rejected"
              style="height: 0%"
              data-height="${pct(rejected)}%"
            ></div>
          </div>
          <div class="dash-app-bar-label">Rejected</div>
        </div>
      </div>
    `;

    animateBarHeights(container);
  }

  function renderServiceCategoriesPie(dash) {
    const pieEl = document.getElementById("sitter-dash-service-pie");
    const legendEl = document.getElementById("sitter-dash-service-legend");

    if (!pieEl || !legendEl) return;

    const items = dash.serviceCategoriesJoined || [];
    const total = items.reduce((sum, item) => sum + item.value, 0);

    const shell = pieEl.closest(".dashboard-donut-shell");

    if (items.length === 0) {
      if (shell) {
        shell.classList.remove("dash-donut-shell--enter");
      }
      pieEl.style.background = "#e2e8f0";
      pieEl.setAttribute("aria-label", "No category data available.");
      legendEl.innerHTML = `<li class="text-muted small">No category data available.</li>`;
      return;
    }

    pieEl.setAttribute(
      "aria-label",
      "Service categories joined: " + items.map((i) => `${i.label} ${i.value}`).join(", ")
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

  function initSitterDashboard() {
    const dash = window.PAWHUB_SITTER_DASHBOARD;
    if (!dash) {
      console.error("PAWHUB_SITTER_DASHBOARD missing (server should inject before this script).");
      return;
    }

    renderSummaryCards(dash);
    renderApplicationStatus(dash);
    renderServiceCategoriesPie(dash);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initSitterDashboard);
  } else {
    initSitterDashboard();
  }
})();
