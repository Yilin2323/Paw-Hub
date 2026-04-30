/**
 * Sitter services — browse open DB-backed listings; your jobs from server partition.
 */
(function () {
  var applyModalBodyOverflow = "";

  /** Matches services.service_type CHECK and owner_services filter — always show all five. */
  var SITTER_SERVICE_TYPES = [
    "Pet Sitting",
    "Pet Day Care",
    "Pet Taxi",
    "Pet Training",
    "Dog Walking",
  ];
  var PET_TYPES = ["Dog", "Cat", "Rabbit", "Bird"];
  var SERVICE_LOCATIONS = [
    "Petaling Jaya",
    "Bukit Bintang",
    "Bukit Jalil",
    "Puchong",
    "Cheras",
  ];

  function getPartition() {
    var p = window.PAWHUB_SITTER_SERVICE_PARTITION;
    if (p && typeof p === "object") {
      return {
        browse: p.browse || [],
        upcoming: p.upcoming || [],
        completed: p.completed || [],
      };
    }
    return { browse: [], upcoming: [], completed: [] };
  }

  /** Union of all lists so refine pills include types from assigned jobs too. */
  function getAllPartitionItems() {
    var p = getPartition();
    return (p.browse || []).concat(p.upcoming || []).concat(p.completed || []);
  }

  function getApplyDefaults() {
    var d = window.PAWHUB_SITTER_APPLY_DEFAULTS;
    if (d && typeof d === "object") {
      var ey = d.experienceYears;
      var n = typeof ey === "number" ? ey : parseInt(String(ey || "0"), 10) || 0;
      return {
        name: d.name || "",
        phone: d.phone || "",
        gender: d.gender === "Male" || d.gender === "Female" ? d.gender : "",
        experienceYears: Math.max(0, Math.min(10, n)),
      };
    }
    return { name: "", phone: "", gender: "", experienceYears: 0 };
  }

  function wordCount(text) {
    var s = String(text || "").trim();
    if (!s) return 0;
    return s.split(/\s+/).filter(Boolean).length;
  }

  function populateExperienceSelect(sel) {
    if (!sel || sel.options.length) return;
    var o0 = document.createElement("option");
    o0.value = "0";
    o0.textContent = "0 years";
    sel.appendChild(o0);
    var y;
    for (y = 1; y <= 10; y++) {
      var o = document.createElement("option");
      o.value = String(y);
      o.textContent = y + " year" + (y === 1 ? "" : "s");
      sel.appendChild(o);
    }
  }

  function openApplyModal(serviceId) {
    var overlay = document.getElementById("ss-apply-overlay");
    var form = document.getElementById("ss-apply-form");
    if (!overlay || !form) return;
    var d = getApplyDefaults();
    form.action = "/sitter/services/" + encodeURIComponent(String(serviceId)) + "/apply";
    var nameEl = document.getElementById("ss-apply-name");
    var phoneEl = document.getElementById("ss-apply-phone");
    var expSel = document.getElementById("ss-apply-exp");
    var gEl = document.getElementById("ss-apply-gender");
    var ageEl = document.getElementById("ss-apply-age");
    var ta = document.getElementById("ss-apply-desc");
    var hint = document.getElementById("ss-apply-word-hint");
    if (nameEl) nameEl.value = d.name;
    if (phoneEl) phoneEl.value = d.phone;
    if (expSel) expSel.value = String(d.experienceYears);
    if (gEl) gEl.value = d.gender || "";
    if (ageEl) ageEl.value = "";
    if (ta) ta.value = "";
    if (hint) hint.textContent = "0 / 100 words";
    applyModalBodyOverflow = document.body.style.overflow || "";
    document.body.style.overflow = "hidden";
    overlay.hidden = false;
    overlay.setAttribute("aria-hidden", "false");
    overlay.classList.add("show");
    window.requestAnimationFrame(function () {
      if (!nameEl || !nameEl.focus) return;
      try {
        nameEl.focus({ preventScroll: true });
      } catch (e) {
        nameEl.focus();
      }
    });
  }

  function closeApplyModal() {
    var overlay = document.getElementById("ss-apply-overlay");
    if (!overlay) return;
    document.body.style.overflow = applyModalBodyOverflow;
    overlay.classList.remove("show");
    overlay.setAttribute("aria-hidden", "true");
    window.setTimeout(function () {
      overlay.hidden = true;
    }, 200);
  }

  function wireApplyModal() {
    var overlay = document.getElementById("ss-apply-overlay");
    var form = document.getElementById("ss-apply-form");
    var closeBtn = document.getElementById("ss-apply-close");
    var cancelBtn = document.getElementById("ss-apply-cancel");
    var ta = document.getElementById("ss-apply-desc");
    var hint = document.getElementById("ss-apply-word-hint");
    var expSel = document.getElementById("ss-apply-exp");
    populateExperienceSelect(expSel);

    function syncWordHint() {
      if (!hint || !ta) return;
      var n = wordCount(ta.value);
      hint.textContent = n + " / 100 words";
      hint.classList.toggle("text-danger", n > 100);
    }

    if (ta) {
      ta.addEventListener("input", syncWordHint);
    }

    if (form) {
      form.addEventListener("submit", function (ev) {
        if (!ta) return;
        if (wordCount(ta.value) > 100) {
          ev.preventDefault();
          window.alert("Short description must be 100 words or fewer.");
        }
      });
    }

    if (closeBtn) closeBtn.addEventListener("click", closeApplyModal);
    if (cancelBtn) cancelBtn.addEventListener("click", closeApplyModal);
    if (overlay) {
      overlay.addEventListener("click", function (e) {
        if (e.target === overlay) closeApplyModal();
      });
    }
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && overlay && !overlay.hidden) closeApplyModal();
    });
  }

  function appendServiceCardPetChips(parent, item) {
    var row = document.createElement("div");
    row.className = "os-card__chips";
    var pet = document.createElement("span");
    pet.className = "os-card__chip";
    pet.textContent = item.petType || "Pet";
    var n = Number(item.pets) || 1;
    var word = n === 1 ? "pet" : "pets";
    var cnt = document.createElement("span");
    cnt.className = "os-card__chip os-card__chip--soft";
    cnt.textContent = n + " " + word;
    row.appendChild(pet);
    row.appendChild(cnt);
    parent.appendChild(row);
  }

  function appendDetailRow(ul, label, value, valueExtraClass) {
    var li = document.createElement("li");
    var k = document.createElement("span");
    k.className = "os-details__k";
    k.textContent = label;
    var v = document.createElement("span");
    v.className = "os-details__v" + (valueExtraClass ? " " + valueExtraClass : "");
    v.textContent = value;
    li.appendChild(k);
    li.appendChild(document.createTextNode(" "));
    li.appendChild(v);
    ul.appendChild(li);
  }

  function appendDescriptionRow(ul, item) {
    var li = document.createElement("li");
    li.className = "os-details__row os-details__row--desc";
    var k = document.createElement("span");
    k.className = "os-details__k";
    k.textContent = "Description";
    var v = document.createElement("span");
    v.className = "os-details__v os-details__v--desc";
    var t = (item.description || "").trim();
    v.textContent = t || "—";
    li.appendChild(k);
    li.appendChild(v);
    ul.appendChild(li);
  }

  /** Status badge with listing time stacked underneath (sitter cards only). */
  function appendCardStatusColumn(head, item, tagModifierClass, tagLabel) {
    var col = document.createElement("div");
    col.className = "os-card__status-col";
    var tag = document.createElement("span");
    tag.className = "os-tag " + tagModifierClass;
    tag.textContent = tagLabel;
    col.appendChild(tag);
    var pa = item.postedAt && String(item.postedAt).trim();
    if (pa && pa !== "—") {
      var postedEl = document.createElement("p");
      postedEl.className = "os-card__posted";
      postedEl.textContent = pa;
      col.appendChild(postedEl);
    }
    head.appendChild(col);
  }

  function buildDetailsList(item) {
    var ul = document.createElement("ul");
    ul.className = "os-details os-details--grow";
    if (item.ownerName && String(item.ownerName).trim()) {
      appendDetailRow(ul, "Posted by", String(item.ownerName).trim());
    }
    appendDetailRow(ul, "Date", item.date || "—");
    appendDetailRow(ul, "Time", item.time || "—");
    appendDetailRow(ul, "Location", item.location || "—");
    appendDetailRow(
      ul,
      "Salary",
      (item.salary || "—").replace(/\s+/g, " ").trim(),
      "os-details__v--salary"
    );
    appendDescriptionRow(ul, item);
    return ul;
  }

  function emptyPlaceholder(message) {
    var p = document.createElement("p");
    p.className = "os-empty";
    p.textContent = message;
    return p;
  }

  function uniqueSorted(values) {
    return Array.from(new Set(values.filter(Boolean))).sort(function (a, b) {
      return a.localeCompare(b);
    });
  }

  function getOpenListings() {
    return getPartition().browse || [];
  }

  function normStr(s) {
    return String(s == null ? "" : s).trim();
  }

  function readRefinePillValue(wrapId) {
    var wrap = document.getElementById(wrapId);
    if (!wrap) return "";
    var el = wrap.querySelector(".os-pill.is-active[data-ss-value]");
    if (!el) return "";
    var v = el.getAttribute("data-ss-value") || "";
    return v === "all" ? "" : normStr(v);
  }

  function getFilterValues() {
    return {
      pet: readRefinePillValue("ss-pet-pills"),
      svc: readRefinePillValue("ss-service-type-pills"),
      loc: readRefinePillValue("ss-location-pills"),
    };
  }

  function hasActiveRefine() {
    var fv = getFilterValues();
    return !!(fv.pet || fv.svc || fv.loc);
  }

  /** Same rules for browse, upcoming, and completed so pills affect the whole page. */
  function filterItemsByRefine(list) {
    var fv = getFilterValues();
    return list.filter(function (item) {
      if (fv.pet && normStr(item.petType) !== fv.pet) return false;
      if (fv.svc && normStr(item.serviceType) !== fv.svc) return false;
      if (fv.loc && normStr(item.location) !== fv.loc) return false;
      return true;
    });
  }

  function buildRefinePillRow(wrapId, allLabel, optionValues) {
    var wrap = document.getElementById(wrapId);
    if (!wrap) return;
    var cur = "all";
    var prev = wrap.querySelector(".os-pill.is-active[data-ss-value]");
    if (prev) cur = prev.getAttribute("data-ss-value") || "all";
    if (cur !== "all" && optionValues.indexOf(cur) === -1) cur = "all";

    wrap.innerHTML = "";
    function addPill(label, value) {
      var isOn = value === "all" ? cur === "all" || cur === "" : cur === value;
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "os-pill" + (isOn ? " is-active" : "");
      btn.setAttribute("data-ss-value", value);
      btn.textContent = label;
      btn.addEventListener("click", function () {
        wrap.querySelectorAll(".os-pill[data-ss-value]").forEach(function (b) {
          b.classList.remove("is-active");
        });
        btn.classList.add("is-active");
        refreshAll();
      });
      wrap.appendChild(btn);
    }
    addPill(allLabel, "all");
    optionValues.forEach(function (v) {
      addPill(v, v);
    });
  }

  function initSitterRefinePills() {
    var list = getAllPartitionItems();
    buildRefinePillRow(
      "ss-pet-pills",
      "All pet types",
      PET_TYPES
    );
    buildRefinePillRow(
      "ss-service-type-pills",
      "All types",
      SITTER_SERVICE_TYPES
    );
    buildRefinePillRow(
      "ss-location-pills",
      "All locations",
      SERVICE_LOCATIONS
    );
  }

  function renderLatest(container) {
    if (!container) return;
    container.innerHTML = "";
    var rawOpen = getOpenListings();
    var open = filterItemsByRefine(rawOpen);
    if (!open.length) {
      if (rawOpen.length && hasActiveRefine()) {
        container.appendChild(
          emptyPlaceholder("No open listings match your filters. Try All pet types or other options above.")
        );
      } else {
        container.appendChild(
          emptyPlaceholder("No open listings right now. Check back when owners post new jobs.")
        );
      }
      return;
    }
    open.forEach(function (item) {
      var art = document.createElement("article");
      art.className = "os-card os-card--stretch";
      art.dataset.serviceId = String(item.id);

      var head = document.createElement("div");
      head.className = "os-card__head";
      var left = document.createElement("div");
      var h3 = document.createElement("h3");
      h3.className = "os-card__title";
      h3.textContent = item.serviceType || "Service";
      left.appendChild(h3);
      appendServiceCardPetChips(left, item);
      head.appendChild(left);
      appendCardStatusColumn(head, item, "os-tag--latest", "Open");
      art.appendChild(head);
      art.appendChild(buildDetailsList(item));

      var actions = document.createElement("div");
      actions.className = "os-card__actions os-card__actions--end";
      if (item.alreadyApplied) {
        var done = document.createElement("button");
        done.type = "button";
        done.className = "os-btn os-btn--ghost";
        done.disabled = true;
        done.setAttribute("aria-disabled", "true");
        done.textContent = "Applied";
        actions.appendChild(done);
      } else {
        var btn = document.createElement("button");
        btn.type = "button";
        btn.className = "os-btn os-btn--primary";
        btn.textContent = "Apply";
        btn.addEventListener("click", function () {
          openApplyModal(item.id);
        });
        actions.appendChild(btn);
      }
      art.appendChild(actions);
      container.appendChild(art);
    });
  }

  function renderUpcoming(container) {
    if (!container) return;
    container.innerHTML = "";
    var raw = getPartition().upcoming || [];
    var list = filterItemsByRefine(raw);
    if (!list.length) {
      if (raw.length && hasActiveRefine()) {
        container.appendChild(
          emptyPlaceholder("No ongoing services match your filters. Adjust pet type, service, or location above.")
        );
      } else {
        container.appendChild(
          emptyPlaceholder("No ongoing services yet. Apply from Latest post when a job is open.")
        );
      }
      return;
    }
    list.forEach(function (item) {
      var art = document.createElement("article");
      art.className = "os-card os-card--stretch";
      art.dataset.serviceId = String(item.id);

      var head = document.createElement("div");
      head.className = "os-card__head";
      var left = document.createElement("div");
      var h3 = document.createElement("h3");
      h3.className = "os-card__title";
      h3.textContent = item.serviceType || "Service";
      left.appendChild(h3);
      appendServiceCardPetChips(left, item);
      head.appendChild(left);
      appendCardStatusColumn(head, item, "os-tag--upcoming", "Ongoing");
      art.appendChild(head);
      art.appendChild(buildDetailsList(item));
      var note = document.createElement("p");
      note.className = "os-card__desc os-card__desc--muted";
      note.textContent = "Waiting for the owner to mark this job complete.";
      art.appendChild(note);

      container.appendChild(art);
    });
  }

  function renderCompleted(container) {
    if (!container) return;
    container.innerHTML = "";
    var raw = getPartition().completed || [];
    var list = filterItemsByRefine(raw);
    if (!list.length) {
      if (raw.length && hasActiveRefine()) {
        container.appendChild(
          emptyPlaceholder("No completed services match your filters. Adjust the options above.")
        );
      } else {
        container.appendChild(emptyPlaceholder("No completed services yet."));
      }
      return;
    }
    list.forEach(function (item) {
      var art = document.createElement("article");
      art.className = "os-card os-card--stretch";
      art.dataset.serviceId = String(item.id);

      var head = document.createElement("div");
      head.className = "os-card__head";
      var left = document.createElement("div");
      var h3 = document.createElement("h3");
      h3.className = "os-card__title";
      h3.textContent = item.serviceType || "Service";
      left.appendChild(h3);
      appendServiceCardPetChips(left, item);
      head.appendChild(left);
      appendCardStatusColumn(head, item, "os-tag--done", "Completed");
      art.appendChild(head);
      art.appendChild(buildDetailsList(item));

      container.appendChild(art);
    });
  }

  function syncSitterPills() {
    var root = document.querySelector(".owner-services-page");
    if (!root) return;
    var pills = root.querySelectorAll(".os-filters__row--category .os-filters__pills a.os-pill");
    if (!pills.length) return;
    function sync() {
      var h = window.location.hash || "#sitter-services-top";
      pills.forEach(function (a) {
        a.classList.toggle("is-active", a.getAttribute("href") === h);
      });
    }
    window.addEventListener("hashchange", sync);
    sync();
  }

  function refreshAll() {
    renderLatest(document.getElementById("ss-latest-root"));
    renderUpcoming(document.getElementById("ss-upcoming-root"));
    renderCompleted(document.getElementById("ss-completed-root"));
  }

  function initSitterServices() {
    if (typeof window.PAWHUB_SITTER_SERVICE_PARTITION === "undefined") {
      console.error("PAWHUB_SITTER_SERVICE_PARTITION missing.");
      return;
    }
    if (typeof window.PAWHUB_SITTER_APPLY_DEFAULTS === "undefined") {
      window.PAWHUB_SITTER_APPLY_DEFAULTS = {};
    }
    wireApplyModal();
    initSitterRefinePills();
    syncSitterPills();
    refreshAll();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initSitterServices);
  } else {
    initSitterServices();
  }
})();
