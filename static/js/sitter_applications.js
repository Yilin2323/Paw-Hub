/**
 * Sitter applications — same layout classes as owner applications; data from sitterApplications.
 */
(function () {
  function esc(s) {
    if (s == null) return "";
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/"/g, "&quot;");
  }

  function badgeClass(status) {
    const k = (status || "").toLowerCase();
    if (k === "approved") return "oa-badge oa-badge--approved";
    if (k === "rejected") return "oa-badge oa-badge--rejected";
    return "oa-badge oa-badge--pending";
  }

  function statusFilterFromHash() {
    var h = (window.location.hash || "").toLowerCase();
    if (h === "#sitter-applications-pending") return "pending";
    if (h === "#sitter-applications-approved") return "approved";
    if (h === "#sitter-applications-rejected") return "rejected";
    return "all";
  }

  function filterApplicationsByStatus(list, which) {
    if (which === "all") return list.slice();
    return list.filter(function (app) {
      return (app.status || "pending").toLowerCase() === which;
    });
  }

  function syncFilterPills() {
    var root = document.querySelector(".owner-applications-page");
    if (!root) return;
    var pills = root.querySelectorAll("#sitter-oa-filters .oa-pill");
    if (!pills.length) return;
    var h = window.location.hash || "#sitter-applications-top";
    pills.forEach(function (a) {
      a.classList.toggle("is-active", a.getAttribute("href") === h);
    });
  }

  function updateStats(list) {
    var p = 0,
      a = 0,
      r = 0;
    list.forEach(function (x) {
      var s = (x.status || "").toLowerCase();
      if (s === "pending") p++;
      else if (s === "approved") a++;
      else if (s === "rejected") r++;
    });
    var elP = document.getElementById("sa-stat-pending");
    var elA = document.getElementById("sa-stat-approved");
    var elR = document.getElementById("sa-stat-rejected");
    if (elP) elP.textContent = String(p);
    if (elA) elA.textContent = String(a);
    if (elR) elR.textContent = String(r);
  }

  function render() {
    var root = document.getElementById("sa-cards-root");
    if (!root) return;

    var list =
      typeof window.PAWHUB_SITTER_APPLICATIONS !== "undefined" &&
      Array.isArray(window.PAWHUB_SITTER_APPLICATIONS)
        ? window.PAWHUB_SITTER_APPLICATIONS
        : typeof sitterApplications !== "undefined" && Array.isArray(sitterApplications)
          ? sitterApplications
          : [];

    var avatarUrl = (root.getAttribute("data-owner-avatar") || "").trim();

    updateStats(list);

    if (!list.length) {
      root.innerHTML = "";
      var empty = document.createElement("div");
      empty.className = "col-12";
      empty.innerHTML = '<p class="oa-empty mb-0" role="status">No applications yet</p>';
      root.appendChild(empty);
      return;
    }

    var which = statusFilterFromHash();
    var displayList = filterApplicationsByStatus(list, which);

    root.innerHTML = "";

    if (!displayList.length) {
      var emptyF = document.createElement("div");
      emptyF.className = "col-12";
      var label =
        which === "pending"
          ? "pending"
          : which === "approved"
            ? "approved"
            : "rejected";
      emptyF.innerHTML =
        '<p class="oa-empty mb-0" role="status">No ' +
        esc(label) +
        " applications. Choose another status or <a href=\"#sitter-applications-top\">view all</a>.</p>";
      root.appendChild(emptyF);
      return;
    }

    var seenPending = false,
      seenApproved = false,
      seenRejected = false;

    displayList.forEach(function (app) {
      var st = (app.status || "Pending").toLowerCase();
      var col = document.createElement("div");
      col.className = "col-xl-4 col-lg-6 owner-anchor-target";
      if (st === "pending" && !seenPending) {
        col.id = "sitter-applications-pending";
        seenPending = true;
      } else if (st === "approved" && !seenApproved) {
        col.id = "sitter-applications-approved";
        seenApproved = true;
      } else if (st === "rejected" && !seenRejected) {
        col.id = "sitter-applications-rejected";
        seenRejected = true;
      }

      var phone = (app.ownerPhone || "").trim();
      var email = (app.ownerEmail || "").trim();
      var isApproved = st === "approved";

      var detailsHtml =
        "<dl class=\"oa-details\">" +
        "<div><dt>Pet type</dt><dd>" +
        esc(app.petType) +
        "</dd></div>" +
        "<div><dt>Date</dt><dd>" +
        esc(app.date) +
        "</dd></div>" +
        "<div><dt>Time</dt><dd>" +
        esc(app.time) +
        "</dd></div>" +
        "<div><dt>Location</dt><dd>" +
        esc(app.location) +
        "</dd></div>" +
        "<div><dt>Salary</dt><dd>" +
        esc((app.salary || "").replace(/\s+/g, " ").trim()) +
        "</dd></div>" +
        "<div><dt>Owner</dt><dd>" +
        esc(app.ownerName) +
        "</dd></div>";

      if (isApproved && phone) {
        detailsHtml += "<div><dt>Phone</dt><dd>" + esc(phone) + "</dd></div>";
      }
      if (isApproved && email) {
        detailsHtml +=
          "<div><dt>Email</dt><dd class=\"text-break\">" + esc(email) + "</dd></div>";
      }
      detailsHtml += "</dl>";

      var foot = "";
      if (st === "pending") {
        foot =
          '<p class="oa-footnote mb-0"><i class="bi bi-hourglass-split" aria-hidden="true"></i> Waiting for owner response</p>';
      } else if (st === "rejected") {
        foot =
          '<p class="oa-footnote mb-0"><i class="bi bi-info-circle" aria-hidden="true"></i> Application was not selected</p>';
      }

      col.innerHTML =
        '<article class="oa-card oa-card--stretch">' +
        '<div class="oa-card__head">' +
        '<div class="oa-applicant">' +
        '<div class="oa-avatar-wrap">' +
        '<img src="' +
        esc(avatarUrl) +
        '" alt="' +
        esc(app.ownerName || "Owner") +
        '" class="oa-avatar" width="52" height="52">' +
        "</div>" +
        "<div>" +
        '<h3 class="oa-name">' +
        esc(app.serviceType) +
        "</h3>" +
        '<p class="oa-service">Owner: <strong>' +
        esc(app.ownerName) +
        "</strong></p>" +
        "</div></div>" +
        '<span class="' +
        badgeClass(app.status) +
        '">' +
        esc(app.status) +
        "</span></div>" +
        detailsHtml +
        foot +
        "</article>";

      root.appendChild(col);
    });
  }

  function refreshView() {
    syncFilterPills();
    render();
  }

  function init() {
    window.addEventListener("hashchange", refreshView);
    refreshView();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
