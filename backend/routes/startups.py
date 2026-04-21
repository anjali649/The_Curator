from __future__ import annotations

import re
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field

from services import ai_service, db_service
from services.state import AppState, app_state

router = APIRouter()


def get_state() -> AppState:
    return app_state


class AddStartupBody(BaseModel):
    problem_id: int
    title: str = Field(..., min_length=2, max_length=200)
    description: str = Field(..., min_length=10, max_length=8000)
    target_audience: str | None = Field(None, max_length=500)
    expected_impact: str | None = Field(None, max_length=500)


class AiSuggestBody(BaseModel):
    problem_description: str = Field(..., min_length=10, max_length=12000)


class AiChatBody(BaseModel):
    message: str = Field(..., min_length=1, max_length=8000)
    context: str | None = Field(None, max_length=14000)


class UpvoteBody(BaseModel):
    voter_key: str = Field(..., min_length=4, max_length=128)


@router.post("/add-startup")
def add_startup(body: AddStartupBody, state: AppState = Depends(get_state)):
    if body.problem_id not in state.by_id:
        raise HTTPException(status_code=404, detail="Unknown problem_id")
    new_id = db_service.insert_startup(
        problem_id=body.problem_id,
        title=body.title.strip(),
        description=body.description.strip(),
        target_audience=body.target_audience,
        expected_impact=body.expected_impact,
    )
    return {"ok": True, "startup_id": new_id}


@router.post("/startups/{startup_id}/upvote")
def upvote_startup(startup_id: int, body: UpvoteBody):
    accepted, count = db_service.increment_upvote(startup_id, body.voter_key.strip())
    if count == 0 and not accepted:
        raise HTTPException(status_code=404, detail="Startup not found")
    return {"ok": True, "accepted": accepted, "upvotes": count}


@router.get("/startup-ideas")
def list_startup_ideas_catalog(state: AppState = Depends(get_state)):
    """
    Lists built-in dataset startup ideas and community submissions.
    Matches dashboard metric: len(dataset with startup_idea) + len(user_startups rows).
    """
    dataset: list[dict] = []
    for p in state.problems:
        idea = p.get("startup_idea")
        if not idea:
            continue
        dataset.append(
            {
                "kind": "dataset",
                "problem_id": int(p["id"]),
                "problem_title": p.get("title") or "",
                "idea": str(idea).strip(),
                "category": p.get("category"),
            }
        )

    community: list[dict] = []
    for r in db_service.list_all_user_startups():
        pid = int(r["problem_id"])
        prob = state.by_id.get(pid)
        community.append(
            {
                "kind": "community",
                "startup_id": int(r["id"]),
                "problem_id": pid,
                "problem_title": (prob.get("title") if prob else None) or f"Problem #{pid}",
                "title": r["title"],
                "description": r["description"],
                "upvotes": int(r["upvotes"] or 0),
                "created_at": r["created_at"],
            }
        )
    community.sort(key=lambda x: (-x["upvotes"], -x["startup_id"]))

    metric = len(dataset) + len(community)
    return {
        "dataset_builtin_count": len(dataset),
        "community_count": len(community),
        "total_startups_metric": metric,
        "dataset_ideas": dataset,
        "community_ideas": community,
    }


def _keywords(text: str) -> set[str]:
    tokens = re.findall(r"[a-zA-Z][a-zA-Z0-9]{2,}", (text or "").lower())
    stop = {
        "with",
        "from",
        "that",
        "this",
        "into",
        "your",
        "their",
        "have",
        "will",
        "platform",
        "solution",
        "startup",
        "idea",
        "using",
        "based",
        "need",
        "more",
        "less",
        "than",
        "for",
        "and",
        "the",
    }
    return {t for t in tokens if t not in stop}


def _score_problem_match(startup_kw: set[str], problem: dict) -> int:
    text = " ".join(
        [
            str(problem.get("title") or ""),
            str(problem.get("description") or ""),
            " ".join(problem.get("tags") or []),
            str(problem.get("category") or ""),
        ]
    )
    pkw = _keywords(text)
    if not pkw:
        return 0
    overlap = startup_kw & pkw
    return len(overlap)


