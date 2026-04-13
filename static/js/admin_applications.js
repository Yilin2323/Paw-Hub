/**
 * Admin applications: server-rendered table; filter rows; modal from PAWHUB_ADMIN_APPLICATIONS.
 */
(function () {
  var root = document.querySelector(".admin-applications-page");
  if (!root) return;

  var apps = window.PAWHUB_ADMIN_APPLICATIONS;
  if (!Array.isArray(apps)) apps = [];

  var rows = root.querySelectorAll("tr.aa-data-row");
  var countEl = document.getElementById("aa-count");
  var searchEl = document.getElementById("aa-search");
  var statusEl = document.getElementById("aa-filter-status");
  var typeEl = document.getElementById("aa-filter-type");
  var tableWrap = document.getElementById("aa-table-wrap");
  var emptyFilter = document.getElementById("aa-empty-filter");

  var modal = document.getElementById("aa-modal");
  var modalClose = document.getElementById("aa-modal-close");
  var modalBody = document.getElementById("aa-modal-body");

  function escHtml(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function findApp(id) {
    var s = String(id);
    for (var i = 0; i < apps.length; i++) {
      if (String(apps[i].id) === s) return apps[i];
    }
    return null;
  }

  function applyFilters() {
    if (!rows.length) return;
    var q = (searchEl && searchEl.value ? searchEl.value : "").trim().toLowerCase();
    var st = statusEl ? statusEl.value : "all";
    var tp = typeEl ? typeEl.value : "all";
    var visible = 0;
    for (var j = 0; j < rows.length; j++) {
      var tr = rows[j];
      var blob = (tr.getAttribute("data-aa-search") || "").toLowerCase();
      var rowSt = tr.getAttribute("data-aa-status") || "";
      var rowTp = tr.getAttribute("data-aa-type") || "";
      var matchQ = !q || blob.indexOf(q) !== -1;
      var matchSt = st === "all" || rowSt === st;
      var matchTp = tp === "all" || rowTp === tp;
      var show = matchQ && matchSt && matchTp;
      tr.classList.toggle("d-none", !show);
      if (show) visible += 1;
    }
    if (countEl) countEl.textContent = String(visible);
    if (emptyFilter && tableWrap) {
      emptyFilter.classList.toggle("d-none", visible !== 0);
      tableWrap.classList.toggle("d-none", visible === 0);
    }
  }

  function openModal(a) {
    if (!modal || !modalBody) return;
    var statusLabel = escHtml(a.status);
    var badgeClass = "au-badge--suspended";
    if (a.status === "Approved") {
      badgeClass = "au-badge--active";
      statusLabel = "Accepted";
    } else if (a.status === "Pending") {
      badgeClass = "aa-badge--pending";
    } else if (a.status === "Rejected") {
      statusLabel = "Rejected";
    }

    var warningHtml = "";
    if (a.isSuspicious) {
      warningHtml =
        '<div class="alert alert-danger d-flex align-items-center mb-4 py-2 px-3 small rounded-3" role="alert">' +
        '<i class="bi bi-exclamation-triangle-fill me-2 fs-5"></i>' +
        '<div><strong>Flag:</strong> Short or empty application message — review carefully.</div></div>';
    }

    var phone = escHtml(a.applicantPhone || "—");
    var loc = escHtml(a.location || "—");
    var sitterAcct = escHtml(a.sitterAccountName || "—");
    var oc = escHtml((a.ownerName || "?").charAt(0));
    var sc = escHtml((a.sitterName || "?").charAt(0));

    modalBody.innerHTML =
      warningHtml +
      '<div class="row mb-3"><div class="col-sm-4 fw-bold text-secondary small text-uppercase">App ID</div>' +
      '<div class="col-sm-8 font-monospace">' +
      escHtml(a.id) +
      "</div></div>" +
      '<div class="row mb-3"><div class="col-sm-4 fw-bold text-secondary small text-uppercase">Service</div>' +
      '<div class="col-sm-8 fw-medium">' +
      escHtml(a.serviceTitle) +
      "</div></div>" +
      '<div class="row mb-3"><div class="col-sm-4 fw-bold text-secondary small text-uppercase">Type</div>' +
      '<div class="col-sm-8">' +
      escHtml(a.serviceType) +
      "</div></div>" +
      '<div class="row mb-3"><div class="col-sm-4 fw-bold text-secondary small text-uppercase">Location</div>' +
      '<div class="col-sm-8">' +
      loc +
      "</div></div>" +
      '<div class="row mb-3"><div class="col-sm-4 fw-bold text-secondary small text-uppercase">Date</div>' +
      '<div class="col-sm-8">' +
      escHtml(a.date) +
      "</div></div>" +
      '<div class="row mb-4"><div class="col-sm-4 fw-bold text-secondary small text-uppercase">Status</div>' +
      '<div class="col-sm-8"><span class="au-badge ' +
      badgeClass +
      '">' +
      statusLabel +
      "</span></div></div><hr>" +
      '<div class="row mb-3 align-items-center"><div class="col-sm-4 fw-bold text-secondary small text-uppercase">Owner</div>' +
      '<div class="col-sm-8 d-flex align-items-center gap-2">' +
      '<span class="aa-avatar mini">' +
      oc +
      "</span> " +
      escHtml(a.ownerName) +
      "</div></div>" +
      '<div class="row mb-3 align-items-center"><div class="col-sm-4 fw-bold text-secondary small text-uppercase">Sitter (applicant)</div>' +
      '<div class="col-sm-8 d-flex align-items-center gap-2">' +
      '<span class="aa-avatar mini sitter">' +
      sc +
      "</span> " +
      escHtml(a.sitterName) +
      "</div></div>" +
      '<div class="row mb-4"><div class="col-sm-4 fw-bold text-secondary small text-uppercase">Sitter account</div>' +
      '<div class="col-sm-8">' +
      sitterAcct +
      "</div></div>" +
      '<div class="row mb-4"><div class="col-sm-4 fw-bold text-secondary small text-uppercase">Applicant phone</div>' +
      '<div class="col-sm-8">' +
      phone +
      "</div></div>" +
      '<div class="row mb-4"><div class="col-sm-4 fw-bold text-secondary small text-uppercase">Applicant age</div>' +
      '<div class="col-sm-8">' +
      (a.applicantAge != null && !isNaN(Number(a.applicantAge))
        ? escHtml(String(a.applicantAge))
        : "—") +
      "</div></div>" +
      '<div class="mb-2 mt-2 fw-bold text-secondary small text-uppercase">Message content</div>' +
      '<div class="p-3 bg-light border rounded-3 text-break aa-modal-message">' +
      escHtml(a.message || "No message provided.") +
      "</div>";

    modal.hidden = false;
    modal.setAttribute("aria-hidden", "false");
    modal.classList.add("show");
  }

  function closeModal() {
    if (!modal) return;
    modal.classList.remove("show");
    modal.setAttribute("aria-hidden", "true");
    window.setTimeout(function () {
      modal.hidden = true;
    }, 200);
  }

  if (rows.length) {
    if (searchEl) {
      searchEl.addEventListener("input", applyFilters);
    }
    if (statusEl) {
      statusEl.addEventListener("change", applyFilters);
    }
    if (typeEl) {
      typeEl.addEventListener("change", applyFilters);
    }

    root.querySelectorAll(".aa-view-btn").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var id = btn.getAttribute("data-aa-id");
        var row = findApp(id);
        if (row) openModal(row);
      });
    });

    root.querySelectorAll(".aa-delete-form").forEach(function (form) {
      form.addEventListener("submit", function (e) {
        if (
          !window.confirm(
            "Remove this application from the database? This cannot be undone."
          )
        ) {
          e.preventDefault();
        }
      });
    });
  }

  if (modalClose) modalClose.addEventListener("click", closeModal);
  if (modal) {
    modal.addEventListener("click", function (e) {
      if (e.target === modal) closeModal();
    });
  }

  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && modal && !modal.hidden) closeModal();
  });
})();
