(function () {
  var categoryChart;
  var dashContext = "";

  function destroyChart(ref) {
    if (ref) ref.destroy();
  }

  function palette(i) {
    var colors = [
      "#4f46e5",
      "#7c3aed",
      "#2563eb",
      "#0891b2",
      "#059669",
      "#ca8a04",
      "#ea580c",
      "#dc2626",
    ];
    return colors[i % colors.length];
  }

  function esc(s) {
    var d = document.createElement("div");
    d.textContent = s == null ? "" : String(s);
    return d.innerHTML;
  }

  function buildDashboardContext(data) {
    var ins = data.insights || {};
    var top = data.top_opportunities || [];
    var parts = [
      "Problems analyzed: " + (data.total_problems || 0),
      "Startups generated (dataset + community): " + (data.total_startups || 0),
      "Unsolved problems: " + (data.unsolved_problems || 0),
      "Dominant category: " + (ins.dominant_category || "n/a"),
      "Least-covered category: " + (ins.least_solved_category || "n/a"),
    ];
    if (top.length) {
      parts.push(
        "Top opportunities: " +
          top
            .slice(0, 5)
            .map(function (x) {
              return x.category + "=" + x.score;
            })
            .join(", "),
      );
    }
    var em = ins.emerging_clusters || [];
    if (em.length) parts.push("Niche clusters: " + em.join(", "));
    return parts.join(" ") + " Bar chart shows problem count by category.";
  }

  function renderAiSummary(data) {
    var el = document.getElementById("dash-ai-blurb");
    if (!el) return;
    var ins = data.insights || {};
    var unsolved = data.unsolved_problems || 0;
    var total = data.total_problems || 0;
    var startups = data.total_startups || 0;
    var dom = ins.dominant_category || "—";
    var least = ins.least_solved_category || "—";
    el.textContent =
      "The catalog contains " +
      total +
      " analyzed problems. " +
      startups +
      " startup directions exist (built-in dataset ideas plus community submissions). " +
      unsolved +
      " problems still have no solution path — strongest build signal. " +
      "The largest theme is " +
      dom +
      "; the category with the most remaining gap vs coverage is " +
      least +
      ". Use Top opportunities and Recommended areas to pick where to act first.";
  }

  function renderTopOpportunities(data) {
    var host = document.getElementById("dash-opportunities");
    if (!host) return;
    var rows = data.top_opportunities || [];
    if (!rows.length) {
      host.innerHTML = "<li class=\"muted\">No category data yet.</li>";
      return;
    }
    host.innerHTML = rows
      .slice(0, 6)
      .map(function (r) {
        return (
          "<li><span>" +
          esc(r.category) +
          '</span><strong>' +
          esc(String(r.score)) +
          "</strong></li>"
        );
      })
      .join("");
  }

  function renderRecommendedAreas(data) {
    var host = document.getElementById("dash-ai-areas");
    if (!host) return;
    var ins = data.insights || {};
    var chips = [];
    if (ins.dominant_category && ins.dominant_category !== "—") {
      chips.push({ label: ins.dominant_category, sub: "Largest volume" });
    }
    if (ins.least_solved_category && ins.least_solved_category !== "—") {
      chips.push({ label: ins.least_solved_category, sub: "Most gap" });
    }
    (ins.emerging_clusters || []).forEach(function (c) {
      chips.push({ label: c, sub: "Niche cluster" });
    });
    if (!chips.length) {
      host.innerHTML = '<span class="dashboard-chip muted">No recommendations yet</span>';
      return;
    }
    host.innerHTML = chips
      .slice(0, 6)
      .map(function (c) {
        return (
          '<span class="dashboard-chip" title="' +
          esc(c.sub) +
          '">' +
          esc(c.label) +
          "</span>"
        );
      })
      .join("");
  }

  function renderRecentActivity() {
    var host = document.getElementById("dash-recent");
    if (!host || typeof CuratorAPI === "undefined" || !CuratorAPI.getRecentSubmissions) {
      return;
    }
    CuratorAPI.getRecentSubmissions(5)
      .then(function (r) {
        var list = r.submissions || [];
        if (!list.length) {
          host.innerHTML = '<p class="muted">No community submissions yet.</p>';
          return;
        }
        host.innerHTML = list
          .map(function (s) {
            return (
              '<div class="dashboard-recent-row">' +
              '<span class="dashboard-recent-prob">' +
              esc(s.problem_title || "Problem") +
              "</span>" +
              '<span class="dashboard-recent-arrow" aria-hidden="true">→</span>' +
              "<span>" +
              esc(s.title || "Startup") +
              "</span>" +
              "</div>"
            );
          })
          .join("");
      })
      .catch(function () {
        host.innerHTML = '<p class="muted">Could not load recent activity.</p>';
      });
  }

  function renderTrendingStartups() {
    var host = document.getElementById("dash-trending");
    if (!host || typeof CuratorAPI === "undefined" || !CuratorAPI.getStartupIdeasCatalog) {
      return;
    }
    CuratorAPI.getStartupIdeasCatalog()
      .then(function (r) {
        var community = (r.community_ideas || []).slice();
        community.sort(function (a, b) {
          return (b.upvotes || 0) - (a.upvotes || 0);
        });
        var top = community.slice(0, 6);
        if (!top.length) {
          host.innerHTML =
            '<p class="muted">No community startups yet. <a href="/add-startup.html">Submit one</a>.</p>';
          return;
        }
        host.innerHTML = top
          .map(function (c) {
            var id = "community-" + c.startup_id;
            var votes = c.upvotes != null ? c.upvotes : 0;
            return (
              '<a class="dashboard-trend-row" href="/startup-idea.html?id=' +
              encodeURIComponent(id) +
              '">' +
              "<span>" +
              esc(c.title || "Startup") +
              "</span>" +
              '<span class="dashboard-trend-meta">❤️ ' +
              esc(String(votes)) +
              " interested</span>" +
              "</a>"
            );
          })
          .join("");
      })
      .catch(function () {
        host.innerHTML = '<p class="muted">Could not load trending startups.</p>';
      });
  }

  function fillCategoryFilter() {
    var sel = document.getElementById("dash-category-select");
    if (!sel || typeof CuratorAPI === "undefined" || !CuratorAPI.getCategories) return;
    CuratorAPI.getCategories()
      .then(function (r) {
        var cats = (r && r.categories) || [];
        cats.forEach(function (c) {
          var o = document.createElement("option");
          o.value = c;
          o.textContent = c;
          sel.appendChild(o);
        });
      })
      .catch(function () {});
  }

  function renderCategoryChart(data) {
    var cat = data.category_distribution || {};
    var catLabels = Object.keys(cat);
    var catValues = catLabels.map(function (k) {
      return cat[k];
    });

    destroyChart(categoryChart);
    var ctx1 = document.getElementById("chart-categories");
    if (ctx1) {
      categoryChart = new Chart(ctx1, {
        type: "bar",
        data: {
          labels: catLabels,
          datasets: [
            {
              label: "Problems",
              data: catValues,
              backgroundColor: catLabels.map(function (_, i) {
                return palette(i);
              }),
              borderRadius: 6,
            },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { display: false } },
          scales: {
            y: { beginAtZero: true, ticks: { precision: 0 } },
          },
        },
      });
    }
  }

  function initProblemSolver() {
    var form = document.getElementById("dash-problem-solver-form");
    var input = document.getElementById("dash-problem-solver-input");
    var submitBtn = document.getElementById("dash-problem-solver-submit");
    var clearBtn = document.getElementById("dash-problem-solver-clear");
    var msg = document.getElementById("dash-problem-solver-msg");
    var result = document.getElementById("dash-problem-solver-result");
    if (!form || !input || !submitBtn || !clearBtn || !msg || !result) return;

    function setMessage(text, kind) {
      msg.textContent = text || "";
      msg.className = "msg";
      msg.classList.add(kind === "ok" ? "msg--ok" : "msg--error");
      if (!text) msg.classList.add("hidden");
    }

    function clearResult() {
      result.innerHTML = "";
      result.classList.add("hidden");
      setMessage("", "ok");
    }

    function renderSuggestion(data) {
      result.innerHTML =
        '<div class="dashboard-problem-solver__pill-row">' +
        '<span class="dashboard-chip">' +
        esc(data.problem_type || "General problem") +
        "</span>" +
        '<span class="dashboard-chip">' +
        esc(data.target_audience || "General audience") +
        "</span>" +
        "</div>" +
        '<h4 class="dashboard-problem-solver__title">Suggested startup solution</h4>' +
        '<p class="dashboard-problem-solver__idea">' +
        esc(data.startup_idea || "No startup idea returned.") +
        "</p>";
      result.classList.remove("hidden");
    }

    clearBtn.addEventListener("click", function () {
      input.value = "";
      clearResult();
      input.focus();
    });

    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var description = (input.value || "").trim();
      if (description.length < 10) {
        setMessage("Please enter at least 10 characters for the problem description.", "error");
        result.classList.add("hidden");
        return;
      }
      submitBtn.disabled = true;
      setMessage("Analyzing your problem and finding a startup solution...", "ok");
      result.classList.add("hidden");

      CuratorAPI.aiSuggest(description)
        .then(function (res) {
          if (res && res.available && res.startup_idea) {
            renderSuggestion(res);
            setMessage("Startup suggestion generated.", "ok");
            return;
          }
          setMessage(
            (res && res.message) ||
              "AI suggestion is unavailable right now. Please check API key/quota and try again.",
            "error",
          );
        })
        .catch(function (err) {
          setMessage(
            (err && err.message) || "Could not reach AI service. Ensure backend server is running.",
            "error",
          );
        })
        .finally(function () {
          submitBtn.disabled = false;
        });
    });
  }

  function render(data) {
    dashContext = buildDashboardContext(data);

    document.getElementById("m-analyzed").textContent = data.total_problems;
    document.getElementById("m-startups-gen").textContent = data.total_startups;
    document.getElementById("m-unsolved").textContent = data.unsolved_problems;

    renderAiSummary(data);
    renderTopOpportunities(data);
    renderRecommendedAreas(data);
    renderCategoryChart(data);
    renderRecentActivity();
    renderTrendingStartups();
  }

  function load() {
    var el = document.getElementById("dash-error");
    if (el) el.classList.add("hidden");
    fillCategoryFilter();
    CuratorAPI.getDashboardStats()
      .then(render)
      .catch(function (err) {
        if (el) {
          el.textContent = err.message || String(err);
          el.classList.remove("hidden");
        }
      });
  }

  function initAiChatDrawer() {
    var drawer = document.getElementById("ai-drawer");
    var backdrop = document.getElementById("ai-drawer-backdrop");
    var openBtn = document.getElementById("btn-open-ai-chat");
    var closeBtn = document.getElementById("btn-close-ai-chat");
    var form = document.getElementById("ai-chat-form");
    var input = document.getElementById("ai-chat-input");
    var messages = document.getElementById("ai-chat-messages");
    var sendBtn = document.getElementById("ai-chat-send");
    if (!drawer || !backdrop || !openBtn || !form || !input || !messages) return;

    function setOpen(open) {
      drawer.classList.toggle("is-open", open);
      backdrop.classList.toggle("hidden", !open);
      drawer.setAttribute("aria-hidden", open ? "false" : "true");
      backdrop.setAttribute("aria-hidden", open ? "false" : "true");
      document.body.style.overflow = open ? "hidden" : "";
      if (open) {
        setTimeout(function () {
          input.focus();
        }, 200);
      }
    }

    function appendBubble(role, text) {
      var div = document.createElement("div");
      div.className = "ai-chat-bubble ai-chat-bubble--" + role;
      div.textContent = text;
      messages.appendChild(div);
      messages.scrollTop = messages.scrollHeight;
    }

    function sendMessage(text) {
      var t = (text || "").trim();
      if (!t) return;
      appendBubble("user", t);
      input.value = "";
      sendBtn.disabled = true;
      var thinking = document.createElement("div");
      thinking.className = "ai-chat-bubble ai-chat-bubble--assistant ai-chat-bubble--thinking";
      thinking.textContent = "Thinking…";
      messages.appendChild(thinking);
      messages.scrollTop = messages.scrollHeight;
      CuratorAPI.aiChat(t, dashContext || undefined)
        .then(function (res) {
          thinking.remove();
          if (typeof res !== "object" || res === null) {
            appendBubble(
              "assistant",
              "Unexpected response. Open this app from http://127.0.0.1:8000 (run uvicorn) — not from Live Server or a local file.",
            );
            return;
          }
          if (res.available && res.reply) {
            appendBubble("assistant", res.reply);
          } else {
            appendBubble(
              "assistant",
              res.message ||
                "Ask AI failed. Open http://127.0.0.1:8000, set GEMINI_API_KEY in backend/.env, restart uvicorn.",
            );
          }
        })
        .catch(function (err) {
          thinking.remove();
          appendBubble(
            "assistant",
            (err && err.message) ||
              "Network error. Use http://127.0.0.1:8000 and keep uvicorn running.",
          );
        })
        .finally(function () {
          sendBtn.disabled = false;
        });
    }

    openBtn.addEventListener("click", function () {
      setOpen(true);
    });
    closeBtn.addEventListener("click", function () {
      setOpen(false);
    });
    backdrop.addEventListener("click", function () {
      setOpen(false);
    });
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      sendMessage(input.value);
    });
    drawer.querySelectorAll(".chip-btn").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var p = btn.getAttribute("data-prompt");
        if (p) sendMessage(p);
      });
    });
    document.addEventListener("keydown", function (e) {
      if (e.key !== "Escape") return;
      if (drawer.classList.contains("is-open")) setOpen(false);
    });
  }

  function boot() {
    load();
    initAiChatDrawer();
    initProblemSolver();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
