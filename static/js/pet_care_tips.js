(function () {
    function getAllServices() {
      return [
        ...(services.latest || []),
        ...(services.upcoming || []),
        ...(services.completed || [])
      ];
    }
  
    function getMostFrequentPetType() {
      const allServices = getAllServices();
  
      if (allServices.length === 0) {
        return null;
      }
  
      const petCount = {};
  
      allServices.forEach((service) => {
        const petType = service.petType;
        if (petType) {
          petCount[petType] = (petCount[petType] || 0) + 1;
        }
      });
  
      let mostFrequentPet = null;
      let maxCount = 0;
  
      for (const pet in petCount) {
        if (petCount[pet] > maxCount) {
          maxCount = petCount[pet];
          mostFrequentPet = pet;
        }
      }
  
      return mostFrequentPet;
    }
  
    function renderPetCareTips() {
      const tipsContainer = document.getElementById("pet-care-tips");
      if (!tipsContainer) return;
  
      if (typeof services === "undefined" || typeof petCareTips === "undefined") {
        tipsContainer.innerHTML = `<p class="mb-0">No tips available yet.</p>`;
        return;
      }
  
      const petType = getMostFrequentPetType();
  
      if (!petType || !petCareTips[petType]) {
        tipsContainer.innerHTML = `<p class="mb-0">No tips available yet.</p>`;
        return;
      }
  
      const tips = petCareTips[petType].slice(0, 3);
  
      let html = `<p class="mb-2"><strong>Tips for ${petType} care:</strong></p>`;
      html += `<ul class="mb-0 ps-3">`;
  
      tips.forEach((tip) => {
        html += `<li class="mb-2">${tip}</li>`;
      });
  
      html += `</ul>`;
  
      tipsContainer.innerHTML = html;
    }
  
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", renderPetCareTips);
    } else {
      renderPetCareTips();
    }
  })();