(function () {
  var STORAGE_KEY = "curator_startup_engagement_v1";
  var currentIdea = null;
  var allIdeas = [];

  function qsId() {
    return new URLSearchParams(window.location.search).get("id");
  }

  function esc(s) {
    var d = document.createElement("div");
    d.textContent = s == null ? "" : String(s);
    return d.innerHTML;
  }

  function mapLiveData(data) {
    var ds = (data && data.dataset_ideas) || [];
    var cm = (data && data.community_ideas) || [];

    var mappedDataset = ds.map(function (d) {
      var detail = (d.idea || "").trim();
      return {
        id: "dataset-" + d.problem_id,
        kind: "dataset",
        problemId: d.problem_id,
        title: d.problem_title || "Dataset startup idea",
        description: detail || "Built-in startup idea from dataset.",
        detailedDescription: detail || "Built-in startup idea from dataset.",
        category: d.category || "General",
        problem: d.problem_title || "Related problem",
        upvotes: 0,
      };
    });

    var mappedCommunity = cm.map(function (c) {
      var detail = (c.description || "").trim();
      return {
        id: "community-" + c.startup_id,
        kind: "community",
        problemId: c.problem_id,
        startupId: c.startup_id,
        title: c.title || "Community startup idea",
        description: detail || "Community-submitted startup idea.",
        detailedDescription: detail || "Community-submitted startup idea.",
        category: "Community",
        problem: c.problem_title || "Related problem",
        upvotes: Number(c.upvotes || 0),
      };
    });

    return mappedDataset.concat(mappedCommunity);
  }

  function readStore() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return { votes: {}, bookmarks: {}, comments: {}, collab: {} };
      var parsed = JSON.parse(raw);
      return {
        votes: parsed.votes || {},
        bookmarks: parsed.bookmarks || {},
        comments: parsed.comments || {},
        collab: parsed.collab || {},
      };
    } catch (_) {
      return { votes: {}, bookmarks: {}, comments: {}, collab: {} };
    }
  }

  function writeStore(store) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
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
    var seen = {};
    a.forEach(function (x) {
      seen[x] = true;
    });
    var score = 0;
    b.forEach(function (x) {
      if (seen[x]) score += 1;
    });
    return score;
  }

  function renderSimilarIdeas(idea) {
    var host = document.getElementById("s-similar-ideas");
    if (!host) return;
    var seedTokens = tokenize((idea.title || "") + " " + (idea.description || "") + " " + (idea.problem || ""));
    var rows = allIdeas
      .filter(function (x) {
        return String(x.id) !== String(idea.id);
      })
      .map(function (x) {
        var score = overlapScore(seedTokens, tokenize((x.title || "") + " " + (x.description || "") + " " + (x.problem || "")));
        if ((x.category || "") === (idea.category || "")) score += 3;
        return { item: x, score: score };
      })
      .sort(function (a, b) {
        return b.score - a.score;
      })
      .slice(0, 3);

    if (!rows.length) {
      host.innerHTML = '<p class="muted">No similar ideas found yet.</p>';
      return;
    }
    host.innerHTML = rows
      .map(function (row) {
        return (
          '<a class="startup-similar-item" href="/startup-idea.html?id=' +
          encodeURIComponent(row.item.id) +
          '">' +
          "<strong>" +
          esc(row.item.title) +
          "</strong>" +
          '<span class="muted">' +
          esc((row.item.description || "").slice(0, 90)) +
          "</span>" +
          "</a>"
        );
      })
      .join("");
  }

  function enrichDetailedDescriptionFromDataset(idea) {
    var longEl = document.getElementById("s-long");
    var ctxEl = document.getElementById("s-dataset-context");
    if (!longEl || !ctxEl) return;

    var fallback = idea.detailedDescription || idea.description || "-";
    longEl.textContent = fallback;
    ctxEl.textContent = "Loading dataset context...";

    if (typeof CuratorAPI === "undefined" || !CuratorAPI.getStartupDetail) {
      ctxEl.textContent = "Dataset context is unavailable right now.";
      return;
    }
    if (!idea.problemId || !idea.kind) {
      ctxEl.textContent = "No linked dataset metadata found for this startup.";
      return;
    }

    CuratorAPI.getStartupDetail({
      kind: idea.kind,
      problem_id: idea.problemId,
      startup_id: idea.startupId,
    })
      .then(function (res) {
        var startup = (res && res.startup) || {};
        var primary = (res && res.primary_problem) || {};
        var related = ((res && res.related_problems) || []).filter(function (r) {
          return Number(r.id) !== Number(primary.id);
        });

        var detailedParts = [];
        if (startup.description) detailedParts.push(String(startup.description).trim());
        if (primary.description) {
          detailedParts.push("Problem context: " + String(primary.description).trim());
        }
        if (related.length) {
          detailedParts.push(
            "Related pain points: " +
              related
                .slice(0, 2)
                .map(function (r) {
                  return String(r.title || "").trim();
                })
                .filter(Boolean)
                .join("; "),
          );
        }
        if (detailedParts.length) longEl.textContent = detailedParts.join("\n\n");

        var tags = primary.tags || startup.tags || [];
        var relatedHtml = related.length
          ? '<ul class="startup-data-context__list">' +
            related
              .slice(0, 4)
              .map(function (r) {
                return (
                  "<li>" +
                  '<a href="/problem.html?id=' +
                  encodeURIComponent(r.id) +
                  '">' +
                  esc(r.title || ("Problem #" + r.id)) +
                  "</a>" +
                  "</li>"
                );
              })
              .join("") +
            "</ul>"
          : '<p class="muted" style="margin:0.35rem 0 0">No related problems found in dataset.</p>';

        ctxEl.innerHTML =
          '<div class="card__label">Dataset context</div>' +
          '<p style="margin:0.35rem 0 0"><strong>Primary problem:</strong> ' +
          esc(primary.title || idea.problem || "N/A") +
          "</p>" +
          '<p style="margin:0.3rem 0 0"><strong>Category:</strong> ' +
          esc(primary.category || startup.category || idea.category || "General") +
          "</p>" +
          (tags && tags.length
            ? '<p style="margin:0.3rem 0 0"><strong>Tags:</strong> ' +
              esc(tags.join(", ")) +
              "</p>"
            : "") +
          '<div style="margin-top:0.45rem"><strong>Related problems:</strong></div>' +
          relatedHtml;
      })
      .catch(function () {
        ctxEl.textContent = "Could not load dataset context right now.";
      });
  }

  function renderVotes(idea, store) {
    var vote = store.votes[idea.id] || 0;
    var total = Math.max(0, Number(idea.upvotes || 0) + vote);
    var countEl = document.getElementById("s-upvote-count");
    if (countEl) countEl.textContent = total + " upvotes";
  }

  function renderBookmark(idea, store) {
    var btn = document.getElementById("s-bookmark-btn");
    if (!btn) return;
    var saved = !!store.bookmarks[idea.id];
    btn.textContent = saved ? "✅ Saved" : "⭐ Save Idea";
  }

  function renderComments(idea, store) {
    var host = document.getElementById("s-comments");
    if (!host) return;
    var comments = store.comments[idea.id] || [];
    if (!comments.length) {
      host.innerHTML = '<p class="muted">No feedback yet. Be the first to comment.</p>';
      return;
    }
    host.innerHTML = comments
      .slice()
      .reverse()
      .map(function (c) {
        return '<article class="startup-comment-item"><p>' + esc(c.text) + "</p></article>";
      })
      .join("");
  }

  function renderCollab(idea, store) {
    var joined = !!store.collab[idea.id];
    var count = Object.keys(store.collab).filter(function (k) {
      return store.collab[k] && k === idea.id;
    }).length;
    var btn = document.getElementById("s-collab-btn");
    var label = document.getElementById("s-collab-count");
    if (btn) btn.textContent = joined ? "Joined ✅" : "Join this Startup";
    if (label) label.textContent = count + " people want to collaborate";
  }

  function wireEngagement(idea) {
    var store = readStore();
    renderVotes(idea, store);
    renderBookmark(idea, store);
    renderComments(idea, store);
    renderCollab(idea, store);
    renderSimilarIdeas(idea);

    var upBtn = document.getElementById("s-upvote-btn");
    if (upBtn) {
      upBtn.onclick = function () {
        var s = readStore();
        s.votes[idea.id] = Math.min(1, Number(s.votes[idea.id] || 0) + 1);
        writeStore(s);
        renderVotes(idea, s);
      };
    }
    var downBtn = document.getElementById("s-downvote-btn");
    if (downBtn) {
      downBtn.onclick = function () {
        var s = readStore();
        s.votes[idea.id] = Math.max(-1, Number(s.votes[idea.id] || 0) - 1);
        writeStore(s);
        renderVotes(idea, s);
      };
    }
    var bookmarkBtn = document.getElementById("s-bookmark-btn");
    if (bookmarkBtn) {
      bookmarkBtn.onclick = function () {
        var s = readStore();
        s.bookmarks[idea.id] = !s.bookmarks[idea.id];
        writeStore(s);
        renderBookmark(idea, s);
      };
    }
    var collabBtn = document.getElementById("s-collab-btn");
    if (collabBtn) {
      collabBtn.onclick = function () {
        var s = readStore();
        s.collab[idea.id] = !s.collab[idea.id];
        writeStore(s);
        renderCollab(idea, s);
      };
    }
    var form = document.getElementById("s-comment-form");
    var input = document.getElementById("s-comment-input");
    if (form && input) {
      form.onsubmit = function (e) {
        e.preventDefault();
        var text = (input.value || "").trim();
        if (!text) return;
        var s = readStore();
        if (!s.comments[idea.id]) s.comments[idea.id] = [];
        s.comments[idea.id].push({ text: text, ts: Date.now() });
        writeStore(s);
        input.value = "";
        renderComments(idea, s);
      };
    }
  }

  function render(idea) {
    currentIdea = idea;
    document.getElementById("s-title").textContent = idea.title || "Startup idea";
    document.getElementById("s-description").textContent = idea.description || "-";
    document.getElementById("s-category").textContent = idea.category || "-";
    document.getElementById("s-category-badge").textContent = idea.category || "General";
    document.getElementById("s-problem").textContent = idea.problem || "-";

    var bc = document.getElementById("s-breadcrumb");
    if (bc) {
      bc.innerHTML =
        '<a href="/startup-ideas.html">Ideas</a> › <span>' + esc((idea.title || "Startup idea").slice(0, 72)) + "</span>";
    }

    enrichDetailedDescriptionFromDataset(idea);
    wireEngagement(idea);
  }

  function setError(message) {
    var err = document.getElementById("startup-error");
    if (!err) return;
    err.textContent = message;
    err.classList.remove("hidden");
  }

  function boot() {
    var id = qsId();
    if (!id) {
      setError("Missing startup id in URL.");
      return;
    }

    if (typeof CuratorAPI === "undefined" || !CuratorAPI.getStartupIdeasCatalog) {
      setError("Startup API is not available.");
      return;
    }

    CuratorAPI.getStartupIdeasCatalog()
      .then(function (data) {
        allIdeas = mapLiveData(data);
        var idea =
          allIdeas.find(function (x) {
            return String(x.id) === String(id);
          }) || null;
        if (!idea) {
          setError("Startup not found.");
          return;
        }
        render(idea);
      })
      .catch(function (e) {
        setError(e && e.message ? e.message : "Could not load startup details right now.");
      });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
