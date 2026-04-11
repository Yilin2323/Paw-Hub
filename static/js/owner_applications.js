/**
 * Owner applications — data from window.PAWHUB_OWNER_APPLICATIONS (Flask / DB).
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
    var k = (status || "").toLowerCase();
    if (k === "approved") return "oa-badge oa-badge--approved";
    if (k === "rejected") return "oa-badge oa-badge--rejected";
    return "oa-badge oa-badge--pending";
  }

  function syncFilterPills() {
    var root = document.querySelector(".owner-applications-page");
    if (!root) return;
    var pills = root.querySelectorAll(".oa-filters__pills .oa-pill");
    if (!pills.length) return;
    function sync() {
      var h = window.location.hash || "#applications-top";
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
    var elP = document.getElementById("oa-stat-pending");
    var elA = document.getElementById("oa-stat-approved");
    var elR = document.getElementById("oa-stat-rejected");
    if (elP) elP.textContent = String(p);
    if (elA) elA.textContent = String(a);
    if (elR) elR.textContent = String(r);
  }

  function postForm(action) {
    var f = document.createElement("form");
    f.method = "post";
    f.action = action;
    document.body.appendChild(f);
    f.submit();
  }

  function render() {
    var root = document.getElementById("oa-cards-root");
    if (!root) return;

    var list =
      typeof window.PAWHUB_OWNER_APPLICATIONS !== "undefined" &&
      Array.isArray(window.PAWHUB_OWNER_APPLICATIONS)
        ? window.PAWHUB_OWNER_APPLICATIONS
        : [];

    var avatarUrl = (root.getAttribute("data-applicant-avatar") || "").trim();

    updateStats(list);

    if (!list.length) {
      root.innerHTML = "";
      var empty = document.createElement("div");
      empty.className = "col-12";
      empty.innerHTML =
        '<p class="oa-empty mb-0" role="status">No applications yet. Post a service to receive sitter applications.</p>';
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
        col.id = "applications-pending";
        seenPending = true;
      } else if (st === "approved" && !seenApproved) {
        col.id = "applications-approved";
        seenApproved = true;
      } else if (st === "rejected" && !seenRejected) {
        col.id = "applications-rejected";
        seenRejected = true;
      }

      var isPending = st === "pending";
      var isApproved = st === "approved";
      var phone = (app.phone || "").trim();
      var email = (app.email || "").trim();
      var ratingDisp =
        app.rating != null && !isNaN(Number(app.rating))
          ? "⭐ " + Number(app.rating).toFixed(1)
          : "—";

      var detailsHtml =
        '<dl class="oa-details">' +
        "<div><dt>Gender</dt><dd>" +
        esc(app.gender) +
        "</dd></div>" +
        "<div><dt>Experience</dt><dd>" +
        esc(app.experience) +
        "</dd></div>" +
        "<div><dt>Rating</dt><dd>" +
        esc(ratingDisp) +
        "</dd></div>" +
        '<div class="oa-detail-span"><dt>About</dt><dd>' +
        esc(app.description || "—") +
        "</dd></div>";

      if (isApproved) {
        if (phone)
          detailsHtml += "<div><dt>Phone</dt><dd>" + esc(phone) + "</dd></div>";
        if (email)
          detailsHtml +=
            '<div><dt>Email</dt><dd class="text-break">' + esc(email) + "</dd></div>";
      }
      detailsHtml += "</dl>";

      var actionsHtml = "";
      if (isPending) {
        var aid = encodeURIComponent(String(app.applicationId));
        actionsHtml =
          '<div class="oa-card__actions">' +
          '<button type="button" class="btn btn-primary btn-sm rounded-pill px-3 oa-btn--approve" data-approve-id="' +
          aid +
          '">Approve</button> ' +
          '<button type="button" class="btn btn-outline-danger btn-sm rounded-pill px-3 oa-btn--reject" data-reject-id="' +
          aid +
          '">Reject</button>' +
          "</div>";
      }

      var art = document.createElement("article");
      art.className = "oa-card oa-card--stretch";
      art.innerHTML =
        '<div class="oa-card__head">' +
        '<div class="oa-applicant">' +
        '<div class="oa-avatar-wrap">' +
        '<img src="' +
        esc(avatarUrl) +
        '" alt="" class="oa-avatar" width="52" height="52">' +
        "</div>" +
        "<div>" +
        '<h3 class="oa-name">' +
        esc(app.name) +
        "</h3>" +
        '<p class="oa-service">Applied for: <strong>' +
        esc(app.serviceType) +
        "</strong></p>" +
        "</div></div>" +
        '<span class="' +
        badgeClass(app.status) +
        '">' +
        esc(app.status) +
        "</span></div>" +
        detailsHtml +
        actionsHtml;

      if (isPending) {
        art.querySelector(".oa-btn--approve").addEventListener("click", function () {
          if (window.confirm("Approve this sitter for the job? Other applicants for this service will be rejected."))
            postForm("/owner/applications/" + app.applicationId + "/approve");
        });
        art.querySelector(".oa-btn--reject").addEventListener("click", function () {
          if (window.confirm("Reject this application?"))
            postForm("/owner/applications/" + app.applicationId + "/reject");
        });
      }

      col.appendChild(art);
      root.appendChild(col);
    });
  }

  function init() {
    render();
    syncFilterPills();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
