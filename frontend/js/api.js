/**
 * REST client.
 * When the page is opened from uvicorn (http://127.0.0.1:8000), use same origin.
 * When opened from Live Server (:5500), Vite, or file://, call the API on :8000.
 */
(function (global) {
  function resolveApiBase() {
    if (typeof window === "undefined") return "";
    var loc = window.location;
    if (loc.protocol === "file:") return "http://127.0.0.1:8000";
    var host = loc.hostname;
    var port = loc.port;
    if (host !== "localhost" && host !== "127.0.0.1") return "";
    if (port === "8000") return "";
    return "http://127.0.0.1:8000";
  }

  const BASE = resolveApiBase();

  async function api(path, options) {
    const res = await fetch(BASE + path, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...(options && options.headers),
      },
    });
    const text = await res.text();
    if (!res.ok) {
      throw new Error(text || res.statusText);
    }
    if (!text) return null;
    try {
      return JSON.parse(text);
    } catch {
      return text;
    }
  }

  global.CuratorAPI = {
    health: () => api("/health"),
    getDashboardStats: () => api("/dashboard-stats"),
    getProblems: (params) => {
      const q = new URLSearchParams();
      if (params && params.category) q.set("category", params.category);
      if (params && params.search) q.set("search", params.search);
      if (params && params.cluster) q.set("cluster", params.cluster);
      const s = q.toString();
      return api("/problems" + (s ? "?" + s : ""));
    },
    addProblem: (body) =>
      api("/problems", { method: "POST", body: JSON.stringify(body) }),
    getCategories: () => api("/categories"),
    getClusters: () => api("/clusters"),
    getTrending: () => api("/problems/trending?limit=8"),
    getProblem: (id) => api("/problem/" + encodeURIComponent(id)),
    addStartup: (body) =>
      api("/add-startup", { method: "POST", body: JSON.stringify(body) }),
    upvote: (startupId, voterKey) =>
      api("/startups/" + encodeURIComponent(startupId) + "/upvote", {
        method: "POST",
        body: JSON.stringify({ voter_key: voterKey }),
      }),
    aiSuggest: (description) =>
      api("/ai-suggest", {
        method: "POST",
        body: JSON.stringify({ problem_description: description }),
      }),
    aiChat: (message, context) =>
      api("/ai-chat", {
        method: "POST",
        body: JSON.stringify({
          message,
          ...(context ? { context } : {}),
        }),
      }),
    getRecentSubmissions: (limit) =>
      api("/recent-submissions" + (limit ? "?limit=" + encodeURIComponent(limit) : "")),
    getStartupIdeasCatalog: () => api("/startup-ideas"),
    getStartupDetail: (params) => {
      const q = new URLSearchParams();
      q.set("kind", params.kind);
      q.set("problem_id", params.problem_id);
      if (params.startup_id) q.set("startup_id", params.startup_id);
      return api("/startup-detail?" + q.toString());
    },
  };
})(typeof window !== "undefined" ? window : globalThis);
