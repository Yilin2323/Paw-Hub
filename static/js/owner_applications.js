/**
 * Owner applications — window.PAWHUB_OWNER_APPLICATIONS from Flask / DB.
 */
(function () {
  var currentFilter = "all";

  function esc(s) {
    if (s == null) return "";
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/"/g, "&quot;");
  }

  function escAttr(s) {
    if (s == null) return "";
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/"/g, "&quot;")
      .replace(/</g, "&lt;");
  }

  function reviewIsoFromLegacy(line) {
    if (!line || typeof line !== "string") return "";
    var m = String(line).trim().match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2})/);
    if (m) return m[1] + "T" + m[2] + "Z";
    return "";
  }

  /** Relative label + periodic refresh via data-ph-ts (window.PAWHUB_RELATIVE_TIME from pawhub_socket.js). */
  function oaLiveTimeHtml(className, iso, labelKl, legacyLine) {
    var useIso = (iso || "").trim();
    var label = (labelKl || "").trim();
    if (!useIso && legacyLine) {
      useIso = reviewIsoFromLegacy(legacyLine);
      if (!label) label = String(legacyLine).trim();
    }
    if (!useIso) {
      return legacyLine
        ? '<span class="' + esc(className) + '">' + esc(String(legacyLine).trim()) + "</span>"
        : "";
    }
    if (!label) label = legacyLine ? String(legacyLine).trim() : "";
    var disp =
      window.PAWHUB_RELATIVE_TIME && window.PAWHUB_RELATIVE_TIME.displayText
        ? window.PAWHUB_RELATIVE_TIME.displayText(useIso, label)
        : label;
    return (
      '<span class="' +
      esc(className) +
      ' oa-ph-ts" data-ph-ts="' +
      escAttr(useIso) +
      '" title="' +
      escAttr(label) +
      '">' +
      esc(disp) +
      "</span>"
    );
  }

  function badgeClass(status) {
    var k = (status || "").toLowerCase();
    if (k === "approved") return "oa-badge oa-badge--approved";
    if (k === "rejected") return "oa-badge oa-badge--rejected";
    return "oa-badge oa-badge--pending";
  }

  function serviceTypeIconBi(serviceType) {
    var t = (serviceType || "").toLowerCase();
    if (t.indexOf("dog walking") !== -1) return "bi-signpost-2";
    if (t.indexOf("pet sitting") !== -1) return "bi-house-heart";
    if (t.indexOf("day care") !== -1) return "bi-brightness-high";
    if (t.indexOf("taxi") !== -1) return "bi-truck";
    if (t.indexOf("training") !== -1) return "bi-mortarboard";
    return "bi-stars";
  }

  function hashToFilter() {
    var h = (window.location.hash || "").toLowerCase();
    if (h === "#applications-pending") return "pending";
    if (h === "#applications-approved") return "approved";
    if (h === "#applications-rejected") return "rejected";
    if (h === "#applications-top" || h === "" || h === "#") return "all";
    return null;
  }

  function setUrlHashForFilter(filter) {
    var map = {
      all: "#applications-top",
      pending: "#applications-pending",
      approved: "#applications-approved",
      rejected: "#applications-rejected",
    };
    var next = map[filter] || "#applications-top";
    if (window.location.hash !== next) {
      history.replaceState(null, "", next);
    }
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

  function applyFilterUI(filter) {
    var page = document.querySelector(".owner-applications-page");
    if (!page) return;

    page.querySelectorAll(".oa-pill[data-oa-filter]").forEach(function (btn) {
      btn.classList.toggle("is-active", btn.getAttribute("data-oa-filter") === filter);
    });

    page.querySelectorAll(".oa-stat--filter[data-oa-filter]").forEach(function (btn) {
      var f = btn.getAttribute("data-oa-filter");
      var on = filter !== "all" && f === filter;
      btn.classList.toggle("is-active-filter", on);
      btn.setAttribute("aria-pressed", on ? "true" : "false");
    });
  }

  function applyFilter(root, filter) {
    currentFilter = filter;
    var cols = root.querySelectorAll(".oa-card-col");
    var visible = 0;
    cols.forEach(function (col) {
      var st = col.getAttribute("data-oa-status") || "";
      var show = filter === "all" || st === filter;
      col.style.display = show ? "" : "none";
      if (show) visible++;
    });

    var emptyF = document.getElementById("oa-filter-empty");
    if (emptyF) {
      if (filter !== "all" && visible === 0) {
        var label =
          filter === "pending"
            ? "pending"
            : filter === "approved"
              ? "approved"
              : "rejected";
        emptyF.textContent = "No " + label + " applications right now.";
        emptyF.style.display = "";
        emptyF.hidden = false;
      } else {
        emptyF.style.display = "none";
        emptyF.hidden = true;
      }
    }

    applyFilterUI(filter);
    setUrlHashForFilter(filter);
  }

  function wireFilters(root) {
    var page = document.querySelector(".owner-applications-page");
    if (!page) return;

    function choose(f) {
      applyFilter(root, f);
    }

    page.querySelectorAll(".oa-pill[data-oa-filter]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        choose(btn.getAttribute("data-oa-filter") || "all");
      });
    });

    page.querySelectorAll(".oa-stat--filter[data-oa-filter]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        choose(btn.getAttribute("data-oa-filter") || "all");
      });
    });

    window.addEventListener("hashchange", function () {
      var f = hashToFilter();
      if (f) applyFilter(root, f);
    });
  }

  function postForm(action) {
    var f = document.createElement("form");
    f.method = "post";
    f.action = action;
    document.body.appendChild(f);
    f.submit();
  }

  function buildStarField() {
    var stars = "";
    for (var i = 1; i <= 5; i++) {
      stars +=
        '<button type="button" class="oa-star-btn" data-rating="' +
        i +
        '" aria-label="' +
        i +
        (i === 1 ? " star" : " stars") +
        '">' +
        '<i class="bi bi-star" aria-hidden="true"></i></button>';
    }
    return (
      '<div class="oa-star-field">' +
      '<input type="hidden" name="rating" class="oa-rating-hidden" value="" autocomplete="off">' +
      '<div class="oa-star-rating" role="radiogroup" aria-label="Your rating">' +
      stars +
      "</div>" +
      '<p class="oa-star-hint">Hover stars to preview, click to set your rating.</p>' +
      "</div>"
    );
  }

  function paintStars(container, upTo) {
    var buttons = container.querySelectorAll(".oa-star-btn");
    buttons.forEach(function (btn, idx) {
      var n = idx + 1;
      var on = n <= upTo;
      btn.classList.toggle("is-on", on);
      var icon = btn.querySelector("i");
      if (icon) {
        icon.className = on ? "bi bi-star-fill" : "bi bi-star";
      }
    });
  }

  function initStarRating(wrap) {
    var container = wrap.querySelector(".oa-star-rating");
    var hidden = wrap.querySelector(".oa-rating-hidden");
    if (!container || !hidden) return;

    var selected = parseInt(hidden.value, 10) || 0;

    container.addEventListener("mouseleave", function () {
      paintStars(container, selected);
    });

    container.querySelectorAll(".oa-star-btn").forEach(function (btn, idx) {
      var val = idx + 1;
      btn.addEventListener("mouseenter", function () {
        paintStars(container, val);
      });
      btn.addEventListener("click", function () {
        selected = val;
        hidden.value = String(val);
        paintStars(container, selected);
      });
    });

    paintStars(container, selected);
  }

  function render() {
    var root = document.getElementById("oa-cards-root");
    if (!root) return;

    var list =
      typeof window.PAWHUB_OWNER_APPLICATIONS !== "undefined" &&
      Array.isArray(window.PAWHUB_OWNER_APPLICATIONS)
        ? window.PAWHUB_OWNER_APPLICATIONS
        : [];

    var defaultAvatarUrl = (root.getAttribute("data-applicant-avatar") || "").trim();

    updateStats(list);

    root.innerHTML = "";

    var emptyFilter = document.createElement("div");
    emptyFilter.id = "oa-filter-empty";
    emptyFilter.className = "col-12 oa-empty oa-empty--filter";
    emptyFilter.setAttribute("role", "status");
    emptyFilter.style.display = "none";
    emptyFilter.hidden = true;
    root.appendChild(emptyFilter);

    if (!list.length) {
      var empty = document.createElement("div");
      empty.className = "col-12";
      empty.innerHTML =
        '<p class="oa-empty mb-0" role="status">No applications yet. Post a service to receive sitter applications.</p>';
      root.appendChild(empty);
      wireFilters(root);
      applyFilter(root, "all");
      if (window.PAWHUB_RELATIVE_TIME) {
        window.PAWHUB_RELATIVE_TIME.refreshIn(root);
        window.PAWHUB_RELATIVE_TIME.startTicker(30000);
      }
      return;
    }

    list.forEach(function (app) {
      var st = (app.status || "Pending").toLowerCase();
      var col = document.createElement("div");
      col.className = "col-xl-4 col-lg-6 oa-card-col";
      col.setAttribute("data-oa-status", st);

      var isPending = st === "pending";
      var isApproved = st === "approved";
      var avatarUrl = (app.avatarUrl || "").trim() || defaultAvatarUrl;
      var phone = (app.phone || "").trim();
      var phoneLocked = !!app.phoneLocked;
      var email = (app.email || "").trim();
      var avg = app.avgRating;
      var rc = Number(app.reviewCount) || 0;
      var reputationDisp =
        avg != null && !isNaN(Number(avg))
          ? "⭐ " + Number(avg).toFixed(1) + " avg · " + rc + " review" + (rc === 1 ? "" : "s")
          : "No reviews yet";

      var detailsHtml =
        '<dl class="oa-details">' +
        "<div><dt>Gender</dt><dd>" +
        esc(app.gender) +
        "</dd></div>" +
        "<div><dt>Age</dt><dd>" +
        esc(app.age != null && String(app.age).trim() !== "" ? String(app.age).trim() : "—") +
        "</dd></div>" +
        "<div><dt>Experience</dt><dd>" +
        esc(app.experience) +
        "</dd></div>" +
        "<div><dt>Sitter reputation</dt><dd>" +
        esc(reputationDisp) +
        "</dd></div>";

      if (phone)
        detailsHtml += "<div><dt>Phone</dt><dd>" + esc(phone) + "</dd></div>";
      else if (phoneLocked)
        detailsHtml +=
          "<div><dt>Phone</dt><dd>Hidden until you approve this sitter</dd></div>";
      if (email)
        detailsHtml +=
          '<div><dt>Email</dt><dd class="text-break">' + esc(email) + "</dd></div>";

      detailsHtml +=
        '<div class="oa-detail-span"><dt>About</dt><dd>' +
        esc(app.description || "—") +
        "</dd></div>";
      detailsHtml += "</dl>";

      var past = Array.isArray(app.pastReviews) ? app.pastReviews.slice(0, 3) : [];
      var pastHtml = "";
      if (past.length) {
        pastHtml +=
          '<div class="oa-past-reviews" role="region" aria-label="Recent reviews for this sitter">';
        pastHtml +=
          '<p class="oa-past-reviews__title">Recent feedback <span class="oa-past-reviews__cap">(up to 3)</span></p><ul class="oa-past-reviews__list">';
        past.forEach(function (pr) {
          var stars = "★".repeat(pr.rating || 0) + "☆".repeat(5 - (pr.rating || 0));
          var when = oaLiveTimeHtml(
            "oa-past-reviews__when",
            pr.createdAtIso,
            pr.createdAtLabelKl,
            pr.createdAt
          );
          pastHtml +=
            "<li><span class=\"oa-past-reviews__stars\">" +
            esc(stars) +
            '</span> <span class="oa-past-reviews__text">' +
            esc(pr.comment || "(No comment)") +
            "</span> " +
            when +
            "</li>";
        });
        pastHtml += "</ul></div>";
      }

      var svcSt = (app.serviceStatus || "").toLowerCase();
      var canMarkComplete =
        isApproved && (svcSt === "ongoing" || svcSt === "approved");
      var jobDone = isApproved && svcSt === "completed";

      var actionsHtml = "";
      if (isPending) {
        var aid = encodeURIComponent(String(app.applicationId));
        actionsHtml =
          '<div class="oa-card__actions oa-card__actions--pending">' +
          '<button type="button" class="btn btn-primary btn-sm rounded-pill px-3 oa-btn--approve" data-approve-id="' +
          aid +
          '">Approve</button> ' +
          '<button type="button" class="btn btn-outline-danger btn-sm rounded-pill px-3 oa-btn--reject" data-reject-id="' +
          aid +
          '">Reject</button>' +
          "</div>";
      } else if (canMarkComplete) {
        actionsHtml =
          '<div class="oa-card__actions oa-card__actions--complete">' +
          '<button type="button" class="oa-cta-pill oa-cta-pill--theme oa-btn--mark-complete">' +
          "Mark as complete</button>" +
          '<p class="oa-complete-hint">Use this when the booked visit is finished.</p>' +
          "</div>";
      } else if (jobDone) {
        if (app.reviewEligible) {
          if (app.hasReview) {
            var mr = Number(app.myReviewRating) || 0;
            var starStr = "★".repeat(mr) + "☆".repeat(5 - mr);
            actionsHtml =
              '<div class="oa-card__actions oa-card__actions--review-done">' +
              '<p class="oa-your-review-title">Your review</p>' +
              '<p class="oa-your-review-stars">' +
              esc(starStr) +
              " (" +
              esc(String(mr)) +
              "/5)</p>";
            if (app.myReviewComment) {
              actionsHtml +=
                '<blockquote class="oa-your-review-quote">' + esc(app.myReviewComment) + "</blockquote>";
            }
            if (app.myReviewAtIso || app.myReviewAt) {
              actionsHtml +=
                '<p class="oa-your-review-meta">' +
                oaLiveTimeHtml(
                  "oa-your-review-time",
                  app.myReviewAtIso,
                  app.myReviewAtLabelKl,
                  app.myReviewAt
                ) +
                "</p>";
            }
            actionsHtml += "</div>";
          } else {
            actionsHtml =
              '<div class="oa-card__actions oa-card__actions--review">' +
              '<div class="oa-review-reveal">' +
              '<button type="button" class="oa-cta-pill oa-cta-pill--green oa-btn--open-review">Rate &amp; review</button>' +
              "</div>" +
              '<div class="oa-review-form-panel" hidden>' +
              '<div class="oa-review-form-panel__inner">' +
              '<p class="oa-review-form-panel__title">Your review</p>' +
              '<form method="post" action="/owner/services/' +
              esc(String(app.serviceId)) +
              '/review" class="oa-review-form">' +
              '<label class="oa-review-form__label">Your rating</label>' +
              buildStarField() +
              '<label class="oa-review-form__label" for="oa-comment-' +
              esc(String(app.applicationId)) +
              '">Comment <span class="oa-label-opt">(optional)</span></label>' +
              '<textarea class="oa-review-form__textarea" id="oa-comment-' +
              esc(String(app.applicationId)) +
              '" name="review_comment" rows="3" maxlength="2000" placeholder="How did the visit go?"></textarea>' +
              '<div class="oa-review-form__actions">' +
              '<button type="submit" class="oa-cta-pill oa-cta-pill--green">Save review</button>' +
              "</div></form></div></div></div>";
          }
        } else {
          actionsHtml =
            '<div class="oa-card__actions oa-card__actions--done">' +
            '<p class="oa-done-note mb-0 small">' +
            '<i class="bi bi-check2-circle" aria-hidden="true"></i> ' +
            "Job completed." +
            "</p>" +
            "</div>";
        }
      }

      var nPets = Number(app.pets) || 1;
      var petWord = nPets === 1 ? "pet" : "pets";
      var svcIcon = serviceTypeIconBi(app.serviceType);
      var chipsHtml =
        '<div class="oa-card__chips">' +
        '<span class="oa-chip oa-chip--svc">' +
        '<i class="bi ' +
        svcIcon +
        ' oa-chip__icon" aria-hidden="true"></i>' +
        esc(app.serviceType) +
        "</span>";
      if (app.petType) {
        chipsHtml += '<span class="oa-chip">' + esc(app.petType) + "</span>";
      }
      chipsHtml +=
        '<span class="oa-chip oa-chip--soft">' +
        esc(String(nPets)) +
        " " +
        esc(petWord) +
        "</span></div>";

      var art = document.createElement("article");
      art.className = "oa-card oa-card--stretch oa-card--status-" + st;
      art.innerHTML =
        '<div class="oa-card__head">' +
        '<div class="oa-applicant">' +
        '<div class="oa-avatar-wrap">' +
        '<img src="' +
        esc(avatarUrl) +
        '" alt="" class="oa-avatar" width="52" height="52">' +
        "</div>" +
        "<div>" +
        '<div class="oa-sitter-title-row">' +
        '<h3 class="oa-name">' +
        esc(app.name) +
        "</h3>" +
        '<span class="oa-sitter-role">Sitter application</span></div>' +
        chipsHtml +
        "</div></div>" +
        '<span class="' +
        badgeClass(app.status) +
        '">' +
        esc(app.status) +
        "</span></div>" +
        '<div class="oa-card__body">' +
        detailsHtml +
        pastHtml +
        "</div>" +
        actionsHtml;

      if (isPending) {
        art.querySelector(".oa-btn--approve").addEventListener("click", function () {
          if (
            window.confirm(
              "Approve this sitter for the job? Other applicants for this service will be rejected."
            )
          )
            postForm("/owner/applications/" + app.applicationId + "/approve");
        });
        art.querySelector(".oa-btn--reject").addEventListener("click", function () {
          if (window.confirm("Reject this application?"))
            postForm("/owner/applications/" + app.applicationId + "/reject");
        });
      }

      var markBtn = art.querySelector(".oa-btn--mark-complete");
      if (markBtn) {
        markBtn.addEventListener("click", function () {
          if (
            window.confirm(
              "Mark this booking as complete? The sitter will no longer appear as active on this job."
            )
          )
            postForm("/owner/services/" + app.serviceId + "/complete");
        });
      }

      var openReviewBtn = art.querySelector(".oa-btn--open-review");
      var reviewReveal = art.querySelector(".oa-review-reveal");
      var reviewPanel = art.querySelector(".oa-review-form-panel");
      var reviewForm = art.querySelector("form.oa-review-form");
      if (openReviewBtn && reviewReveal && reviewPanel && reviewForm) {
        openReviewBtn.addEventListener("click", function () {
          reviewReveal.setAttribute("hidden", "");
          reviewPanel.removeAttribute("hidden");
          var starWrap = reviewForm.querySelector(".oa-star-field");
          if (starWrap && !starWrap.dataset.oaStarsInit) {
            initStarRating(starWrap);
            starWrap.dataset.oaStarsInit = "1";
          }
          var focusEl =
            reviewForm.querySelector(".oa-star-btn") || reviewForm.querySelector("textarea");
          if (focusEl) focusEl.focus();
        });
        reviewForm.addEventListener("submit", function (ev) {
          var hid = reviewForm.querySelector(".oa-rating-hidden");
          if (!hid || !hid.value) {
            ev.preventDefault();
            alert("Please choose a star rating (hover and click).");
          }
        });
      }

      col.appendChild(art);
      root.appendChild(col);
    });

    wireFilters(root);

    if (window.PAWHUB_RELATIVE_TIME) {
      window.PAWHUB_RELATIVE_TIME.refreshIn(root);
      window.PAWHUB_RELATIVE_TIME.startTicker(30000);
    }

    var fromHash = hashToFilter();
    if (fromHash) {
      applyFilter(root, fromHash);
    } else {
      applyFilter(root, "all");
    }
  }

  function init() {
    render();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
