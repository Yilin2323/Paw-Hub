/**
 * Renders My Services from global `services` (mock_data.js): latest, upcoming, completed.
 */
(function () {
  function petMetaLine(item) {
    const n = Number(item.pets) || 1;
    const word = n === 1 ? "pet" : "pets";
    return `${item.petType} · ${n} ${word}`;
  }

  function appendDetailRow(ul, label, value) {
    const li = document.createElement("li");
    const k = document.createElement("span");
    k.className = "os-details__k";
    k.textContent = label;
    const v = document.createElement("span");
    v.className = "os-details__v";
    v.textContent = value;
    li.appendChild(k);
    li.appendChild(document.createTextNode(" "));
    li.appendChild(v);
    ul.appendChild(li);
  }

  function buildDetailsList(item, withGrow) {
    const ul = document.createElement("ul");
    ul.className = withGrow ? "os-details os-details--grow" : "os-details";
    appendDetailRow(ul, "Date", item.date || "—");
    appendDetailRow(ul, "Time", item.time || "—");
    appendDetailRow(ul, "Location", item.location || "—");
    appendDetailRow(ul, "Salary", (item.salary || "—").replace(/\s+/g, " ").trim());
    return ul;
  }

  function emptyPlaceholder(message) {
    const p = document.createElement("p");
    p.className = "os-empty";
    p.textContent = message;
    return p;
  }

  function renderLatest(container) {
    if (!container) return;
    container.innerHTML = "";
    const list = (services && services.latest) || [];
    if (!list.length) {
      container.appendChild(emptyPlaceholder("No listings in Latest post yet."));
      return;
    }
    list.forEach((item) => {
      const art = document.createElement("article");
      art.className = "os-card";
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
      tag.textContent = "Latest";
      head.appendChild(left);
      head.appendChild(tag);
      art.appendChild(head);
      art.appendChild(buildDetailsList(item, false));

      const actions = document.createElement("div");
      actions.className = "os-card__actions";
      const editBtn = document.createElement("button");
      editBtn.type = "button";
      editBtn.className = "os-btn os-btn--ghost";
      editBtn.textContent = "Edit";
      const delBtn = document.createElement("button");
      delBtn.type = "button";
      delBtn.className = "os-btn os-btn--outline-danger";
      delBtn.textContent = "Delete";
      actions.appendChild(editBtn);
      actions.appendChild(delBtn);
      art.appendChild(actions);

      container.appendChild(art);
    });
  }

  function renderUpcoming(container) {
    if (!container) return;
    container.innerHTML = "";
    const list = (services && services.upcoming) || [];
    if (!list.length) {
      container.appendChild(emptyPlaceholder("No upcoming services."));
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
      tag.textContent = "Upcoming";
      head.appendChild(left);
      head.appendChild(tag);
      art.appendChild(head);
      art.appendChild(buildDetailsList(item, true));

      /* Footer row: flex container pinned to card bottom (--end uses margin-top: auto on stretch cards).
         Button is centered via CSS on #os-upcoming-root .os-card__actions--end */
      const actions = document.createElement("div");
      actions.className = "os-card__actions os-card__actions--end";
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "os-btn os-btn--mark-complete";
      btn.textContent = "Mark as complete";
      actions.appendChild(btn);
      art.appendChild(actions);

      container.appendChild(art);
    });
  }

  function renderCompleted(container) {
    if (!container) return;
    container.innerHTML = "";
    const list = (services && services.completed) || [];
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
      art.appendChild(buildDetailsList(item, true));

      const review = document.createElement("div");
      review.className = "os-review";
      const rateBtn = document.createElement("button");
      rateBtn.type = "button";
      rateBtn.className = "os-btn os-btn--review";
      rateBtn.textContent = "Review & rate";
      review.appendChild(rateBtn);
      art.appendChild(review);
      container.appendChild(art);
    });
  }

  function syncFilterPills() {
    const root = document.querySelector(".owner-services-page");
    if (!root) return;
    const pills = root.querySelectorAll(".os-filters__pills .os-pill");
    function sync() {
      const h = window.location.hash || "#owner-services-top";
      pills.forEach((a) => {
        a.classList.toggle("is-active", a.getAttribute("href") === h);
      });
    }
    window.addEventListener("hashchange", sync);
    sync();
  }

  function initOwnerServices() {
    if (typeof services === "undefined") {
      console.error("mock_data.js must load before owner_services.js");
      return;
    }
    renderLatest(document.getElementById("os-latest-root"));
    renderUpcoming(document.getElementById("os-upcoming-root"));
    renderCompleted(document.getElementById("os-completed-root"));
    syncFilterPills();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initOwnerServices);
  } else {
    initOwnerServices();
  }
})();
