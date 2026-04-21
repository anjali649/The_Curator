(function () {
  function applyTheme() {
    try {
      var t = localStorage.getItem("curator_theme") || "light";
      if (t === "dark") {
        document.documentElement.setAttribute("data-theme", "dark");
      } else if (t === "system" && window.matchMedia) {
        if (window.matchMedia("(prefers-color-scheme: dark)").matches) {
          document.documentElement.setAttribute("data-theme", "dark");
        } else {
          document.documentElement.removeAttribute("data-theme");
        }
      } else {
        document.documentElement.removeAttribute("data-theme");
      }
    } catch (e) {}
  }

  applyTheme();

  try {
    if (
      localStorage.getItem("curator_theme") === "system" &&
      window.matchMedia
    ) {
      window
        .matchMedia("(prefers-color-scheme: dark)")
        .addEventListener("change", applyTheme);
    }
  } catch (e) {}
})();
