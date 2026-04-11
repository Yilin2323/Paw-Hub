/**
 * Owner dashboard: simple "personalized" pet tips from mock_data.js
 * (picks pet type from your services, else defaults to Dog).
 */
(function () {
  function getAllServices() {
    if (
      typeof window.PAWHUB_OWNER_PET_SERVICES !== "undefined" &&
      Array.isArray(window.PAWHUB_OWNER_PET_SERVICES)
    ) {
      return window.PAWHUB_OWNER_PET_SERVICES;
    }
    if (typeof PawHubServiceListings !== "undefined") {
      return PawHubServiceListings.getAll() || [];
    }
    if (typeof services !== "undefined") {
      return [
        ...(services.latest || []),
        ...(services.upcoming || []),
        ...(services.completed || []),
      ];
    }
    return [];
  }

  function getMostFrequentPetType() {
    const all = getAllServices();
    if (!all.length) return null;

    const counts = {};
    all.forEach((s) => {
      const t = s.petType;
      if (t) counts[t] = (counts[t] || 0) + 1;
    });

    let best = null;
    let max = 0;
    for (const t in counts) {
      if (counts[t] > max) {
        max = counts[t];
        best = t;
      }
    }
    return best;
  }

  function resolvePetType() {
    const fromData = getMostFrequentPetType();
    if (typeof petCareTips === "undefined") return null;
    if (fromData && petCareTips[fromData]) return fromData;
    if (petCareTips.Dog) return "Dog";
    const keys = Object.keys(petCareTips);
    return keys.length ? keys[0] : null;
  }

  function renderPetCareTips() {
    const listEl = document.getElementById("pet-care-tips");
    const subEl = document.getElementById("dash-smart-tips-sub");
    if (!listEl) return;

    listEl.textContent = "";
    if (subEl) subEl.textContent = "";

    if (typeof petCareTips === "undefined") {
      if (subEl) subEl.textContent = "Tips will appear here once data is loaded.";
      const li = document.createElement("li");
      li.className = "text-muted small";
      li.textContent = "No tips available yet.";
      listEl.appendChild(li);
      return;
    }

    const petType = resolvePetType();
    if (!petType || !petCareTips[petType]) {
      if (subEl) subEl.textContent = "Add a service with a pet type to see tailored tips.";
      const li = document.createElement("li");
      li.className = "text-muted small";
      li.textContent = "No tips available yet.";
      listEl.appendChild(li);
      return;
    }

    const tips = petCareTips[petType].slice(0, 3);
    if (!tips.length) {
      if (subEl) subEl.textContent = "No tips in the library for this pet type yet.";
      const li = document.createElement("li");
      li.className = "text-muted small";
      li.textContent = "Check back later.";
      listEl.appendChild(li);
      return;
    }

    const usedProfile = getMostFrequentPetType() === petType;

    if (subEl) {
      subEl.textContent = usedProfile
        ? `Based on your services, most of your bookings involve ${petType.toLowerCase()}s. Here are three quick reminders.`
        : `General ${petType.toLowerCase()} care tips while we learn your preferences from future bookings.`;
    }

    tips.forEach((text, i) => {
      const li = document.createElement("li");
      li.className = "dash-smart-tips-item";
      li.style.setProperty("--tip-delay", `${60 + i * 75}ms`);
      li.setAttribute("role", "listitem");

      const icon = document.createElement("i");
      icon.className = "bi bi-check2-circle dash-smart-tips-item__icon";
      icon.setAttribute("aria-hidden", "true");

      const span = document.createElement("span");
      span.textContent = text;

      li.appendChild(icon);
      li.appendChild(span);
      listEl.appendChild(li);
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", renderPetCareTips);
  } else {
    renderPetCareTips();
  }
})();
