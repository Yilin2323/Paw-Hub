/**
 * Shared mock listings for owner + sitter services (sessionStorage).
 * status: "open" | "in_progress" | "completed"
 * sitterApplied: mock sitter (Alex) has applied → moves to in_progress for shared workflow.
 */
(function () {
  var STORAGE_KEY = "pawhub_service_listings_v1";

  function defaultListings() {
    return [
      {
        id: 1,
        serviceType: "Dog Walking",
        petType: "Dog",
        pets: 2,
        date: "10 June 2026",
        time: "9:00 AM",
        location: "Puchong",
        salary: "RM 30",
        description: "Morning walk for two friendly dogs. Leashes provided.",
        status: "open",
        sitterApplied: false,
      },
      {
        id: 2,
        serviceType: "Pet Training",
        petType: "Cat",
        pets: 1,
        date: "15 June 2026",
        time: "7:00 PM",
        location: "Petaling Jaya",
        salary: "RM 25",
        description: "Indoor clicker training session for a shy rescue cat.",
        status: "open",
        sitterApplied: false,
      },
      {
        id: 3,
        serviceType: "Pet Taxi",
        petType: "Cat",
        pets: 1,
        date: "20 June 2026",
        time: "8:00 AM",
        location: "Damansara",
        salary: "RM 100",
        description: "Vet appointment transport — a sitter is already assigned.",
        status: "in_progress",
        sitterApplied: true,
      },
      {
        id: 4,
        serviceType: "Pet Day Care",
        petType: "Dog",
        pets: 1,
        date: "18 June 2026",
        time: "8:00 AM – 6:00 PM",
        location: "Subang Jaya",
        salary: "RM 80",
        description: "Full day care; still accepting applications.",
        status: "in_progress",
        sitterApplied: false,
      },
      {
        id: 5,
        serviceType: "Pet Training",
        petType: "Cat",
        pets: 1,
        date: "25 May 2026",
        time: "4:00 PM",
        location: "Cheras",
        salary: "RM 50",
        description: "Completed obedience refresher.",
        status: "completed",
        sitterApplied: true,
      },
    ];
  }

  function clone(list) {
    return JSON.parse(JSON.stringify(list));
  }

  function load() {
    try {
      var raw = sessionStorage.getItem(STORAGE_KEY);
      if (raw) {
        var parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length) return parsed;
      }
    } catch (e) {}
    return clone(defaultListings());
  }

  function save(list) {
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(list));
      window.dispatchEvent(new CustomEvent("pawhub-services-updated"));
    } catch (e) {}
  }

  function partitionOwner(list) {
    return {
      latest: list.filter(function (x) {
        return x.status === "open";
      }),
      upcoming: list.filter(function (x) {
        return x.status === "in_progress";
      }),
      completed: list.filter(function (x) {
        return x.status === "completed";
      }),
    };
  }

  window.PawHubServiceListings = {
    load: load,
    save: save,
    reset: function () {
      try {
        sessionStorage.removeItem(STORAGE_KEY);
      } catch (e) {}
    },
    getAll: load,
    replace: save,
    partitionOwner: function () {
      return partitionOwner(load());
    },
    /** Legacy shape for code that still expects services.latest / upcoming / completed */
    asLegacyServices: function () {
      return partitionOwner(load());
    },
    updateById: function (id, mutator) {
      var list = load();
      var item = list.find(function (x) {
        return Number(x.id) === Number(id);
      });
      if (item) mutator(item);
      save(list);
    },
    removeById: function (id) {
      save(
        load().filter(function (x) {
          return Number(x.id) !== Number(id);
        })
      );
    },
    applySitter: function (id) {
      this.updateById(id, function (item) {
        if (item.status !== "open") return;
        item.sitterApplied = true;
        item.status = "in_progress";
      });
    },
    markOwnerComplete: function (id) {
      this.updateById(id, function (item) {
        if (item.status !== "in_progress") return;
        item.status = "completed";
      });
    },
    defaultListings: defaultListings,
  };
})();
