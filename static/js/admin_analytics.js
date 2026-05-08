/**
 * Admin analytics: stats, SVG line chart, lists from PAWHUB_ADMIN_ANALYTICS.
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

  function niceStep(maxValue) {
    var rough = Math.max(1, maxValue) / 4;
    var power = Math.pow(10, Math.floor(Math.log(rough) / Math.LN10));
    var ratio = rough / power;
    if (ratio <= 1) return power;
    if (ratio <= 2) return 2 * power;
    if (ratio <= 5) return 5 * power;
    return 10 * power;
  }

  function buildAreaPath(points, baseY) {
    if (!points.length) return "";
    var d = "M" + points[0].x + "," + baseY;
    points.forEach(function (pt) {
      d += " L" + pt.x + "," + pt.y;
    });
    d += " L" + points[points.length - 1].x + "," + baseY + " Z";
    return d;
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
    var rawMax = Math.max(1, Math.max.apply(null, svc.concat(app)));
    var step = niceStep(rawMax);
    var maxY = Math.max(step, Math.ceil(rawMax / step) * step);

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
    var tickValues = [];
    var tv;
    for (tv = 0; tv <= maxY; tv += step) {
      tickValues.push(tv);
    }
    if (tickValues[tickValues.length - 1] !== maxY) tickValues.push(maxY);

    for (var g = 0; g < tickValues.length; g++) {
      var tickVal = tickValues[g];
      var ty = yAt(tickVal);
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
      grid +=
        '<text class="admin-analytics-line-axis" x="' +
        (padL - 8) +
        '" y="' +
        (ty + 4) +
        '" text-anchor="end">' +
        tickVal +
        "</text>";
    }

    var ptsS = [];
    var ptsA = [];
    for (var i = 0; i < n; i++) {
      ptsS.push({ x: xAt(i), y: yAt(svc[i]), value: svc[i] });
      ptsA.push({ x: xAt(i), y: yAt(app[i]), value: app[i] });
    }

    var dS =
      "M" +
      ptsS
        .map(function (pt) {
          return pt.x + "," + pt.y;
        })
        .join(" L");
    var dA =
      "M" +
      ptsA
        .map(function (pt) {
          return pt.x + "," + pt.y;
        })
        .join(" L");
    var areaS = buildAreaPath(ptsS, yAt(0));
    var areaA = buildAreaPath(ptsA, yAt(0));

    var labels = "";
    var showEvery = n > 8 ? 2 : 1;
    for (var j = 0; j < n; j++) {
      if (j % showEvery !== 0 && j !== n - 1) continue;
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

    function buildPointMarkup(points, className, labelClass) {
      return points
        .map(function (pt, idx) {
          var markup =
            '<circle class="' +
            className +
            '" cx="' +
            pt.x +
            '" cy="' +
            pt.y +
            '" r="4"/>';
          if (n <= 6) {
            markup +=
              '<text class="' +
              labelClass +
              '" x="' +
              pt.x +
              '" y="' +
              (pt.y - 10) +
              '" text-anchor="middle">' +
              pt.value +
              "</text>";
          }
          return markup;
        })
        .join("");
    }

    container.innerHTML =
      '<svg class="admin-analytics-line-svg" viewBox="0 0 ' +
      W +
      " " +
      H +
      '" preserveAspectRatio="xMidYMid meet" aria-hidden="true">' +
      grid +
      '<path class="admin-analytics-line-area admin-analytics-line-area--services" d="' +
      areaS +
      '"/>' +
      '<path class="admin-analytics-line-area admin-analytics-line-area--applications" d="' +
      areaA +
      '"/>' +
      '<path d="' +
      dS +
      '" fill="none" stroke="#3b82f6" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>' +
      '<path d="' +
      dA +
      '" fill="none" stroke="#0d9488" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>' +
      buildPointMarkup(
        ptsS,
        "admin-analytics-line-point admin-analytics-line-point--services",
        "admin-analytics-line-value admin-analytics-line-value--services"
      ) +
      buildPointMarkup(
        ptsA,
        "admin-analytics-line-point admin-analytics-line-point--applications",
        "admin-analytics-line-value admin-analytics-line-value--applications"
      ) +
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
})();
