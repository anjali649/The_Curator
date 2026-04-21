(function () {
  function isSdgProblem(p) {
    var t = (p.title || "").trim();
    return /^sdg\s*target\b/i.test(t);
  }

  function syncCustomProblemBlock() {
    var sel = document.getElementById("problem-select");
    var block = document.getElementById("custom-problem-block");
    if (!sel || !block) return;
    var own = sel.value === "__own__";
    block.classList.toggle("hidden", !own);
    autoFillProblemSolved();
  }

  function selectedProblemTitle() {
    var sel = document.getElementById("problem-select");
    if (!sel) return "";
    var v = sel.value || "";
    if (!v || v === "__own__") return "";
    var opt = sel.options[sel.selectedIndex];
    return (opt && opt.textContent ? String(opt.textContent) : "").trim();
  }

  function autoFillProblemSolved() {
    var ta = document.getElementById("problem-solved");
    if (!ta) return;
    if ((ta.value || "").trim()) return;
    var sel = document.getElementById("problem-select");
    if (!sel) return;
    if (sel.value === "__own__") {
      var t = document.getElementById("custom-problem-title");
      var d = document.getElementById("custom-problem-desc");
      var msg = [];
      if (t && t.value.trim()) msg.push(t.value.trim());
      if (d && d.value.trim()) msg.push(d.value.trim());
      ta.value = msg.join(" — ");
      return;
    }
    var pTitle = selectedProblemTitle();
    if (pTitle) ta.value = pTitle;
  }

  function fillProblems() {
    var sel = document.getElementById("problem-select");
    return CuratorAPI.getProblems().then(function (res) {
      sel.innerHTML = '<option value="">Select a problem…</option>';
      var ownOpt = document.createElement("option");
      ownOpt.value = "__own__";
      ownOpt.textContent = "Add your own (describe a new problem)";
      sel.appendChild(ownOpt);
      (res.problems || []).forEach(function (p) {
        if (isSdgProblem(p)) return;
        var o = document.createElement("option");
        o.value = String(p.id);
        o.textContent = p.title;
        sel.appendChild(o);
      });
      syncCustomProblemBlock();
    });
  }

  function fillInsights() {
    return CuratorAPI.getDashboardStats().then(function (d) {
      var ins = d.insights || {};
      var box = document.getElementById("urgent-needs");
      if (box) {
        box.innerHTML = "";
        var cat = ins.least_solved_category;
        if (cat && cat !== "—") {
          var li = document.createElement("li");
          li.textContent =
            "High demand in “" + cat + "” — fewer solutions per problem.";
          box.appendChild(li);
        }
        (ins.emerging_clusters || []).slice(0, 3).forEach(function (c) {
          var li2 = document.createElement("li");
          li2.textContent = "Emerging cluster: " + c;
          box.appendChild(li2);
        });
      }
      var tip = document.getElementById("curator-tip-bar");
      if (tip) {
        var pct = d.total_problems
          ? Math.round(
              (100 * (d.total_problems - d.unsolved_problems)) /
                d.total_problems,
            )
          : 0;
        tip.style.width = Math.min(100, pct + 20) + "%";
      }
    });
  }

  function showErr(msg) {
    var el = document.getElementById("form-msg");
    el.className = "msg msg--error";
    el.textContent = msg;
    el.classList.remove("hidden");
  }

  function showOk(msg) {
    var el = document.getElementById("form-msg");
    el.className = "msg msg--ok";
    el.textContent = msg;
    el.classList.remove("hidden");
  }

  function rememberSubmission(res, pid, title) {
    try {
      var raw = localStorage.getItem("curator_my_ideas");
      var arr = raw ? JSON.parse(raw) : [];
      arr.push({
        startup_id: res.startup_id,
        problem_id: Number(pid),
        title: title,
        at: new Date().toISOString(),
      });
      localStorage.setItem(
        "curator_my_ideas",
        JSON.stringify(arr.slice(-40)),
      );
    } catch (e) {}
  }

  function init() {
    fillProblems().then(function () {
      var params = new URLSearchParams(window.location.search);
      var pre = params.get("problem");
      if (pre) {
        var sel = document.getElementById("problem-select");
        for (var i = 0; i < sel.options.length; i++) {
          if (sel.options[i].value === pre) {
            sel.selectedIndex = i;
            break;
          }
        }
        syncCustomProblemBlock();
      }
    });
    fillInsights();

    var problemSel = document.getElementById("problem-select");
    if (problemSel) {
      problemSel.addEventListener("change", syncCustomProblemBlock);
    }
    var cpt = document.getElementById("custom-problem-title");
    var cpd = document.getElementById("custom-problem-desc");
    if (cpt) cpt.addEventListener("input", autoFillProblemSolved);
    if (cpd) cpd.addEventListener("input", autoFillProblemSolved);

    document.getElementById("startup-form").addEventListener("submit", function (e) {
      e.preventDefault();
      var pid = document.getElementById("problem-select").value;
      var title = document.getElementById("title").value.trim();
      var desc = document.getElementById("description").value.trim();
      var solved = document.getElementById("problem-solved").value.trim();
      var aud = document.getElementById("audience").value.trim();
      var impact = document.getElementById("impact").value.trim();

      if (!pid) {
        showErr("Please select a problem.");
        return;
      }
      if (title.length < 2) {
        showErr("Title is too short.");
        return;
      }
      if (desc.length < 10) {
        showErr("Description should be at least 10 characters.");
        return;
      }
      if (solved.length < 10) {
        showErr("Please describe the problem this startup solves (min 10 chars).");
        return;
      }

      function submitStartup(resolvedProblemId) {
        var fullDescription =
          desc +
          "\n\nProblem this startup solves:\n" +
          solved;
        return CuratorAPI.addStartup({
          problem_id: Number(resolvedProblemId),
          title: title,
          description: fullDescription,
          target_audience: aud || undefined,
          expected_impact: impact || undefined,
        }).then(function (res) {
          rememberSubmission(res, String(resolvedProblemId), title);
          showOk("Idea saved. It will appear on the problem page immediately.");
          document.getElementById("startup-form").reset();
          var ct = document.getElementById("custom-problem-title");
          var cd = document.getElementById("custom-problem-desc");
          if (ct) ct.value = "";
          if (cd) cd.value = "";
          var solvedEl = document.getElementById("problem-solved");
          if (solvedEl) solvedEl.value = "";
          fillProblems().then(function () {
            var sel = document.getElementById("problem-select");
            if (sel) sel.value = "";
            syncCustomProblemBlock();
          });
        });
      }

      if (pid === "__own__") {
        var pTitle = document.getElementById("custom-problem-title").value.trim();
        var pDesc = document.getElementById("custom-problem-desc").value.trim();
        if (pTitle.length < 3) {
          showErr("Problem title should be at least 3 characters.");
          return;
        }
        if (pDesc.length < 20) {
          showErr("Problem statement should be at least 20 characters.");
          return;
        }
        CuratorAPI.addProblem({
          title: pTitle,
          description: pDesc,
          category: "General",
          tags: [],
        })
          .then(function (r) {
            var newId = r.problem && r.problem.id;
            if (newId == null) throw new Error("Could not create problem.");
            return submitStartup(newId);
          })
          .catch(function (err) {
            showErr(err.message || String(err));
          });
        return;
      }

      submitStartup(pid).catch(function (err) {
        showErr(err.message || String(err));
      });
    });

    document.getElementById("btn-ai").addEventListener("click", function () {
      var ta = document.getElementById("ai-desc");
      var out = document.getElementById("ai-out");
      var txt = ta.value.trim();
      if (txt.length < 10) {
        out.textContent = "Enter at least 10 characters of problem context.";
        return;
      }
      out.textContent = "Thinking…";
      CuratorAPI.aiSuggest(txt)
        .then(function (r) {
          if (!r.available) {
            out.textContent =
              r.message ||
              "AI unavailable. Set GEMINI_API_KEY on the server to enable.";
            return;
          }
          out.innerHTML =
            "<strong>Type:</strong> " +
            (r.problem_type || "") +
            "<br><strong>Audience:</strong> " +
            (r.target_audience || "") +
            "<br><strong>Idea:</strong> " +
            (r.startup_idea || "");
        })
        .catch(function (e) {
          out.textContent = e.message || String(e);
        });
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
