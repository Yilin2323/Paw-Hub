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
  function removeCta(listEl) {
    var card = listEl.parentElement;
    if (!card) return;
    var existing = card.querySelector(".dash-smart-tips-cta");
    if (existing) existing.remove();
  }

  function renderCta(listEl, cta) {
    removeCta(listEl);
    listEl.classList.add("d-none");

    var wrap = document.createElement("div");
    wrap.className = "dash-smart-tips-cta";

    var icon = document.createElement("div");
    icon.className = "dash-smart-tips-cta__icon";
    icon.innerHTML = '<i class="bi bi-rocket-takeoff" aria-hidden="true"></i>';
    wrap.appendChild(icon);

    if (cta.title) {
      var h = document.createElement("p");
      h.className = "dash-smart-tips-cta__title";
      h.textContent = cta.title;
      wrap.appendChild(h);
    }
    if (cta.message) {
      var p = document.createElement("p");
      p.className = "dash-smart-tips-cta__message";
      p.textContent = cta.message;
      wrap.appendChild(p);
    }
    if (cta.actionHref && cta.actionText) {
      var a = document.createElement("a");
      a.className = "dash-smart-tips-cta__btn";
      a.href = cta.actionHref;
      a.textContent = cta.actionText;
      wrap.appendChild(a);
    }

    listEl.parentElement.appendChild(wrap);
  }

  function renderCareTipsBlock(payload, listEl, subEl, opts) {
    opts = opts || {};

    listEl.textContent = "";
    listEl.classList.remove("d-none");
    removeCta(listEl);
    if (subEl) subEl.textContent = "";

    if (!payload || !Array.isArray(payload.tips)) {
      var liErr = document.createElement("li");
      liErr.className = "text-muted small";
      liErr.textContent = "No tips available.";
      listEl.appendChild(liErr);
      return;
    }

    // New users (or guests) see an encouraging call-to-action instead of tips.
    if (payload.is_new && payload.cta) {
      renderCta(listEl, payload.cta);
      return;
    }

    var tips = payload.tips.filter(Boolean).slice(0, MAX_TIPS);

    if (!tips.length) {
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
      renderCareTipsBlock(window.PAWHUB_OWNER_CARE_TIPS, ownerList, null);
    }

    var sitterList = document.getElementById("sitter-care-tips");
    if (sitterList && typeof window.PAWHUB_SITTER_CARE_TIPS !== "undefined") {
      renderCareTipsBlock(window.PAWHUB_SITTER_CARE_TIPS, sitterList, null);
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initPetCareTips);
  } else {
    initPetCareTips();
  }
})();
