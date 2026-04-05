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

  function syncFilterPills() {
    var root = document.querySelector(".owner-applications-page");
    if (!root) return;
    var pills = root.querySelectorAll("#sitter-oa-filters .oa-pill");
    if (!pills.length) return;
    function sync() {
      var h = window.location.hash || "#sitter-applications-top";
      pills.forEach(function (a) {
        a.classList.toggle("is-active", a.getAttribute("href") === h);
      });
    }
    window.addEventListener("hashchange", sync);
    sync();
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
      typeof sitterApplications !== "undefined" && Array.isArray(sitterApplications)
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

    root.innerHTML = "";

    var seenPending = false,
      seenApproved = false,
      seenRejected = false;

    list.forEach(function (app) {
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

  function init() {
    if (typeof sitterApplications === "undefined") {
      console.error("mock_data.js must load before sitter_applications.js");
      return;
    }
    render();
    syncFilterPills();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
