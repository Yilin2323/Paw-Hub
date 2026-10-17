/**
 * Admin analytics 
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

  function renderRegistrationChart(container, trend) {
    if (!container) return;
    if (!trend || !trend.length) {
      container.innerHTML = '<p class="text-muted small mb-0">No registration data available yet.</p>';
      return;
    }
    var counts = trend.map(function (month) { return Number(month.users) || 0; });
    var step = Math.max(1, niceStep(Math.max.apply(null, counts)));
    var maxY = Math.max(step, Math.ceil(Math.max.apply(null, counts) / step) * step);
    var width = Math.max(800, trend.length * 85 + 66);
    var height = 280, left = 46, top = 28, bottom = 224;
    var slot = (width - left - 20) / trend.length;
    var barWidth = Math.min(64, slot * 0.6);
    function yAt(value) { return bottom - (bottom - top) * value / maxY; }
    var markup = '';
    for (var tick = 0; tick <= maxY; tick += step) {
      var y = yAt(tick);
      markup += '<line class="admin-analytics-line-grid" x1="' + left + '" y1="' + y + '" x2="' + (width - 20) + '" y2="' + y + '"/>' +
        '<text class="admin-analytics-line-axis" x="' + (left - 8) + '" y="' + (y + 4) + '" text-anchor="end">' + tick + '</text>';
    }
    trend.forEach(function (month, index) {
      var x = left + slot * (index + 0.5);
      var value = counts[index];
      markup += '<rect x="' + (x - barWidth / 2) + '" y="' + yAt(value) + '" width="' + barWidth + '" height="' + (bottom - yAt(value)) + '" rx="4" fill="#3b82f6"><title>' + esc(month.label) + ': ' + value + ' new users</title></rect>' +
        '<text class="admin-analytics-line-value admin-analytics-line-value--services" x="' + x + '" y="' + (yAt(value) - 8) + '" text-anchor="middle">' + value + '</text>' +
        '<text class="admin-analytics-line-axis" x="' + x + '" y="254" text-anchor="middle">' + esc(month.label) + '</text>';
    });
    container.style.overflowX = 'auto';
    container.setAttribute('aria-label', 'Monthly user registrations. ' + trend.map(function (month, index) {
      return month.label + ': ' + counts[index] + ' new users';
    }).join('; '));
    container.innerHTML = '<svg class="admin-analytics-line-svg" style="min-width:' + width + 'px" viewBox="0 0 ' + width + ' ' + height + '" aria-hidden="true">' + markup + '</svg>';
  }

  function renderLegend(legendEl) {
    if (!legendEl) return;
    legendEl.innerHTML =
      '<span class="d-inline-flex align-items-center gap-2 small text-muted">' +
      '<span class="dash-legend-dot" style="background:#3b82f6"></span>New users registered</span>';
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

  renderRegistrationChart(document.getElementById("aa-registration-chart"), data.monthlyRegistrations || []);
  renderLegend(document.getElementById("aa-registration-legend"));
  renderTopSitters(document.getElementById("aa-top-sitters"));
  renderLowestSitter(document.getElementById("aa-lowest-sitter"));
  renderPopularServices(document.getElementById("aa-popular-services"));
})();
