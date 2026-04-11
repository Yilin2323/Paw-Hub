/**
 * Admin analytics: stats, SVG line chart, lists, AI-style insights from PAWHUB_ADMIN_ANALYTICS.
 */
(function () {
  var data = window.PAWHUB_ADMIN_ANALYTICS;
  if (!data) return;

  var reducedMotion =
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function esc(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function setText(id, text) {
    var el = document.getElementById(id);
    if (el) el.textContent = text;
  }

  function renderLineChart(container, trend) {
    if (!container) return;
    if (!trend || !trend.length) {
      container.innerHTML =
        '<p class="text-muted small mb-0 px-1">No monthly buckets available yet.</p>';
      return;
    }

    var svc = trend.map(function (m) {
      return Number(m.services) || 0;
    });
    var app = trend.map(function (m) {
      return Number(m.applications) || 0;
    });
    var maxY = Math.max(1, Math.max.apply(null, svc.concat(app)) * 1.12);

    var W = 800;
    var H = 268;
    var padL = 46;
    var padR = 20;
    var padT = 18;
    var padB = 56;
    var gw = W - padL - padR;
    var gh = H - padT - padB;
    var n = trend.length;

    function xAt(i) {
      if (n <= 1) return padL + gw / 2;
      return padL + (gw * i) / (n - 1);
    }

    function yAt(v) {
      return padT + gh * (1 - v / maxY);
    }

    var grid = "";
    var ticks = [0, 0.25, 0.5, 0.75, 1];
    for (var g = 0; g < ticks.length; g++) {
      var ty = padT + gh * ticks[g];
      grid +=
        '<line class="admin-analytics-line-grid" x1="' +
        padL +
        '" y1="' +
        ty +
        '" x2="' +
        (W - padR) +
        '" y2="' +
        ty +
        '"/>';
      var val = Math.round(maxY * (1 - ticks[g]));
      grid +=
        '<text class="admin-analytics-line-axis" x="' +
        (padL - 8) +
        '" y="' +
        (ty + 4) +
        '" text-anchor="end">' +
        val +
        "</text>";
    }

    var ptsS = [];
    var ptsA = [];
    for (var i = 0; i < n; i++) {
      ptsS.push(xAt(i) + "," + yAt(svc[i]));
      ptsA.push(xAt(i) + "," + yAt(app[i]));
    }

    var dS = "M" + ptsS.join(" L");
    var dA = "M" + ptsA.join(" L");

    var labels = "";
    for (var j = 0; j < n; j++) {
      if (n > 8 && j % 2 !== 0) continue;
      var lab = trend[j].label || "";
      labels +=
        '<text class="admin-analytics-line-axis" x="' +
        xAt(j) +
        '" y="' +
        (H - 18) +
        '" text-anchor="middle">' +
        esc(lab) +
        "</text>";
    }

    container.innerHTML =
      '<svg class="admin-analytics-line-svg" viewBox="0 0 ' +
      W +
      " " +
      H +
      '" preserveAspectRatio="xMidYMid meet" aria-hidden="true">' +
      grid +
      '<path d="' +
      dS +
      '" fill="none" stroke="#3b82f6" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>' +
      '<path d="' +
      dA +
      '" fill="none" stroke="#0d9488" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>' +
      labels +
      "</svg>";
  }

  function renderLegend(legendEl) {
    if (!legendEl) return;
    legendEl.innerHTML =
      '<span class="d-inline-flex align-items-center gap-2 small text-muted">' +
      '<span class="dash-legend-dot" style="background:#3b82f6"></span>Services created</span>' +
      '<span class="d-inline-flex align-items-center gap-2 small text-muted">' +
      '<span class="dash-legend-dot" style="background:#0d9488"></span>Applications</span>';
  }

  function renderTopSitters(ol) {
    if (!ol) return;
    var rows = data.topSitters || [];
    if (!rows.length) {
      ol.innerHTML =
        '<li class="text-muted small py-2">Not enough reviews to rank sitters yet.</li>';
      return;
    }
    ol.innerHTML = rows
      .map(function (s, idx) {
        var r = idx + 1;
        var avg = s.avgRating != null ? Number(s.avgRating).toFixed(1) : "—";
        return (
          '<li class="aa-analytics-list-item d-flex align-items-center justify-content-between gap-2">' +
          '<span class="d-flex align-items-center gap-2 min-w-0">' +
          '<span class="aa-rank-badge flex-shrink-0">' +
          r +
          "</span>" +
          '<span class="fw-semibold text-truncate">' +
          esc(s.username) +
          "</span></span>" +
          '<span class="text-muted small flex-shrink-0">' +
          avg +
          " ★ (" +
          (s.reviewCount || 0) +
          ")</span></li>"
        );
      })
      .join("");
  }

  function renderLowestSitter(wrap) {
    if (!wrap) return;
    var s = data.lowestSitter;
    if (!s || s.avgRating == null) {
      wrap.innerHTML =
        '<p class="text-muted small mb-0">Not enough review data for a lowest performer yet.</p>';
      return;
    }
    var avg = Number(s.avgRating).toFixed(1);
    wrap.innerHTML =
      '<div class="aa-analytics-highlight-inner">' +
      '<div class="fw-semibold text-body">' +
      esc(s.username) +
      "</div>" +
      '<div class="small text-muted mt-1">Avg ' +
      avg +
      "/5 · " +
      (s.reviewCount || 0) +
      " review(s)</div></div>";
  }

  function renderPopularServices(ul) {
    if (!ul) return;
    var rows = data.popularServices || [];
    if (!rows.length) {
      ul.innerHTML =
        '<li class="text-muted small">No service listings yet.</li>';
      return;
    }
    var maxC = Math.max.apply(
      null,
      rows.map(function (r) {
        return r.count || 0;
      })
    );
    if (maxC <= 0) maxC = 1;
    ul.innerHTML = rows
      .map(function (r) {
        var pct = Math.round(((r.count || 0) / maxC) * 100);
        return (
          '<li class="mb-3">' +
          '<div class="d-flex justify-content-between small mb-1">' +
          '<span class="fw-medium">' +
          esc(r.serviceType) +
          "</span>" +
          '<span class="text-muted">' +
          (r.count || 0) +
          "</span></div>" +
          '<div class="aa-analytics-bar-track">' +
          '<div class="aa-analytics-bar-fill" style="width:' +
          (reducedMotion ? pct : 0) +
          '%"></div></div></li>'
        );
      })
      .join("");

    if (!reducedMotion) {
      window.requestAnimationFrame(function () {
        ul.querySelectorAll(".aa-analytics-bar-fill").forEach(function (bar, i) {
          var row = rows[i];
          var pct = Math.round(((row.count || 0) / maxC) * 100);
          window.setTimeout(function () {
            bar.style.width = pct + "%";
          }, 40 + i * 70);
        });
      });
    }
  }

  function renderAiInsights(listEl) {
    if (!listEl) return;
    var items = data.aiInsights || [];
    if (!items.length) {
      listEl.innerHTML = "";
      return;
    }
    listEl.innerHTML = items
      .map(function (text, i) {
        var delay = reducedMotion ? 0 : i * 90;
        var cls = reducedMotion
          ? "aa-ai-insight-item"
          : "aa-ai-insight-item aa-ai-insight-item--enter";
        return (
          '<li class="' +
          cls +
          '" style="--ai-delay:' +
          delay +
          'ms">' +
          '<div class="d-flex gap-2">' +
          '<span class="aa-ai-bullet flex-shrink-0"><i class="bi bi-lightbulb"></i></span>' +
          '<p class="aa-ai-text mb-0">' +
          esc(text) +
          "</p></div></li>"
        );
      })
      .join("");
  }

  setText("aa-total-services", String(data.totalServices != null ? data.totalServices : "—"));
  setText(
    "aa-total-applications",
    String(data.totalApplications != null ? data.totalApplications : "—")
  );
  setText(
    "aa-popular-service",
    data.popularServiceName != null ? data.popularServiceName : "—"
  );

  renderLineChart(document.getElementById("aa-line-chart"), data.monthlyTrend || []);
  renderLegend(document.getElementById("aa-line-legend"));
  renderTopSitters(document.getElementById("aa-top-sitters"));
  renderLowestSitter(document.getElementById("aa-lowest-sitter"));
  renderPopularServices(document.getElementById("aa-popular-services"));
  renderAiInsights(document.getElementById("aa-ai-insights"));
})();
