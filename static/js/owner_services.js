/**
 * Owner My Services — data from window.PAWHUB_OWNER_SERVICE_PARTITION (Flask / DB).
 */
(function () {
  function getPartition() {
    var p = window.PAWHUB_OWNER_SERVICE_PARTITION;
    if (p && typeof p === "object") {
      return {
        latest: p.latest || [],
        upcoming: p.upcoming || [],
        completed: p.completed || [],
      };
    }
    return { latest: [], upcoming: [], completed: [] };
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

  function buildDetailsList(item, withGrow) {
    var ul = document.createElement("ul");
    ul.className = withGrow ? "os-details os-details--grow" : "os-details";
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

  function optionalDesc(item) {
    if (!item.description) return null;
    var p = document.createElement("p");
    p.className = "os-card__desc";
    p.textContent = item.description;
    return p;
  }

  function emptyPlaceholder(message) {
    var p = document.createElement("p");
    p.className = "os-empty";
    p.textContent = message;
    return p;
  }

  function renderLatest(container) {
    if (!container) return;
    container.innerHTML = "";
    var list = getPartition().latest || [];
    if (!list.length) {
      container.appendChild(
        emptyPlaceholder("No listings yet. Create your first service post to get started.")
      );
      return;
    }
    list.forEach(function (item) {
      var art = document.createElement("article");
      art.className = "os-card";
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
      tag.textContent = "Latest";
      head.appendChild(left);
      head.appendChild(tag);
      art.appendChild(head);
      art.appendChild(buildDetailsList(item, false));
      var d = optionalDesc(item);
      if (d) art.appendChild(d);

      var actions = document.createElement("div");
      actions.className = "os-card__actions";
      var editBtn = document.createElement("button");
      editBtn.type = "button";
      editBtn.className = "os-btn os-btn--ghost";
      editBtn.textContent = "Edit";
      editBtn.addEventListener("click", function () {
        var next = window.prompt("Update description", item.description || "");
        if (next === null) return;
        var f = document.createElement("form");
        f.method = "post";
        f.action = "/owner/services/" + item.id + "/description";
        var inp = document.createElement("input");
        inp.type = "hidden";
        inp.name = "description";
        inp.value = next.trim();
        f.appendChild(inp);
        document.body.appendChild(f);
        f.submit();
      });
      var delBtn = document.createElement("button");
      delBtn.type = "button";
      delBtn.className = "os-btn os-btn--outline-danger";
      delBtn.textContent = "Delete";
      delBtn.addEventListener("click", function () {
        if (window.confirm("Delete this listing?")) postTo("/owner/services/" + item.id + "/delete");
      });
      actions.appendChild(editBtn);
      actions.appendChild(delBtn);
      art.appendChild(actions);

      container.appendChild(art);
    });
  }

  function renderUpcoming(container) {
    if (!container) return;
    container.innerHTML = "";
    var list = getPartition().upcoming || [];
    if (!list.length) {
      container.appendChild(emptyPlaceholder("No upcoming services."));
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
      tag.textContent = "Upcoming";
      head.appendChild(left);
      head.appendChild(tag);
      art.appendChild(head);
      art.appendChild(buildDetailsList(item, true));
      var d = optionalDesc(item);
      if (d) art.appendChild(d);
      if (item.sitterApplied) {
        var note = document.createElement("p");
        note.className = "os-card__desc os-card__desc--muted";
        note.textContent =
          "A sitter is assigned — mark complete when the job is done.";
        art.appendChild(note);
      }

      var actions = document.createElement("div");
      actions.className = "os-card__actions os-card__actions--end";
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "os-btn os-btn--mark-complete";
      btn.textContent = "Mark as complete";
      btn.addEventListener("click", function () {
        postTo("/owner/services/" + item.id + "/complete");
      });
      actions.appendChild(btn);
      art.appendChild(actions);

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
      art.appendChild(buildDetailsList(item, true));
      var d = optionalDesc(item);
      if (d) art.appendChild(d);

      var review = document.createElement("div");
      review.className = "os-review";
      var rateBtn = document.createElement("button");
      rateBtn.type = "button";
      rateBtn.className = "os-btn os-btn--review";
      rateBtn.textContent = "Review & rate";
      review.appendChild(rateBtn);
      art.appendChild(review);
      container.appendChild(art);
    });
  }

  function syncFilterPills() {
    var root = document.querySelector(".owner-services-page");
    if (!root) return;
    var pills = root.querySelectorAll("#owner-services-top .os-filters__pills .os-pill");
    function sync() {
      var h = window.location.hash || "#owner-services-top";
      pills.forEach(function (a) {
        a.classList.toggle("is-active", a.getAttribute("href") === h);
      });
    }
    window.addEventListener("hashchange", sync);
    sync();
  }

  function refreshAll() {
    renderLatest(document.getElementById("os-latest-root"));
    renderUpcoming(document.getElementById("os-upcoming-root"));
    renderCompleted(document.getElementById("os-completed-root"));
  }

  function initOwnerServices() {
    if (typeof window.PAWHUB_OWNER_SERVICE_PARTITION === "undefined") {
      console.error("PAWHUB_OWNER_SERVICE_PARTITION missing.");
      return;
    }
    refreshAll();
    syncFilterPills();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initOwnerServices);
  } else {
    initOwnerServices();
  }
})();
