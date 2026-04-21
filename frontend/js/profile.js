(function () {
  var FIRST_VISIT_KEY = "curator_first_visit";

  function esc(s) {
    var d = document.createElement("div");
    d.textContent = s == null ? "" : String(s);
    return d.innerHTML;
  }

  function ensureFirstVisit() {
    try {
      if (!localStorage.getItem(FIRST_VISIT_KEY)) {
        localStorage.setItem(FIRST_VISIT_KEY, new Date().toISOString());
      }
    } catch (e) {}
  }

  function loadProfile() {
    try {
      var raw = localStorage.getItem("curator_profile");
      if (!raw) return;
      var p = JSON.parse(raw);
      if (p.displayName) {
        var n = document.getElementById("profile-name");
        if (n) n.textContent = p.displayName;
        var ini = document.getElementById("profile-initials");
        if (ini) {
          var parts = p.displayName.trim().split(/\s+/);
          ini.textContent =
            parts.length >= 2
              ? (parts[0][0] + parts[1][0]).toUpperCase()
              : parts[0].slice(0, 2).toUpperCase();
        }
      }
      if (p.bio) {
        var b = document.getElementById("profile-bio");
        if (b) b.textContent = p.bio;
      }
      if (p.focus && String(p.focus).trim()) {
        var wrap = document.getElementById("profile-focus");
        var ft = document.getElementById("profile-focus-text");
        if (wrap && ft) {
          ft.textContent = String(p.focus).trim();
          wrap.classList.remove("hidden");
        }
      }
    } catch (e) {}
  }

  function renderStats() {
    var localCount = 0;
    try {
      var raw = localStorage.getItem("curator_my_ideas");
      if (raw) localCount = (JSON.parse(raw) || []).length;
    } catch (e) {}
    var elLocal = document.getElementById("stat-local-ideas");
    if (elLocal) elLocal.textContent = String(localCount);

    var up = 0;
    try {
      up = parseInt(localStorage.getItem("curator_upvotes_given") || "0", 10) || 0;
    } catch (e) {}
    var elUp = document.getElementById("stat-upvotes");
    if (elUp) elUp.textContent = String(up);

    var elSince = document.getElementById("stat-since");
    if (elSince) {
      try {
        var iso = localStorage.getItem(FIRST_VISIT_KEY);
        if (iso) {
          var d = new Date(iso);
          elSince.textContent = isNaN(d.getTime())
            ? "—"
            : d.toLocaleDateString(undefined, {
                year: "numeric",
                month: "short",
                day: "numeric",
              });
        } else {
          elSince.textContent = "—";
        }
      } catch (e) {
        elSince.textContent = "—";
      }
    }

    var elCat = document.getElementById("stat-catalog");
    if (elCat && typeof CuratorAPI !== "undefined" && CuratorAPI.getDashboardStats) {
      CuratorAPI.getDashboardStats()
        .then(function (s) {
          if (elCat && s && typeof s.total_problems === "number") {
            elCat.textContent = String(s.total_problems);
          }
        })
        .catch(function () {
          if (elCat) elCat.textContent = "?";
        });
    }
  }

  function exportLocalData() {
    var payload = {};
    try {
      [
        "curator_profile",
        "curator_my_ideas",
        "curator_upvotes_given",
        FIRST_VISIT_KEY,
        "curator_theme",
        "curator_notif_email",
        "curator_notif_cluster",
        "curator_voter_key",
        "curator_explorer_page_size",
        "curator_ask_ai_chips",
      ].forEach(function (k) {
        var v = localStorage.getItem(k);
        if (v != null) payload[k] = v;
      });
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

  function renderMyIdeas() {
    var el = document.getElementById("my-ideas");
    if (!el) return;
    try {
      var raw = localStorage.getItem("curator_my_ideas");
      var arr = raw ? JSON.parse(raw) : [];
      if (!arr.length) {
        el.innerHTML =
          '<p class="muted">No ideas recorded yet. <a href="/add-startup.html">Submit one</a>.</p>';
        return;
      }
      el.innerHTML = arr
        .slice()
        .reverse()
        .map(function (x) {
          return (
            '<div class="community-card">' +
            "<h4>" +
            esc(x.title) +
            "</h4>" +
            '<p class="muted" style="margin:0;font-size:0.8rem">Problem #' +
            esc(x.problem_id) +
            " · " +
            esc((x.at || "").slice(0, 10)) +
            '</p><p style="margin:0.5rem 0 0"><a href="/problems.html?id=' +
            encodeURIComponent(x.problem_id) +
            '">View problem →</a></p>' +
            "</div>"
          );
        })
        .join("");
    } catch (e) {
      el.innerHTML = '<p class="muted">Could not read local history.</p>';
    }
  }

  function renderCommunity() {
    var el = document.getElementById("community-feed");
    if (!el) return;
    CuratorAPI.getRecentSubmissions(12)
      .then(function (r) {
        var list = r.submissions || [];
        if (!list.length) {
          el.innerHTML = "<p class=\"muted\">No submissions yet.</p>";
          return;
        }
        el.innerHTML = list
          .map(function (s) {
            return (
              '<div class="community-card">' +
              "<h4>" +
              esc(s.title) +
              "</h4>" +
              '<p class="muted" style="margin:0.25rem 0 0;font-size:0.8rem">' +
              esc(s.problem_title || "") +
              "</p>" +
              '<p class="muted" style="margin:0.35rem 0 0;font-size:0.85rem">' +
              esc((s.description || "").slice(0, 160)) +
              (s.description && s.description.length > 160 ? "…" : "") +
              "</p>" +
              '<div class="upvote-row"><span class="muted">' +
              esc(s.upvotes) +
              " upvotes</span></div>" +
              "</div>"
            );
          })
          .join("");
      })
      .catch(function () {
        el.innerHTML = '<p class="muted">Could not load community feed.</p>';
      });
  }

  function renderJoinedStartups() {
    var el = document.getElementById("joined-startups");
    if (!el) return;

    var joined = {};
    try {
      var raw = localStorage.getItem("curator_startup_engagement_v1");
      var parsed = raw ? JSON.parse(raw) : {};
      joined = (parsed && parsed.collab) || {};
    } catch (e) {
      joined = {};
    }

    var joinedIds = Object.keys(joined).filter(function (id) {
      return !!joined[id];
    });
    if (!joinedIds.length) {
      el.innerHTML = '<p class="muted">You have not joined any startup yet.</p>';
      return;
    }

    CuratorAPI.getStartupIdeasCatalog()
      .then(function (r) {
        var mapped = [];
        (r.dataset_ideas || []).forEach(function (d) {
          mapped.push({
            id: "dataset-" + d.problem_id,
            title: d.problem_title || "Dataset startup idea",
            problem: d.problem_title || "Related problem",
            kind: "Dataset",
          });
        });
        (r.community_ideas || []).forEach(function (c) {
          mapped.push({
            id: "community-" + c.startup_id,
            title: c.title || "Community startup idea",
            problem: c.problem_title || "Related problem",
            kind: "Community",
          });
        });

        var byId = {};
        mapped.forEach(function (x) {
          byId[x.id] = x;
        });

        var rows = joinedIds
          .map(function (id) {
            return byId[id] || { id: id, title: id, problem: "Unknown problem", kind: "Startup" };
          })
          .reverse();

        el.innerHTML = rows
          .map(function (s) {
            return (
              '<div class="community-card">' +
              "<h4>" +
              esc(s.title) +
              "</h4>" +
              '<p class="muted" style="margin:0.25rem 0 0;font-size:0.8rem">' +
              esc(s.kind) +
              " · " +
              esc(s.problem) +
              '</p><p style="margin:0.55rem 0 0"><a href="/startup-idea.html?id=' +
              encodeURIComponent(s.id) +
              '">Open startup →</a></p>' +
              "</div>"
            );
          })
          .join("");
      })
      .catch(function () {
        el.innerHTML = '<p class="muted">Could not load joined startups right now.</p>';
      });
  }

  function init() {
    ensureFirstVisit();
    loadProfile();
    renderStats();
    renderMyIdeas();
    renderJoinedStartups();
    renderCommunity();
    var ex = document.getElementById("btn-export-local");
    if (ex) ex.addEventListener("click", exportLocalData);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
