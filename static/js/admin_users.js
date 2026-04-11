/**
 * Admin users: role filter + search; confirm suspend / activate.
 */
(function () {
  function initAdminUsers() {
    var root = document.querySelector(".admin-users-page");
    if (!root) return;

    var searchInput = document.getElementById("au-search-input");
    var filterSelect = document.getElementById("au-filter-select");
    var tbody = document.getElementById("au-tbody");
    var emptyFilter = document.getElementById("au-empty-filter");
    var tableScroll = root.querySelector(".au-table-scroll");

    function norm(s) {
      return (s || "").toLowerCase().trim();
    }

    function rowMatchesRole(tr, roleFilter) {
      if (roleFilter === "all") return true;
      return (tr.getAttribute("data-au-role") || "") === roleFilter;
    }

    function rowMatchesSearch(tr, q) {
      if (!q) return true;
      var blob = norm(tr.getAttribute("data-au-search"));
      return blob.indexOf(q) !== -1;
    }

    function applyFilters() {
      if (!tbody) return;
      var q = norm(searchInput ? searchInput.value : "");
      var roleFilter = filterSelect ? filterSelect.value : "all";
      var rows = tbody.querySelectorAll("tr.au-row");
      var visible = 0;
      rows.forEach(function (tr) {
        var show =
          rowMatchesRole(tr, roleFilter) && rowMatchesSearch(tr, q);
        tr.classList.toggle("d-none", !show);
        if (show) visible += 1;
      });
      if (emptyFilter) {
        emptyFilter.classList.toggle("d-none", visible !== 0);
      }
      if (tableScroll) {
        tableScroll.classList.toggle("d-none", visible === 0);
      }
    }

    if (searchInput) {
      searchInput.addEventListener("input", applyFilters);
    }
    if (filterSelect) {
      filterSelect.addEventListener("change", applyFilters);
    }

    root.querySelectorAll('form[action*="/suspend"]').forEach(function (form) {
      form.addEventListener("submit", function (e) {
        if (
          !window.confirm(
            "Suspend this user? They will not be able to sign in until an administrator reactivates the account."
          )
        ) {
          e.preventDefault();
        }
      });
    });

    root.querySelectorAll('form[action*="/unsuspend"]').forEach(function (form) {
      form.addEventListener("submit", function (e) {
        if (
          !window.confirm(
            "Reactivate this user? They will be able to sign in again."
          )
        ) {
          e.preventDefault();
        }
      });
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initAdminUsers);
  } else {
    initAdminUsers();
  }
})();
