(function () {
  var otp = document.getElementById("verify-otp");
  if (otp) {
    var maxLen = parseInt(otp.getAttribute("maxlength"), 10) || 6;
    otp.addEventListener("input", function () {
      var v = otp.value.replace(/\D/g, "").slice(0, maxLen);
      otp.value = v;
    });
    otp.addEventListener("paste", function (e) {
      e.preventDefault();
      var text = (e.clipboardData || window.clipboardData).getData("text") || "";
      var digits = text.replace(/\D/g, "").slice(0, maxLen);
      otp.value = digits;
    });
  }

  var btn = document.getElementById("verify-resend-btn");
  var countdownEl = document.getElementById("verify-resend-countdown");
  if (!btn || !countdownEl) return;

  var lock = parseInt(btn.getAttribute("data-lock-seconds"), 10) || 0;
  if (lock <= 0) return;

  btn.disabled = true;
  countdownEl.classList.remove("d-none");

  function tick() {
    if (lock <= 0) {
      btn.disabled = false;
      countdownEl.classList.add("d-none");
      return;
    }
    countdownEl.textContent =
      "You can resend in " + lock + " second" + (lock === 1 ? "" : "s") + ".";
    lock -= 1;
    setTimeout(tick, 1000);
  }

  tick();
})();
