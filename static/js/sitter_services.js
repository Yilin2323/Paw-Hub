/**
 * Sitter services — same 3 sections as owner; shared PawHubServiceListings.
 * Latest: open listings → Apply. After apply → in_progress → sitter sees Upcoming.
 * Completed: shown after owner marks complete, only if sitterApplied.
 */
(function () {
  function petMetaLine(item) {
    const n = Number(item.pets) || 1;
    const word = n === 1 ? "pet" : "pets";
    return `${item.petType} · ${n} ${word}`;
  }

  function appendDetailRow(ul, label, value, valueExtraClass) {
    const li = document.createElement("li");
    const k = document.createElement("span");
    k.className = "os-details__k";
    k.textContent = label;
    const v = document.createElement("span");
    v.className = "os-details__v" + (valueExtraClass ? ` ${valueExtraClass}` : "");
    v.textContent = value;
    li.appendChild(k);
    li.appendChild(document.createTextNode(" "));
    li.appendChild(v);
    ul.appendChild(li);
  }

  function buildDetailsList(item) {
    const ul = document.createElement("ul");
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
    const p = document.createElement("p");
    p.className = "os-empty";
    p.textContent = message;
    return p;
  }

  function uniqueSorted(values) {
    return [...new Set(values.filter(Boolean))].sort((a, b) => a.localeCompare(b));
  }

  function getOpenListings() {
    return PawHubServiceListings.getAll().filter((x) => x.status === "open");
  }

  function populateFilterOptions() {
    const list = getOpenListings();
    const petSel = document.getElementById("ss-filter-pet");
    const svcSel = document.getElementById("ss-filter-service");
    const locSel = document.getElementById("ss-filter-location");
    if (!petSel || !svcSel || !locSel) return;

    function fillSelect(select, labels, allLabel) {
      const cur = select.value;
      select.innerHTML = "";
      const opt0 = document.createElement("option");
      opt0.value = "";
      opt0.textContent = allLabel;
      select.appendChild(opt0);
      labels.forEach((label) => {
        const opt = document.createElement("option");
        opt.value = label;
        opt.textContent = label;
        select.appendChild(opt);
      });
      if ([...select.options].some((o) => o.value === cur)) select.value = cur;
    }

    fillSelect(petSel, uniqueSorted(list.map((x) => x.petType)), "All pet types");
    fillSelect(svcSel, uniqueSorted(list.map((x) => x.serviceType)), "All service types");
    fillSelect(locSel, uniqueSorted(list.map((x) => x.location)), "All locations");
  }

  function getFilterValues() {
    return {
      pet: (document.getElementById("ss-filter-pet") || {}).value || "",
      svc: (document.getElementById("ss-filter-service") || {}).value || "",
      loc: (document.getElementById("ss-filter-location") || {}).value || "",
    };
  }

  function filterOpenList(list) {
    const { pet, svc, loc } = getFilterValues();
    return list.filter((item) => {
      if (pet && item.petType !== pet) return false;
      if (svc && item.serviceType !== svc) return false;
      if (loc && item.location !== loc) return false;
      return true;
    });
  }

  function renderLatest(container) {
    if (!container) return;
    container.innerHTML = "";
    const open = filterOpenList(getOpenListings());
    if (!open.length) {
      container.appendChild(emptyPlaceholder("No services available at the moment"));
      return;
    }
    open.forEach((item) => {
      const art = document.createElement("article");
      art.className = "os-card os-card--stretch";
      art.dataset.serviceId = String(item.id);

      const head = document.createElement("div");
      head.className = "os-card__head";
      const left = document.createElement("div");
      const h3 = document.createElement("h3");
      h3.className = "os-card__title";
      h3.textContent = item.serviceType || "Service";
      const meta = document.createElement("p");
      meta.className = "os-card__meta";
      meta.textContent = petMetaLine(item);
      left.appendChild(h3);
      left.appendChild(meta);
      const tag = document.createElement("span");
      tag.className = "os-tag os-tag--latest";
      tag.textContent = "Open";
      head.appendChild(left);
      head.appendChild(tag);
      art.appendChild(head);
      art.appendChild(buildDetailsList(item));
      const desc = document.createElement("p");
      desc.className = "os-card__desc";
      desc.textContent = item.description || "—";
      art.appendChild(desc);

      const actions = document.createElement("div");
      actions.className = "os-card__actions os-card__actions--end";
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "os-btn os-btn--primary";
      btn.textContent = "Apply";
      btn.addEventListener("click", () => {
        PawHubServiceListings.applySitter(item.id);
        refreshAll();
      });
      actions.appendChild(btn);
      art.appendChild(actions);
      container.appendChild(art);
    });
  }

  function renderUpcoming(container) {
    if (!container) return;
    container.innerHTML = "";
    const list = PawHubServiceListings.getAll().filter(
      (x) => x.status === "in_progress" && x.sitterApplied
    );
    if (!list.length) {
      container.appendChild(emptyPlaceholder("No ongoing services yet. Apply from Latest post."));
      return;
    }
    list.forEach((item) => {
      const art = document.createElement("article");
      art.className = "os-card os-card--stretch";
      art.dataset.serviceId = String(item.id);

      const head = document.createElement("div");
      head.className = "os-card__head";
      const left = document.createElement("div");
      const h3 = document.createElement("h3");
      h3.className = "os-card__title";
      h3.textContent = item.serviceType || "Service";
      const meta = document.createElement("p");
      meta.className = "os-card__meta";
      meta.textContent = petMetaLine(item);
      left.appendChild(h3);
      left.appendChild(meta);
      const tag = document.createElement("span");
      tag.className = "os-tag os-tag--upcoming";
      tag.textContent = "Ongoing";
      head.appendChild(left);
      head.appendChild(tag);
      art.appendChild(head);
      art.appendChild(buildDetailsList(item));
      const desc = document.createElement("p");
      desc.className = "os-card__desc";
      desc.textContent = item.description || "—";
      art.appendChild(desc);
      const note = document.createElement("p");
      note.className = "os-card__desc os-card__desc--muted";
      note.textContent = "Waiting for the owner to mark this job complete.";
      art.appendChild(note);

      container.appendChild(art);
    });
  }

  function renderCompleted(container) {
    if (!container) return;
    container.innerHTML = "";
    const list = PawHubServiceListings.getAll().filter(
      (x) => x.status === "completed" && x.sitterApplied
    );
    if (!list.length) {
      container.appendChild(emptyPlaceholder("No completed services yet."));
      return;
    }
    list.forEach((item) => {
      const art = document.createElement("article");
      art.className = "os-card os-card--stretch";
      art.dataset.serviceId = String(item.id);

      const head = document.createElement("div");
      head.className = "os-card__head";
      const left = document.createElement("div");
      const h3 = document.createElement("h3");
      h3.className = "os-card__title";
      h3.textContent = item.serviceType || "Service";
      const meta = document.createElement("p");
      meta.className = "os-card__meta";
      meta.textContent = petMetaLine(item);
      left.appendChild(h3);
      left.appendChild(meta);
      const tag = document.createElement("span");
      tag.className = "os-tag os-tag--done";
      tag.textContent = "Completed";
      head.appendChild(left);
      head.appendChild(tag);
      art.appendChild(head);
      art.appendChild(buildDetailsList(item));
      const desc = document.createElement("p");
      desc.className = "os-card__desc";
      desc.textContent = item.description || "—";
      art.appendChild(desc);

      container.appendChild(art);
    });
  }

  function syncSitterPills() {
    const root = document.querySelector(".owner-services-page");
    if (!root) return;
    const pills = root.querySelectorAll("#sitter-services-top .os-filters__pills .os-pill");
    if (!pills.length) return;
    function sync() {
      const h = window.location.hash || "#sitter-services-top";
      pills.forEach((a) => {
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
    if (typeof PawHubServiceListings === "undefined") {
      console.error("service_listings_store.js must load before sitter_services.js");
      return;
    }
    ["ss-filter-pet", "ss-filter-service", "ss-filter-location"].forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.addEventListener("change", refreshAll);
    });
    syncSitterPills();
    refreshAll();
    window.addEventListener("pawhub-services-updated", refreshAll);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initSitterServices);
  } else {
    initSitterServices();
  }
})();
