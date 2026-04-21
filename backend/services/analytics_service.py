"""Dashboard metrics from dataset + DB."""

from __future__ import annotations

from collections import Counter, defaultdict
from datetime import datetime, timedelta, timezone

from . import db_service


def _month_key(iso_ts: str) -> str:
    try:
        dt = datetime.fromisoformat(iso_ts.replace("Z", "+00:00"))
        return dt.strftime("%Y-%m")
    except Exception:
        return "unknown"


def build_dashboard_stats(
    problems: list[dict],
    cluster_counts: dict[str, int],
) -> dict:
    """
    problems: enriched with cluster_label, optional startup_idea, id.
    cluster_counts: human-readable cluster name -> count
    """
    by_cat: Counter[str] = Counter()
    with_builtin = 0
    for p in problems:
        cat = p.get("category") or "General"
        by_cat[cat] += 1
        if p.get("startup_idea"):
            with_builtin += 1

    user_rows = db_service.list_all_user_startups()
    total_user = len(user_rows)

    # Problems with at least one solution: builtin OR user submission
    solved_ids = {p["id"] for p in problems if p.get("startup_idea")}
    for r in user_rows:
        solved_ids.add(int(r["problem_id"]))

    all_ids = {p["id"] for p in problems}
    unsolved_count = len(all_ids - solved_ids)

    total_startups = with_builtin + total_user

    without_builtin = len(problems) - with_builtin

    solved_any = len(solved_ids & all_ids)
    unsolved_any = len(all_ids) - solved_any

    # Timeline: last 12 months of user submissions
    now = datetime.now(timezone.utc)
    months: list[str] = []
    for i in range(11, -1, -1):
        d = now - timedelta(days=30 * i)
        months.append(d.strftime("%Y-%m"))
    timeline_counts: dict[str, int] = defaultdict(int)
    for r in user_rows:
        mk = _month_key(r["created_at"])
        if mk in months or mk == "unknown":
            timeline_counts[mk] += 1
    user_submitted_timeline = [{"month": m, "count": timeline_counts.get(m, 0)} for m in months]

    # Insights
    dominant_category = (
        by_cat.most_common(1)[0][0] if by_cat else "—"
    )

    # Least startup solutions per category: min ratio (user+builtin / problems in cat)
    cat_problem_count = dict(by_cat)
    cat_solution_count: dict[str, int] = defaultdict(int)
    for p in problems:
        c = p.get("category") or "General"
        if p.get("startup_idea"):
            cat_solution_count[c] += 1
    for r in user_rows:
        pid = int(r["problem_id"])
        prob = next((x for x in problems if x["id"] == pid), None)
        if prob:
            cat_solution_count[prob.get("category") or "General"] += 1

    least_solved = "—"
    best_ratio = None
    for cat, pc in cat_problem_count.items():
        sc = cat_solution_count.get(cat, 0)
        ratio = sc / pc if pc else 0.0
        if best_ratio is None or ratio < best_ratio:
            best_ratio = ratio
            least_solved = cat

    # Emerging clusters: smallest clusters (niche), excluding empty
    emerging: list[str] = []
    if cluster_counts:
        sorted_c = sorted(cluster_counts.items(), key=lambda x: x[1])
        emerging = [name for name, _ in sorted_c[:3]]

    # Top opportunities by category: higher score = more unsolved share (build here first)
    top_opportunities: list[dict[str, str | int]] = []
    for cat, pc in cat_problem_count.items():
        if pc <= 0:
            continue
        sc = cat_solution_count.get(cat, 0)
        unsolved_in_cat = pc - sc
        gap = unsolved_in_cat / pc
        # Score 50–99: emphasizes categories with remaining gap
        score = int(round(50 + 49 * gap))
        score = max(50, min(99, score))
        top_opportunities.append(
            {"category": cat, "score": score, "_unsolved": unsolved_in_cat}
        )
    top_opportunities.sort(key=lambda x: (-int(x["score"]), -int(x["_unsolved"])))
    top_opportunities = [
        {"category": x["category"], "score": x["score"]} for x in top_opportunities[:8]
    ]

    return {
        "total_problems": len(problems),
        "total_categories": len(by_cat),
        "total_startups": total_startups,
        "unsolved_problems": unsolved_count,
        "category_distribution": dict(by_cat),
        "cluster_distribution": cluster_counts,
        "startup_availability": {
            "with_builtin_idea": with_builtin,
            "without_builtin_idea": without_builtin,
            "with_any_solution": solved_any,
            "without_any_solution": unsolved_any,
        },
        "user_submitted_ideas_timeline": user_submitted_timeline,
        "insights": {
            "dominant_category": dominant_category,
            "least_solved_category": least_solved,
            "emerging_clusters": emerging,
        },
        "top_opportunities": top_opportunities,
    }
