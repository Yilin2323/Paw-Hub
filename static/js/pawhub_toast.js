/**
 * Paw Hub — modern toast notification system.
 *
 * Exposes window.PAWHUB_TOAST.show(message, type) for use by other scripts
 * (e.g. pawhub_socket.js for real-time notifications).
 *
 * On page load, reads #pawhub-flash-json and fires one toast per Flask flash
 * message so all server-side alerts appear as polished popups.
 */
(function () {
  var DURATION_MS = 5000;
  var MAX_VISIBLE = 4;

  var CONFIGS = {
    success: {
      icon: "bi-check-circle-fill",
      title: "Success",
      cls: "ph-toast--success",
    },
    danger: {
      icon: "bi-x-circle-fill",
      title: "Something went wrong",
      cls: "ph-toast--danger",
    },
    warning: {
      icon: "bi-exclamation-triangle-fill",
      title: "Heads up",
      cls: "ph-toast--warning",
    },
    info: {
      icon: "bi-info-circle-fill",
      title: "Info",
      cls: "ph-toast--info",
    },
  };

  /* Infer a friendlier title from the message text for common server events. */
  var TITLE_MAP = [
    [/service is live/i, "Service Posted!"],
    [/service.*posted|posted.*service/i, "Service Posted!"],
    [/application sent/i, "Application Sent!"],
    [/application.*approved|approved.*application/i, "Application Approved!"],
    [/application.*rejected|rejected.*application/i, "Application Rejected"],
    [/marked.*complet|complet.*mark/i, "Service Completed!"],
    [/email verified/i, "Email Verified!"],
    [/verified.*sign in/i, "Email Verified!"],
    [/password.*updated|updated.*password/i, "Password Updated!"],
    [/profile.*saved|saved.*profile/i, "Profile Saved!"],
    [/profile.*updated|updated.*profile/i, "Profile Updated!"],
    [/picture.*updated|updated.*picture/i, "Photo Updated!"],
    [/description.*updated|updated.*description/i, "Updated!"],
    [/review.*submitted|submitted.*review/i, "Review Submitted!"],
    [/code.*sent|sent.*code|verification code/i, "Code Sent!"],
    [/new.*code|resent|resend/i, "New Code Sent!"],
    [/approved.*sitter|sitter.*assigned/i, "Sitter Assigned!"],
    [/suspended/i, "Account Suspended"],
    [/unsuspended|restored/i, "Account Restored"],
    [/deleted|removed/i, "Removed"],
    [/signed in|already signed/i, "Already Signed In"],
    [/log.?out/i, "Signed Out"],
  ];

  function inferTitle(message, category) {
    for (var i = 0; i < TITLE_MAP.length; i++) {
      if (TITLE_MAP[i][0].test(message)) return TITLE_MAP[i][1];
    }
    return (CONFIGS[category] || CONFIGS.info).title;
  }

  function esc(s) {
    return String(s || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function normaliseType(raw) {
    if (!raw) return "info";
    var t = String(raw).toLowerCase().replace(/^profile_/, "");
    return CONFIGS[t] ? t : "info";
  }

  function trimOldToasts(stack) {
    var all = stack.querySelectorAll(".ph-toast");
    if (all.length > MAX_VISIBLE) {
      for (var i = 0; i < all.length - MAX_VISIBLE; i++) {
        dismissToast(all[i]);
      }
    }
  }

  function dismissToast(el) {
    if (!el || el.dataset.phDismissed) return;
    el.dataset.phDismissed = "1";
    el.classList.add("ph-toast--out");
    setTimeout(function () {
      try { el.remove(); } catch (e) {}
    }, 350);
  }

  function show(message, type, customTitle) {
    var stack = document.getElementById("ph-toast-stack");
    if (!stack) return;

    var t = normaliseType(type);
    var cfg = CONFIGS[t];
    var title = customTitle || inferTitle(message, t);

    var toast = document.createElement("div");
    toast.className = "ph-toast " + cfg.cls;
    toast.setAttribute("role", t === "danger" ? "alert" : "status");
    toast.setAttribute("aria-live", t === "danger" ? "assertive" : "polite");

    toast.innerHTML =
      '<div class="ph-toast__icon"><i class="bi ' + esc(cfg.icon) + '" aria-hidden="true"></i></div>' +
      '<div class="ph-toast__body">' +
        '<p class="ph-toast__title">' + esc(title) + "</p>" +
        '<p class="ph-toast__message">' + esc(message) + "</p>" +
      "</div>" +
      '<button class="ph-toast__close" aria-label="Dismiss">' +
        '<i class="bi bi-x-lg" aria-hidden="true"></i>' +
      "</button>" +
      '<div class="ph-toast__progress"><div class="ph-toast__bar"></div></div>';

    stack.appendChild(toast);
    trimOldToasts(stack);

    /* Animate progress bar then auto-dismiss. */
    var bar = toast.querySelector(".ph-toast__bar");
    if (bar) {
      bar.style.transitionDuration = DURATION_MS + "ms";
      requestAnimationFrame(function () {
        requestAnimationFrame(function () {
          bar.style.width = "0%";
        });
      });
    }

    var timer = setTimeout(function () { dismissToast(toast); }, DURATION_MS);

    toast.querySelector(".ph-toast__close").addEventListener("click", function () {
      clearTimeout(timer);
      dismissToast(toast);
    });
  }

  /* Fire flash messages from server on page load. */
  function fireServerFlash() {
    var el = document.getElementById("pawhub-flash-json");
    if (!el) return;
    var data;
    try { data = JSON.parse(el.textContent); } catch (e) { return; }
    if (!Array.isArray(data)) return;
    /* Stagger so multiple messages don't all appear at t=0. */
    data.forEach(function (pair, i) {
      setTimeout(function () {
        show(pair[1], pair[0]);
      }, i * 160);
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", fireServerFlash);
  } else {
    fireServerFlash();
  }

  window.PAWHUB_TOAST = { show: show };
})();
