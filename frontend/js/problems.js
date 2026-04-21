 (function () {
  var PAGE_SIZE = 9;
  try {
    var _ps = parseInt(localStorage.getItem("curator_explorer_page_size") || "9", 10);
    if ([6, 9, 12, 18].indexOf(_ps) >= 0) PAGE_SIZE = _ps;
  } catch (e) {}
  var currentPage = 1;
  var lastList = [];
  var activeCategory = "";

  function esc(s) {
    var d = document.createElement("div");
    d.textContent = s == null ? "" : String(s);
    return d.innerHTML;
  }

  function renderCard(p) {
    var has = p.has_builtin_startup ? "Built-in idea" : "No built-in idea";
    var href = "/problem.html?id=" + encodeURIComponent(p.id);
    return (
      '<article class="problem-card" tabindex="0" data-id="' +
      p.id +
      '" data-href="' +
      href +
      '">' +
      '<div class="problem-card__tags">' +
      '<span class="tag">' +
      esc(p.category || "") +
      "</span>" +
      (p.cluster_label
        ? '<span class="tag" style="background:#f3f4f6;color:#4b5563">' +
          esc(p.cluster_label) +
          "</span>"
        : "") +
      "</div>" +
      "<h2>" +
      esc(p.title) +
      "</h2>" +
      "<p>" +
      esc(p.description) +
      "</p>" +
      '<div class="problem-card__meta">' +
      "<span>" +
      esc(has) +
      "</span>" +
      '<a href="' +
      href +
      '">Analyze →</a>' +
      "</div>" +
      "</article>"
    );
  }

  function fillSelect(select, items, placeholder) {
    select.innerHTML = "";
    var o0 = document.createElement("option");
    o0.value = "";
    o0.textContent = placeholder;
    select.appendChild(o0);
    items.forEach(function (x) {
      var o = document.createElement("option");
      o.value = x;
      o.textContent = x;
      select.appendChild(o);
    });
  }

  function getSearchQuery() {
    var inp = document.getElementById("global-search");
    return inp && inp.value.trim() ? inp.value.trim() : undefined;
  }

  function renderPagination() {
    var el = document.getElementById("pagination");
    if (!el) return;
    var total = lastList.length;
    var pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
    if (currentPage > pages) currentPage = pages;
    if (total === 0) {
      el.classList.add("hidden");
      return;
    }
    el.classList.remove("hidden");
    el.innerHTML =
      '<button type="button" id="pg-prev" class="pagination__nav"' +
      (currentPage <= 1 ? " disabled" : "") +
      ">Prev</button>" +
      '<span class="pagination__meta" id="pg-meta">Page ' +
      currentPage +
      " of " +
      pages +
      "</span>" +
      '<button type="button" id="pg-next" class="pagination__nav"' +
      (currentPage >= pages ? " disabled" : "") +
      ">Next</button>";

    document.getElementById("pg-prev").onclick = function () {
      if (currentPage > 1) {
        currentPage--;
        renderGridPage();
      }
    };
    document.getElementById("pg-next").onclick = function () {
      if (currentPage < pages) {
        currentPage++;
        renderGridPage();
      }
    };
  }

  function renderGridPage() {
    var grid = document.getElementById("problem-grid");
    var start = (currentPage - 1) * PAGE_SIZE;
    var slice = lastList.slice(start, start + PAGE_SIZE);
    if (slice.length === 0) {
      grid.innerHTML = '<p class="muted">No problems match your filters.</p>';
    } else {
      grid.innerHTML = slice.map(renderCard).join("");
    }
    renderPagination();
  }

  function loadProblems() {
    var grid = document.getElementById("problem-grid");
    var cl = document.getElementById("filter-cluster");
    var err = document.getElementById("prob-error");
    if (err) err.classList.add("hidden");

    CuratorAPI.getProblems({
      category: activeCategory || undefined,
      cluster: cl && cl.value ? cl.value : undefined,
      search: getSearchQuery(),
    })
      .then(function (res) {
        lastList = res.problems || [];
        currentPage = 1;
        renderGridPage();
      })
      .catch(function (e) {
        if (err) {
          err.textContent = e.message || String(e);
          err.classList.remove("hidden");
        }
      });
  }

  function buildPills(categories) {
    var row = document.getElementById("category-pills");
    if (!row) return;
    var pills = [
      { label: "All problems", value: "" },
    ].concat(
      (categories || []).map(function (c) {
        return { label: c, value: c };
      }),
    );
    row.innerHTML = pills
      .map(function (p) {
        return (
          '<button type="button" class="pill' +
          (activeCategory === p.value ? " is-active" : "") +
          '" data-cat="' +
          esc(p.value) +
          '">' +
          esc(p.label) +
          "</button>"
        );
      })
      .join("");

    row.querySelectorAll(".pill").forEach(function (btn) {
      btn.addEventListener("click", function () {
        activeCategory = btn.getAttribute("data-cat") || "";
        row.querySelectorAll(".pill").forEach(function (b) {
          b.classList.toggle("is-active", b === btn);
        });
        loadProblems();
      });
    });
  }

  function loadMeta() {
    return Promise.all([
      CuratorAPI.getCategories(),
      CuratorAPI.getClusters(),
      CuratorAPI.getTrending(),
    ]).then(function (results) {
      var cats = results[0];
      var clusters = results[1];
      var trend = results[2];

      buildPills(cats.categories || []);

      fillSelect(
        document.getElementById("filter-cluster"),
        clusters.clusters || [],
        "All clusters",
      );

      var wrap = document.getElementById("trending-links");
      if (wrap && trend.trending) {
        wrap.innerHTML = trend.trending
          .map(function (p) {
            return (
              '<a href="/problem.html?id=' +
              encodeURIComponent(p.id) +
              '">' +
              esc(p.title) +
              "</a>"
            );
          })
          .join("");
      }
    });
  }

  function init() {
    try {
      if (localStorage.getItem("curator_explorer_compact") === "1") {
        var g = document.getElementById("problem-grid");
        if (g) g.classList.add("problem-grid--compact");
      }
    } catch (e) {}

    var params = new URLSearchParams(window.location.search);
    var qs = params.get("search");
    if (qs) {
      var inp = document.getElementById("global-search");
      if (inp) inp.value = qs;
    }
    var qc = params.get("category");
    if (qc) activeCategory = qc;

    loadMeta()
      .then(function () {
        if (qc) {
          document.querySelectorAll("#category-pills .pill").forEach(function (b) {
            b.classList.toggle("is-active", (b.getAttribute("data-cat") || "") === qc);
          });
        }
        loadProblems();
      })
      .catch(function () {
        loadProblems();
      });

    document.getElementById("btn-apply").addEventListener("click", function (e) {
      e.preventDefault();
      loadProblems();
    });

    function focusExplorerSearch() {
      var inp = document.getElementById("global-search");
      if (inp) inp.focus();
    }

    if (window.location.hash === "#explorer-search") {
      requestAnimationFrame(focusExplorerSearch);
    }

    window.addEventListener("hashchange", function () {
      if (window.location.hash === "#explorer-search") {
        focusExplorerSearch();
      }
    });

  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
