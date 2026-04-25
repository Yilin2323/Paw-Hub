/**
 * Pet care tips (owner + sitter dashboards): reads server JSON and renders the
 * smart-tips card. Payload shape: { subtitle, tips[] } from care_tips_behavior.py.
 */
(function () {
  var MAX_TIPS = 2;

  function prefersReducedMotion() {
    return (
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    );
  }

  /**
   * @param {object|null} payload
   * @param {HTMLElement} listEl
   * @param {HTMLElement|null} subEl
   * @param {{ emptySubHint?: string }} [opts]
   */
  function renderCareTipsBlock(payload, listEl, subEl, opts) {
    opts = opts || {};
    var emptySubHint = opts.emptySubHint || "";

    listEl.textContent = "";
    if (subEl) subEl.textContent = "";

    if (!payload || !Array.isArray(payload.tips)) {
      if (subEl) subEl.textContent = "Tips could not be loaded.";
      var liErr = document.createElement("li");
      liErr.className = "text-muted small";
      liErr.textContent = "No tips available.";
      listEl.appendChild(liErr);
      return;
    }

    var tips = payload.tips.filter(Boolean).slice(0, MAX_TIPS);
    if (subEl && payload.subtitle) {
      subEl.textContent = payload.subtitle;
    }

    if (!tips.length) {
      if (subEl && !subEl.textContent && emptySubHint) {
        subEl.textContent = emptySubHint;
      }
      var liEmpty = document.createElement("li");
      liEmpty.className = "text-muted small";
      liEmpty.textContent = "No tips available yet.";
      listEl.appendChild(liEmpty);
      return;
    }

    var reduced = prefersReducedMotion();
    tips.forEach(function (text, i) {
      var li = document.createElement("li");
      li.className = "dash-smart-tips-item";
      if (!reduced) {
        li.style.setProperty("--tip-delay", String(60 + i * 75) + "ms");
      }
      li.setAttribute("role", "listitem");

      var icon = document.createElement("i");
      icon.className = "bi bi-check2-circle dash-smart-tips-item__icon";
      icon.setAttribute("aria-hidden", "true");

      var span = document.createElement("span");
      span.textContent = text;

      li.appendChild(icon);
      li.appendChild(span);
      listEl.appendChild(li);
    });
  }

  function initPetCareTips() {
    var ownerList = document.getElementById("pet-care-tips");
    if (ownerList && typeof window.PAWHUB_OWNER_CARE_TIPS !== "undefined") {
      renderCareTipsBlock(window.PAWHUB_OWNER_CARE_TIPS, ownerList, document.getElementById("dash-smart-tips-sub"), {
        emptySubHint: "We will surface ideas here as your activity grows.",
      });
    }

    var sitterList = document.getElementById("sitter-care-tips");
    if (sitterList && typeof window.PAWHUB_SITTER_CARE_TIPS !== "undefined") {
      renderCareTipsBlock(window.PAWHUB_SITTER_CARE_TIPS, sitterList, document.getElementById("sitter-dash-tips-sub"), {
        emptySubHint: "We will tailor guidance as you pick up jobs.",
      });
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initPetCareTips);
  } else {
    initPetCareTips();
  }
})();
