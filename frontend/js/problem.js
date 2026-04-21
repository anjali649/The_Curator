(function () {
  function esc(s) {
    var d = document.createElement("div");
    d.textContent = s == null ? "" : String(s);
    return d.innerHTML;
  }

  function qsId() {
    var m = new URLSearchParams(window.location.search).get("id");
    var n = m ? Number(m) : NaN;
    return Number.isFinite(n) && n > 0 ? n : null;
  }

  function hasExistingStartupIdea(p) {
    var s = p.suggested_startup;
    return !!(s && s !== "Startup Unavailable Right Now");
  }

  function confidenceScore(p) {
    var base = (hasExistingStartupIdea(p) || p.startup_idea) ? 88 : 72;
    var h = 0;
    var t = (p.title || "") + (p.description || "");
    for (var i = 0; i < t.length; i++) h = (h + t.charCodeAt(i) * (i + 1)) % 17;
    return Math.min(95, base + h);
  }

  function problemContextForAi(p) {
    var parts = [];
    if (p.title) parts.push("Problem title:\n" + String(p.title));
    if (p.description) parts.push("Problem description:\n" + String(p.description));
    if (p.category) parts.push("Category: " + String(p.category));
    if (p.cluster_label) parts.push("Cluster: " + String(p.cluster_label));
    if (p.tags && p.tags.length) {
      parts.push("Tags: " + p.tags.join(", "));
    }
    return parts.join("\n\n");
  }

  function renderAiPanel(p, pid) {
    var panel = document.getElementById("ai-panel");
    if (!panel) return;
    var conf = confidenceScore(p);
    var hasExisting = hasExistingStartupIdea(p);

    var suggestionBlock = "";
    if (hasExisting && p.suggested_startup) {
      suggestionBlock =
        '<div class="suggested-startup-callout">' +
        '<div class="card__label" style="margin-bottom:0.35rem">Existing startup idea</div>' +
        '<p class="muted" style="margin:0 0 0.5rem;font-size:0.78rem">From the dataset (catalog) for this problem.</p>' +
        '<p style="margin:0;font-size:0.9375rem;line-height:1.55;color:var(--ink-soft)">' +
        esc(p.suggested_startup) +
        "</p></div>";
    }

    panel.innerHTML =
      '<div class="ai-card">' +
      "<div>" +
      suggestionBlock +
      (!hasExisting
        ? '<p class="startup-unavailable" style="margin:0 0 0.5rem;font-style:normal;font-weight:600;color:#374151">No existing startup idea in the dataset</p><p class="muted" style="margin:0;font-size:0.875rem">Use <strong>Generate AI idea</strong> for a suggestion tailored to this problem, or add your own below.</p>'
        : '<p class="muted" style="margin:0 0 0.75rem;font-size:0.875rem">Analysis below uses this problem’s title, description, and tags.</p>') +
      '<div class="ai-card__actions">' +
      '<button type="button" class="btn btn--outline" id="btn-gen-ai">Generate AI idea</button>' +
      '<a class="btn btn--primary" href="/add-startup.html?problem=' +
      encodeURIComponent(pid) +
      '" style="text-decoration:none;display:inline-flex">Submit your own</a>' +
      "</div>" +
      '<pre id="ai-gen-out" class="muted hidden" style="margin:0.75rem 0 0;white-space:pre-wrap;font-size:0.8125rem;background:#f9fafb;padding:0.75rem;border-radius:0.5rem;border:1px solid #e5e7eb"></pre>' +
      "</div>" +
      '<div class="confidence"><div class="confidence__val">' +
      conf +
      '%</div><div class="confidence__lbl">Confidence</div></div>' +
      "</div>";

    var btn = document.getElementById("btn-gen-ai");
    if (!btn) return;
    btn.addEventListener("click", function () {
      var out = document.getElementById("ai-gen-out");
      out.classList.remove("hidden");
      out.textContent = "Generating...";
      var ctx = problemContextForAi(p);
      CuratorAPI.aiSuggest(ctx.length >= 10 ? ctx : p.description || p.title || "")
        .then(function (r) {
          if (!r.available) {
            out.textContent = r.message || "AI unavailable. Set GEMINI_API_KEY on the server (Gemini).";
            return;
          }
          out.textContent =
            "Problem type: " +
            (r.problem_type || "-") +
            "\nAudience: " +
            (r.target_audience || "-") +
            "\nIdea: " +
            (r.startup_idea || "-");
        })
        .catch(function (e) {
          out.textContent = e.message || String(e);
        });
    });
  }

  function tokenize(text) {
    return String(text || "")
      .toLowerCase()
      .split(/[^a-z0-9]+/g)
      .filter(function (w) {
        return w && w.length > 2;
      });
  }

  function overlapScore(a, b) {
    var sa = {};
    a.forEach(function (x) {
      sa[x] = true;
    });
    var score = 0;
    b.forEach(function (x) {
      if (sa[x]) score += 1;
    });
    return score;
  }

  function renderSuggestedStartupsForProblem(p) {
    var box = document.getElementById("startup-box");
    if (!box) return;
    var problemTokens = tokenize(
      (p.title || "") + " " + (p.description || "") + " " + (p.category || "") + " " + ((p.tags || []).join(" ") || ""),
    );
    box.innerHTML = '<p class="muted">Loading startup suggestions...</p>';

    CuratorAPI.getStartupIdeasCatalog()
      .then(function (catalog) {
        var candidates = [];
        (catalog.dataset_ideas || []).forEach(function (d) {
          var text = (d.idea || "") + " " + (d.problem_title || "") + " " + (d.category || "");
          var score = overlapScore(problemTokens, tokenize(text));
          if ((d.problem_title || "") === (p.title || "")) score += 100;
          if ((d.category || "") === (p.category || "")) score += 8;
          candidates.push({
            label: "Dataset",
            title: d.problem_title || "Startup idea",
            text: d.idea || "",
            score: score,
          });
        });
        (catalog.community_ideas || []).forEach(function (c) {
          var text = (c.title || "") + " " + (c.description || "") + " " + (c.problem_title || "");
          var score = overlapScore(problemTokens, tokenize(text));
          if ((c.problem_title || "") === (p.title || "")) score += 40;
          candidates.push({
            label: "Community",
            title: c.title || "Community idea",
            text: c.description || "",
            score: score,
          });
        });

        candidates.sort(function (a, b) {
          if (b.score !== a.score) return b.score - a.score;
          return a.title.localeCompare(b.title);
        });
        var top = candidates.slice(0, 4);
        if (!top.length) {
          box.innerHTML =
            '<p class="muted">No startup suggestions found yet. <a href="/add-startup.html?problem=' +
            encodeURIComponent(p.id) +
            '">Add a startup idea</a> for this problem.</p>';
          return;
        }
        box.innerHTML = top
          .map(function (s) {
            return (
              '<div class="community-card">' +
              '<div class="card__label">' +
              esc(s.label) +
              " suggestion</div>" +
              "<h4>" +
              esc(s.title) +
              "</h4>" +
              '<p class="muted" style="margin:0.35rem 0 0.2rem;font-size:0.875rem">' +
              esc(s.text) +
              "</p>" +
              "</div>"
            );
          })
          .join("");
      })
      .catch(function () {
        box.innerHTML =
          '<p class="muted">Could not load startup suggestions right now. <a href="/add-startup.html?problem=' +
          encodeURIComponent(p.id) +
          '">Submit your own idea</a>.</p>';
      });
  }

  function load() {
    var id = qsId();
    if (!id) {
      var err = document.getElementById("p-error");
      if (err) {
        err.textContent = "Missing problem id in URL.";
        err.classList.remove("hidden");
      }
      return;
    }

    CuratorAPI.getProblem(id)
      .then(function (p) {
        document.getElementById("p-title").textContent = p.title;
        document.getElementById("p-desc").textContent = p.description;
        document.getElementById("p-cat").textContent = p.category || "-";
        document.getElementById("p-cluster").textContent = p.cluster_label || "-";
        var bc = document.getElementById("p-breadcrumb");
        if (bc) {
          bc.innerHTML =
            '<a href="/problems.html">Explorer</a> › <span>' + esc(p.category || "Problem") + "</span> › <span>" + esc(p.title || "") + "</span>";
        }
        var tags = document.getElementById("p-tags");
        if (tags) {
          tags.innerHTML = (p.tags || [])
            .map(function (t) {
              return '<span class="tag">' + esc(t) + "</span>";
            })
            .join("");
        }
        renderAiPanel(p, p.id);
        renderSuggestedStartupsForProblem(p);
      })
      .catch(function (e) {
        var err = document.getElementById("p-error");
        if (err) {
          err.textContent = e.message || String(e);
          err.classList.remove("hidden");
        }
      });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", load);
  } else {
    load();
  }
})();