@router.get("/startup-detail")
def startup_detail(
    kind: str = Query(..., pattern="^(dataset|community)$"),
    problem_id: int = Query(..., ge=1),
    startup_id: int | None = Query(None, ge=1),
    state: AppState = Depends(get_state),
):
    problem = state.by_id.get(problem_id)
    if not problem:
        raise HTTPException(status_code=404, detail="Related problem not found")

    startup_obj: dict | None = None
    if kind == "dataset":
        idea = problem.get("startup_idea")
        if not idea:
            raise HTTPException(status_code=404, detail="Dataset startup idea not found")
        startup_obj = {
            "kind": "dataset",
            "id": f"dataset-{problem_id}",
            "title": problem.get("title") or "Dataset startup idea",
            "description": str(idea).strip(),
            "category": problem.get("category") or "General",
            "tags": problem.get("tags") or [],
            "problem_id": problem_id,
        }
    else:
        if not startup_id:
            raise HTTPException(status_code=400, detail="startup_id is required for community ideas")
        row = next(
            (r for r in db_service.list_all_user_startups() if int(r["id"]) == int(startup_id)),
            None,
        )
        if not row:
            raise HTTPException(status_code=404, detail="Community startup not found")
        startup_obj = {
            "kind": "community",
            "id": int(row["id"]),
            "title": row["title"],
            "description": row["description"],
            "category": problem.get("category") or "General",
            "tags": problem.get("tags") or [],
            "upvotes": int(row.get("upvotes") or 0),
            "problem_id": int(row["problem_id"]),
            "target_audience": row.get("target_audience"),
            "expected_impact": row.get("expected_impact"),
        }
        if startup_obj["problem_id"] != problem_id:
            raise HTTPException(status_code=400, detail="startup_id does not match problem_id")

    related = []
    startup_kw = _keywords((startup_obj.get("title") or "") + " " + (startup_obj.get("description") or ""))
    for p in state.problems:
        score = _score_problem_match(startup_kw, p)
        if int(p["id"]) == problem_id:
            score += 1000  # always keep linked problem first
        if score <= 0:
            continue
        related.append(
            {
                "id": int(p["id"]),
                "title": p.get("title") or "",
                "description": p.get("description") or "",
                "category": p.get("category") or "General",
                "tags": p.get("tags") or [],
                "cluster_label": p.get("cluster_label"),
                "match_score": int(score),
            }
        )
    related.sort(key=lambda x: (-x["match_score"], x["id"]))
    related = related[:8]

    return {
        "startup": startup_obj,
        "primary_problem": {
            "id": int(problem["id"]),
            "title": problem.get("title") or "",
            "description": problem.get("description") or "",
            "category": problem.get("category") or "General",
            "tags": problem.get("tags") or [],
            "cluster_label": problem.get("cluster_label"),
        },
        "related_problems": related,
    }


@router.get("/recent-submissions")
def recent_submissions(
    state: AppState = Depends(get_state),
    limit: int = Query(30, ge=1, le=100),
):
    """Latest user-submitted ideas with problem titles (for profile / activity feeds)."""
    rows = db_service.list_all_user_startups()
    tail = rows[-limit:] if len(rows) > limit else rows
    out = []
    for r in reversed(tail):
        pid = int(r["problem_id"])
        p = state.by_id.get(pid)
        row = dict(r)
        row["problem_title"] = p["title"] if p else "Unknown problem"
        row["problem_category"] = p.get("category") if p else None
        out.append(row)
    return {"submissions": out}


@router.post("/ai-suggest")
def ai_suggest(body: AiSuggestBody):
    result = ai_service.suggest_from_description(body.problem_description)
    if result is None:
        return {
            "available": False,
            "message": "Set GEMINI_API_KEY to enable AI suggestions, or try again later.",
        }
    return {"available": True, **result}


@router.post("/ai-chat")
def ai_chat(body: AiChatBody):
    out = ai_service.chat_assist(body.message, body.context)
    if out.get("ok"):
        return {"available": True, "reply": out["reply"]}
    return {
        "available": False,
        "message": out.get("message")
        or "Ask AI is unavailable. Check backend/.env and restart the server.",
    }
