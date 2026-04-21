from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field

from clustering import CATEGORY_TO_CLUSTER_LABEL
from services import db_service
from services.state import AppState, app_state

router = APIRouter()


class AddProblemBody(BaseModel):
    title: str = Field(..., min_length=3, max_length=300)
    description: str = Field(..., min_length=20, max_length=12000)
    category: str | None = Field(None, max_length=100)
    tags: list[str] = Field(default_factory=list)


def get_state() -> AppState:
    return app_state


def _assign_cluster_for_runtime(state: AppState, category: str) -> tuple[int, str]:
    """Match an existing cluster label when possible; otherwise extend cluster ids."""
    cat = (category or "General").strip() or "General"
    label = CATEGORY_TO_CLUSTER_LABEL.get(cat, f"{cat} Cluster")
    for p in state.problems:
        if (p.get("cluster_label") or "") == label:
            return int(p["cluster_id"]), label
    mx = max((int(p["cluster_id"]) for p in state.problems), default=-1)
    return mx + 1, label


def _rebuild_cluster_index(state: AppState) -> None:
    state.cluster_labels_unique = sorted(
        {p.get("cluster_label") or "Unknown" for p in state.problems},
        key=lambda s: (
            -sum(
                1
                for x in state.problems
                if (x.get("cluster_label") or "Unknown") == s
            ),
            s,
        ),
    )


@router.post("/problems")
def add_problem(body: AddProblemBody, state: AppState = Depends(get_state)):
    tags: list[str] = []
    for t in body.tags[:12]:
        t2 = str(t).strip()[:48]
        if t2:
            tags.append(t2)
    cat = (body.category or "General").strip() or "General"
    next_id = max(state.by_id.keys(), default=0) + 1
    cid, clabel = _assign_cluster_for_runtime(state, cat)
    row = {
        "id": next_id,
        "title": body.title.strip(),
        "description": body.description.strip(),
        "category": cat,
        "tags": tags,
        "startup_idea": None,
        "cluster_id": cid,
        "cluster_label": clabel,
    }
    db_service.insert_user_problem(
        next_id,
        row["title"],
        row["description"],
        cat,
        tags,
    )
    state.problems.append(row)
    state.by_id[next_id] = row
    _rebuild_cluster_index(state)
    return {"ok": True, "problem": _public_summary(row)}


@router.get("/problems")
def list_problems(
    category: str | None = None,
    search: str | None = None,
    cluster: str | None = None,
    state: AppState = Depends(get_state),
):
    items = list(state.problems)
    if category and category.lower() != "all":
        items = [p for p in items if (p.get("category") or "").lower() == category.lower()]
    if cluster and cluster.lower() != "all":
        items = [p for p in items if (p.get("cluster_label") or "") == cluster]
    if search:
        q = search.lower()
        items = [
            p
            for p in items
            if q in (p.get("title") or "").lower()
            or q in (p.get("description") or "").lower()
            or any(q in (t or "").lower() for t in (p.get("tags") or []))
        ]
    # Public list: omit heavy fields if any
    return {"problems": [_public_summary(p) for p in items]}


@router.get("/problems/trending")
def trending_problems(
    limit: int = Query(5, ge=1, le=20),
    state: AppState = Depends(get_state),
):
    ids = db_service.get_trending_problem_ids(limit)
    if not ids:
        ids = [p["id"] for p in state.problems[:limit]]
    out = []
    for pid in ids:
        p = state.by_id.get(pid)
        if p:
            out.append(_public_summary(p))
    return {"trending": out}


@router.get("/problem/{problem_id}")
def get_problem(problem_id: int, state: AppState = Depends(get_state)):
    p = state.by_id.get(problem_id)
    if not p:
        raise HTTPException(status_code=404, detail="Problem not found")

    db_service.record_problem_view(problem_id)

    builtin = p.get("startup_idea")
    if builtin:
        suggestion = builtin
        startup_status = "available"
    else:
        suggestion = "Startup Unavailable Right Now"
        startup_status = "unavailable"

    user_ideas = db_service.list_startups_for_problem(problem_id)
    if user_ideas:
        startup_status = "available"

    return {
        **p,
        "suggested_startup": suggestion,
        "startup_status": startup_status,
        "user_submitted_startups": user_ideas,
    }


@router.get("/categories")
def list_categories(state: AppState = Depends(get_state)):
    cats = sorted({p.get("category") or "General" for p in state.problems})
    tags: set[str] = set()
    for p in state.problems:
        for t in p.get("tags") or []:
            tags.add(str(t))
    return {"categories": cats, "tags": sorted(tags)}


@router.get("/clusters")
def list_clusters(state: AppState = Depends(get_state)):
    dist: dict[str, int] = {}
    for p in state.problems:
        label = p.get("cluster_label") or "Unknown"
        dist[label] = dist.get(label, 0) + 1
    return {
        "clusters": state.cluster_labels_unique,
        "distribution": dist,
    }


def _public_summary(p: dict) -> dict:
    return {
        "id": p["id"],
        "title": p["title"],
        "description": p["description"],
        "category": p.get("category"),
        "tags": p.get("tags") or [],
        "cluster_label": p.get("cluster_label"),
        "has_builtin_startup": bool(p.get("startup_idea")),
    }
