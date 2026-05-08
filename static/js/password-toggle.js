document.addEventListener("DOMContentLoaded", () => {
  const toggles = document.querySelectorAll("[data-password-toggle]");
  const visibleIcon = '<i class="bi bi-eye-slash" aria-hidden="true"></i>';
  const hiddenIcon = '<i class="bi bi-eye" aria-hidden="true"></i>';

  toggles.forEach((toggle) => {
    const targetId = toggle.getAttribute("data-password-toggle");
    if (!targetId) {
      return;
    }

    const input = document.getElementById(targetId);
    if (!input) {
      return;
    }

    const setState = (isVisible) => {
      input.type = isVisible ? "text" : "password";
      toggle.innerHTML = isVisible ? visibleIcon : hiddenIcon;
      toggle.setAttribute("aria-label", isVisible ? "Hide password" : "Show password");
      toggle.setAttribute("aria-pressed", String(isVisible));
    };

    setState(false);

    toggle.addEventListener("click", () => {
      setState(input.type === "password");
    });
  });
});
