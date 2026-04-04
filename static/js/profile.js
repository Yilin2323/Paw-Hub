/**
 * Profile page: avatar preview from file input, cancel reset, submit stub.
 */
(function () {
  function initProfilePage() {
    var input = document.getElementById("profile-photo-input");
    var preview = document.getElementById("profile-avatar-preview");
    var form = document.getElementById("profile-form");
    var cancelBtn = document.getElementById("profile-cancel-btn");
    var defaultAvatar = preview ? preview.getAttribute("src") : "";

    if (input && preview) {
      input.addEventListener("change", function () {
        var file = input.files && input.files[0];
        if (!file || !file.type || file.type.indexOf("image/") !== 0) return;
        var reader = new FileReader();
        reader.onload = function () {
          preview.src = reader.result;
        };
        reader.readAsDataURL(file);
      });
    }

    if (cancelBtn && form) {
      cancelBtn.addEventListener("click", function () {
        form.reset();
        if (input) input.value = "";
        if (preview && defaultAvatar) preview.src = defaultAvatar;
      });
    }

    if (form) {
      form.addEventListener("submit", function (e) {
        e.preventDefault();
      });
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initProfilePage);
  } else {
    initProfilePage();
  }
})();
