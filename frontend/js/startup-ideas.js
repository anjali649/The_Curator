(function () {
  var ideas = [];

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
        category: d.category || "General",
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
        category: "Community",
      };
    });

    return mappedDataset.concat(mappedCommunity);
  }

  function renderCards() {
    var grid = document.getElementById("ideas-grid");
    if (!grid) return;
    if (!ideas.length) {
      grid.innerHTML =
        '<article class="card"><h3 class="idea-card__h">No startup ideas yet</h3><p class="idea-card__desc">No live startup ideas are available in the dashboard source right now.</p></article>';
      return;
    }
    grid.innerHTML = ideas
      .map(function (idea) {
        return (
          '<article class="idea-card idea-card--dataset">' +
          '<a class="idea-card__view" href="/startup-idea.html?id=' +
          encodeURIComponent(idea.id) +
          '" aria-label="Open ' +
          idea.title +
          ' details">' +
          '<h3 class="idea-card__h">' +
          idea.title +
          "</h3>" +
          '<p class="idea-card__desc">' +
          idea.description +
          "</p>" +
          "</a>" +
          "</article>"
        );
      })
      .join("");
  }

  function boot() {
    if (typeof CuratorAPI === "undefined" || !CuratorAPI.getStartupIdeasCatalog) {
      renderCards();
      return;
    }
    CuratorAPI.getStartupIdeasCatalog()
      .then(function (data) {
        ideas = mapLiveData(data);
        renderCards();
      })
      .catch(function () {
        ideas = [];
        renderCards();
      });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
