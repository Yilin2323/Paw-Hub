/**
 * Sitter services — browse open DB-backed listings; your jobs from server partition.
 */
(function () {
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

  function postTo(url) {
    var f = document.createElement("form");
    f.method = "post";
    f.action = url;
    document.body.appendChild(f);
    f.submit();
  }

  function petMetaLine(item) {
    var n = Number(item.pets) || 1;
    var word = n === 1 ? "pet" : "pets";
    return item.petType + " · " + n + " " + word;
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

  function buildDetailsList(item) {
    var ul = document.createElement("ul");
    ul.className = "os-details os-details--grow";
    appendDetailRow(ul, "Date", item.date || "—");
    appendDetailRow(ul, "Time", item.time || "—");
    appendDetailRow(ul, "Location", item.location || "—");
    appendDetailRow(
      ul,
      "Salary",
      (item.salary || "—").replace(/\s+/g, " ").trim(),
      "os-details__v--salary"
    );
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
      uniqueSorted(list.map(function (x) { return x.petType; }))
    );
    buildRefinePillRow(
      "ss-service-type-pills",
      "All types",
      uniqueSorted(list.map(function (x) { return x.serviceType; }))
    );
    buildRefinePillRow(
      "ss-location-pills",
      "All locations",
      uniqueSorted(list.map(function (x) { return x.location; }))
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
      var meta = document.createElement("p");
      meta.className = "os-card__meta";
      meta.textContent = petMetaLine(item);
      left.appendChild(h3);
      left.appendChild(meta);
      var tag = document.createElement("span");
      tag.className = "os-tag os-tag--latest";
      tag.textContent = "Open";
      head.appendChild(left);
      head.appendChild(tag);
      art.appendChild(head);
      art.appendChild(buildDetailsList(item));
      var desc = document.createElement("p");
      desc.className = "os-card__desc";
      desc.textContent = item.description || "—";
      art.appendChild(desc);

      var actions = document.createElement("div");
      actions.className = "os-card__actions os-card__actions--end";
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "os-btn os-btn--primary";
      btn.textContent = "Apply";
      btn.addEventListener("click", function () {
        if (window.confirm("Send your application to the owner for this job?"))
          postTo("/sitter/services/" + item.id + "/apply");
      });
      actions.appendChild(btn);
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
      var meta = document.createElement("p");
      meta.className = "os-card__meta";
      meta.textContent = petMetaLine(item);
      left.appendChild(h3);
      left.appendChild(meta);
      var tag = document.createElement("span");
      tag.className = "os-tag os-tag--upcoming";
      tag.textContent = "Ongoing";
      head.appendChild(left);
      head.appendChild(tag);
      art.appendChild(head);
      art.appendChild(buildDetailsList(item));
      var desc = document.createElement("p");
      desc.className = "os-card__desc";
      desc.textContent = item.description || "—";
      art.appendChild(desc);
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
      var meta = document.createElement("p");
      meta.className = "os-card__meta";
      meta.textContent = petMetaLine(item);
      left.appendChild(h3);
      left.appendChild(meta);
      var tag = document.createElement("span");
      tag.className = "os-tag os-tag--done";
      tag.textContent = "Completed";
      head.appendChild(left);
      head.appendChild(tag);
      art.appendChild(head);
      art.appendChild(buildDetailsList(item));
      var desc = document.createElement("p");
      desc.className = "os-card__desc";
      desc.textContent = item.description || "—";
      art.appendChild(desc);

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
