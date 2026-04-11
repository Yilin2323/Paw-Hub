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

  function populateFilterOptions() {
    var list = getOpenListings();
    var petSel = document.getElementById("ss-filter-pet");
    var svcSel = document.getElementById("ss-filter-service");
    var locSel = document.getElementById("ss-filter-location");
    if (!petSel || !svcSel || !locSel) return;

    function fillSelect(select, labels, allLabel) {
      var cur = select.value;
      select.innerHTML = "";
      var opt0 = document.createElement("option");
      opt0.value = "";
      opt0.textContent = allLabel;
      select.appendChild(opt0);
      labels.forEach(function (label) {
        var opt = document.createElement("option");
        opt.value = label;
        opt.textContent = label;
        select.appendChild(opt);
      });
      if (Array.from(select.options).some(function (o) { return o.value === cur; }))
        select.value = cur;
    }

    fillSelect(petSel, uniqueSorted(list.map(function (x) { return x.petType; })), "All pet types");
    fillSelect(svcSel, uniqueSorted(list.map(function (x) { return x.serviceType; })), "All service types");
    fillSelect(locSel, uniqueSorted(list.map(function (x) { return x.location; })), "All locations");
  }

  function getFilterValues() {
    var petEl = document.getElementById("ss-filter-pet");
    var svcEl = document.getElementById("ss-filter-service");
    var locEl = document.getElementById("ss-filter-location");
    return {
      pet: (petEl && petEl.value) || "",
      svc: (svcEl && svcEl.value) || "",
      loc: (locEl && locEl.value) || "",
    };
  }

  function filterOpenList(list) {
    var fv = getFilterValues();
    return list.filter(function (item) {
      if (fv.pet && item.petType !== fv.pet) return false;
      if (fv.svc && item.serviceType !== fv.svc) return false;
      if (fv.loc && item.location !== fv.loc) return false;
      return true;
    });
  }

  function renderLatest(container) {
    if (!container) return;
    container.innerHTML = "";
    var open = filterOpenList(getOpenListings());
    if (!open.length) {
      container.appendChild(
        emptyPlaceholder("No open listings right now. Check back when owners post new jobs.")
      );
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
    var list = getPartition().upcoming || [];
    if (!list.length) {
      container.appendChild(
        emptyPlaceholder("No ongoing services yet. Apply from Latest post when a job is open.")
      );
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
    var list = getPartition().completed || [];
    if (!list.length) {
      container.appendChild(emptyPlaceholder("No completed services yet."));
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
    var pills = root.querySelectorAll("#sitter-services-top .os-filters__pills .os-pill");
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
    populateFilterOptions();
    renderLatest(document.getElementById("ss-latest-root"));
    renderUpcoming(document.getElementById("ss-upcoming-root"));
    renderCompleted(document.getElementById("ss-completed-root"));
  }

  function initSitterServices() {
    if (typeof window.PAWHUB_SITTER_SERVICE_PARTITION === "undefined") {
      console.error("PAWHUB_SITTER_SERVICE_PARTITION missing.");
      return;
    }
    ["ss-filter-pet", "ss-filter-service", "ss-filter-location"].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.addEventListener("change", refreshAll);
    });
    syncSitterPills();
    refreshAll();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initSitterServices);
  } else {
    initSitterServices();
  }
})();
