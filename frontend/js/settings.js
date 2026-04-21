(function () {
  var themeMediaListener = null;

  function showPanel(id) {
    document.querySelectorAll(".settings-panel").forEach(function (p) {
      p.classList.toggle("is-visible", p.id === "panel-" + id);
    });
    document.querySelectorAll(".settings-nav button").forEach(function (b) {
      b.classList.toggle("is-active", b.getAttribute("data-panel") === id);
    });
    if (id === "api") {
      refreshApiHealth();
    }
  }

  function applyTheme(val) {
    try {
      if (themeMediaListener && window.matchMedia) {
        window
          .matchMedia("(prefers-color-scheme: dark)")
          .removeEventListener("change", themeMediaListener);
        themeMediaListener = null;
      }
    } catch (e) {}

    if (val === "dark") {
      document.documentElement.setAttribute("data-theme", "dark");
      localStorage.setItem("curator_theme", "dark");
    } else if (val === "system") {
      localStorage.setItem("curator_theme", "system");
      function sync() {
        if (
          window.matchMedia &&
          window.matchMedia("(prefers-color-scheme: dark)").matches
        ) {
          document.documentElement.setAttribute("data-theme", "dark");
        } else {
          document.documentElement.removeAttribute("data-theme");
        }
      }
      sync();
      if (window.matchMedia) {
        themeMediaListener = sync;
        window
          .matchMedia("(prefers-color-scheme: dark)")
          .addEventListener("change", themeMediaListener);
      }
    } else {
      document.documentElement.removeAttribute("data-theme");
      localStorage.setItem("curator_theme", "light");
    }
  }

  function refreshApiHealth() {
    var line = document.getElementById("api-health-line");
    if (!line || typeof CuratorAPI === "undefined" || !CuratorAPI.health) return;
    line.textContent = "Checking backend…";
    CuratorAPI.health()
      .then(function (h) {
        if (!h) {
          line.textContent = "Unexpected response.";
          return;
        }
        var parts = [];
        if (h.status === "ok") parts.push("Backend reachable");
        else parts.push("Status: " + String(h.status));
        if (typeof h.problems_loaded === "number") {
          parts.push(String(h.problems_loaded) + " problems loaded");
        }
        if (h.gemini_key_loaded) {
          parts.push("Gemini API key on server (Ask AI / suggestions if quota allows)");
        } else {
          parts.push("No Gemini key — set GEMINI_API_KEY in backend/.env");
        }
        line.textContent = parts.join(" · ");
      })
      .catch(function () {
        line.textContent =
          "Could not reach the API. Start the backend with: uvicorn main:app --reload --host 127.0.0.1 --port 8000";
      });
  }

  function load() {
    try {
      var raw = localStorage.getItem("curator_profile");
      if (raw) {
        var p = JSON.parse(raw);
        var n = document.getElementById("set-name");
        var b = document.getElementById("set-bio");
        var f = document.getElementById("set-focus");
        if (n && p.displayName) n.value = p.displayName;
        if (b && p.bio) b.value = p.bio;
        if (f && p.focus) f.value = p.focus;
      }
      var n2 = localStorage.getItem("curator_notif_email");
      var n3 = localStorage.getItem("curator_notif_cluster");
      var n4 = localStorage.getItem("curator_notif_weekly");
      if (document.getElementById("notif-email"))
        document.getElementById("notif-email").checked = n2 === "1";
      if (document.getElementById("notif-cluster"))
        document.getElementById("notif-cluster").checked = n3 === "1";
      if (document.getElementById("notif-weekly"))
        document.getElementById("notif-weekly").checked = n4 === "1";

      var th = localStorage.getItem("curator_theme") || "light";
      if (th === "dark") {
        var td = document.getElementById("theme-dark");
        if (td) td.checked = true;
      } else if (th === "system") {
        var ts = document.getElementById("theme-system");
        if (ts) ts.checked = true;
      } else {
        var tl = document.getElementById("theme-light");
        if (tl) tl.checked = true;
      }

      var psize = localStorage.getItem("curator_explorer_page_size") || "9";
      var sel = document.getElementById("explorer-page-size");
      if (sel) sel.value = psize;
      if (document.getElementById("explorer-compact"))
        document.getElementById("explorer-compact").checked =
          localStorage.getItem("curator_explorer_compact") === "1";
    } catch (e) {}
  }

  function saveAccount() {
    var name = document.getElementById("set-name").value.trim();
    var bio = document.getElementById("set-bio").value.trim();
    var focus = document.getElementById("set-focus")
      ? document.getElementById("set-focus").value.trim()
      : "";
    localStorage.setItem(
      "curator_profile",
      JSON.stringify({
        displayName: name || "The Curator user",
        bio: bio,
        focus: focus,
      }),
    );
    var msg = document.getElementById("account-msg");
    msg.textContent = "Saved.";
    msg.classList.remove("hidden");
    setTimeout(function () {
      msg.classList.add("hidden");
    }, 2000);
  }

  function saveNotif() {
    localStorage.setItem(
      "curator_notif_email",
      document.getElementById("notif-email").checked ? "1" : "0",
    );
    localStorage.setItem(
      "curator_notif_cluster",
      document.getElementById("notif-cluster").checked ? "1" : "0",
    );
    localStorage.setItem(
      "curator_notif_weekly",
      document.getElementById("notif-weekly").checked ? "1" : "0",
    );
    alert("Notification preferences saved locally.");
  }

  function saveExplorer() {
    var sel = document.getElementById("explorer-page-size");
    var v = sel ? sel.value : "9";
    localStorage.setItem("curator_explorer_page_size", v);
    localStorage.setItem(
      "curator_explorer_compact",
      document.getElementById("explorer-compact").checked ? "1" : "0",
    );
    var m = document.getElementById("explorer-msg");
    if (m) {
      m.textContent =
        "Saved. Reload the Explorer page to apply page size and compact layout.";
      m.classList.remove("hidden");
      setTimeout(function () {
        m.classList.add("hidden");
      }, 4000);
    }
  }

  function exportLocalData() {
    var payload = {};
    try {
      for (var i = 0; i < localStorage.length; i++) {
        var k = localStorage.key(i);
        if (k && k.indexOf("curator_") === 0) {
          payload[k] = localStorage.getItem(k);
        }
      }
    } catch (e) {
      alert("Could not read local storage.");
      return;
    }
    var blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: "application/json",
    });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "curator-local-backup.json";
    a.click();
    URL.revokeObjectURL(a.href);
  }

  function clearAllLocal() {
    if (
      !confirm(
        "Remove all Curator data from this browser (profile, ideas, preferences)? This cannot be undone.",
      )
    ) {
      return;
    }
    try {
      var toRemove = [];
      for (var i = 0; i < localStorage.length; i++) {
        var k = localStorage.key(i);
        if (k && k.indexOf("curator_") === 0) toRemove.push(k);
      }
      toRemove.forEach(function (k) {
        localStorage.removeItem(k);
      });
    } catch (e) {
      alert("Could not clear storage.");
      return;
    }
    var dm = document.getElementById("data-msg");
    if (dm) {
      dm.textContent = "Local data cleared. Reloading…";
      dm.classList.remove("hidden");
    }
    setTimeout(function () {
      window.location.reload();
    }, 600);
  }

  function init() {
    load();

    document.querySelectorAll(".settings-nav button").forEach(function (btn) {
      btn.addEventListener("click", function () {
        showPanel(btn.getAttribute("data-panel"));
      });
    });

    document.getElementById("save-account").addEventListener("click", saveAccount);
    document.getElementById("save-notif").addEventListener("click", saveNotif);
    var se = document.getElementById("save-explorer");
    if (se) se.addEventListener("click", saveExplorer);
    var ex = document.getElementById("btn-settings-export");
    if (ex) ex.addEventListener("click", exportLocalData);
    var cl = document.getElementById("btn-clear-local");
    if (cl) cl.addEventListener("click", clearAllLocal);

    document.getElementById("theme-light").addEventListener("change", function () {
      if (this.checked) applyTheme("light");
    });
    document.getElementById("theme-dark").addEventListener("change", function () {
      if (this.checked) applyTheme("dark");
    });
    var ts = document.getElementById("theme-system");
    if (ts) {
      ts.addEventListener("change", function () {
        if (this.checked) applyTheme("system");
      });
    }

    showPanel("account");
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
