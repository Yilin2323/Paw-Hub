/**
 * Owner My Services — data from window.PAWHUB_OWNER_SERVICE_PARTITION (Flask / DB).
 */
(function () {
  /** Matches create_service / DB CHECK — used for the "Types of services" filter. */
  var OWNER_SERVICE_TYPES = [
    "Pet Sitting",
    "Pet Day Care",
    "Pet Taxi",
    "Pet Training",
    "Dog Walking",
  ];

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
      art.dataset.serviceType = item.serviceType || "";

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
      container.appendChild(
        emptyPlaceholder(
          "No upcoming services yet. Approve a sitter under Applications to assign a job here."
        )
      );
      return;
    }
    list.forEach(function (item) {
      var art = document.createElement("article");
      art.className = "os-card os-card--stretch";
      art.dataset.serviceId = String(item.id);
      art.dataset.serviceType = item.serviceType || "";

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
      var note = document.createElement("p");
      note.className = "os-card__desc os-card__desc--muted";
      note.innerHTML =
        "A sitter is assigned. When the visit is finished, open <strong>Applications</strong> and use <strong>Mark as complete</strong>.";
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
      art.dataset.serviceType = item.serviceType || "";

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
      container.appendChild(art);
    });
  }

  function hashToOwnerServiceFilter() {
    var h = (window.location.hash || "").toLowerCase();
    if (h === "#owner-services-latest") return "latest";
    if (h === "#owner-services-upcoming") return "upcoming";
    if (h === "#owner-services-completed") return "completed";
    return "all";
  }

  function setOwnerServiceHash(filter) {
    var map = {
      all: "#owner-services-top",
      latest: "#owner-services-latest",
      upcoming: "#owner-services-upcoming",
      completed: "#owner-services-completed",
    };
    var next = map[filter] || "#owner-services-top";
    if (window.location.hash !== next) {
      history.replaceState(null, "", next);
    }
  }

  function applyOwnerServiceFilter(filter) {
    var page = document.querySelector(".owner-services-page");
    if (!page || !page.querySelector("#owner-services-top")) return;

    var secLatest = page.querySelector('[data-os-section="latest"]');
    var secUpcoming = page.querySelector('[data-os-section="upcoming"]');
    var secCompleted = page.querySelector('[data-os-section="completed"]');

    function setSectionVisible(el, visible) {
      if (!el) return;
      if (visible) {
        el.removeAttribute("hidden");
      } else {
        el.setAttribute("hidden", "");
      }
    }

    if (filter === "all") {
      setSectionVisible(secLatest, true);
      setSectionVisible(secUpcoming, true);
      setSectionVisible(secCompleted, true);
    } else if (filter === "latest") {
      setSectionVisible(secLatest, true);
      setSectionVisible(secUpcoming, false);
      setSectionVisible(secCompleted, false);
    } else if (filter === "upcoming") {
      setSectionVisible(secLatest, false);
      setSectionVisible(secUpcoming, true);
      setSectionVisible(secCompleted, false);
    } else if (filter === "completed") {
      setSectionVisible(secLatest, false);
      setSectionVisible(secUpcoming, false);
      setSectionVisible(secCompleted, true);
    }

    page.querySelectorAll("#owner-services-top .os-pill[data-os-filter]").forEach(function (btn) {
      btn.classList.toggle("is-active", btn.getAttribute("data-os-filter") === filter);
    });

    setOwnerServiceHash(filter);
    applyOwnerServiceTypeFilter();
  }

  function getOwnerServiceTypeFilterValue() {
    var wrap = document.getElementById("os-service-type-pills");
    if (!wrap) return "";
    var active = wrap.querySelector(".os-pill.is-active[data-os-service-type]");
    var raw = active ? active.getAttribute("data-os-service-type") || "" : "";
    return raw === "all" ? "" : raw;
  }

  function initOwnerServiceTypePills() {
    var wrap = document.getElementById("os-service-type-pills");
    if (!wrap) return;
    wrap.innerHTML = "";
    function addPill(label, typeKey, isActive) {
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "os-pill" + (isActive ? " is-active" : "");
      btn.setAttribute("data-os-service-type", typeKey);
      btn.textContent = label;
      btn.addEventListener("click", function () {
        wrap.querySelectorAll(".os-pill[data-os-service-type]").forEach(function (b) {
          b.classList.remove("is-active");
        });
        btn.classList.add("is-active");
        applyOwnerServiceTypeFilter();
      });
      wrap.appendChild(btn);
    }
    addPill("All types", "all", true);
    OWNER_SERVICE_TYPES.forEach(function (t) {
      addPill(t, t, false);
    });
  }

  function applyOwnerServiceTypeFilter() {
    var page = document.querySelector(".owner-services-page");
    if (!page || !page.querySelector("#owner-services-top")) return;
    var val = getOwnerServiceTypeFilterValue();
    ["os-latest-root", "os-upcoming-root", "os-completed-root"].forEach(function (rid) {
      var root = document.getElementById(rid);
      if (!root) return;
      root.querySelectorAll("article.os-card").forEach(function (art) {
        var t = art.dataset.serviceType || "";
        var show = !val || t === val;
        art.style.display = show ? "" : "none";
      });
    });
  }

  function wireOwnerServiceFilters() {
    var page = document.querySelector(".owner-services-page");
    if (!page || !page.querySelector("#owner-services-top")) return;

    page.querySelectorAll("#owner-services-top .os-pill[data-os-filter]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        applyOwnerServiceFilter(btn.getAttribute("data-os-filter") || "all");
      });
    });

    window.addEventListener("hashchange", function () {
      if (!document.querySelector(".owner-services-page #owner-services-top")) return;
      applyOwnerServiceFilter(hashToOwnerServiceFilter());
    });
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
    initOwnerServiceTypePills();
    refreshAll();
    wireOwnerServiceFilters();
    applyOwnerServiceFilter(hashToOwnerServiceFilter());
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initOwnerServices);
  } else {
    initOwnerServices();
  }
})();
