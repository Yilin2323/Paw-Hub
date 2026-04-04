/**
 * Owner applications page: sync status filter pills with URL hash (anchor navigation).
 */
(function () {
  function syncFilterPills() {
    var root = document.querySelector(".owner-applications-page");
    if (!root) return;

    var pills = root.querySelectorAll(".oa-filters__pills .oa-pill");
    if (!pills.length) return;

    function sync() {
      var h = window.location.hash || "#applications-top";
      pills.forEach(function (a) {
        a.classList.toggle("is-active", a.getAttribute("href") === h);
      });
    }

    window.addEventListener("hashchange", sync);
    sync();
  }

  function initOwnerApplications() {
    syncFilterPills();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initOwnerApplications);
  } else {
    initOwnerApplications();
  }
})();
