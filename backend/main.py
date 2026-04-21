"""
AI Startup Problem Solver Dashboard — FastAPI entrypoint.
Loads dataset, runs TF-IDF + KMeans clustering, serves REST API.
"""

from __future__ import annotations

import os
from contextlib import asynccontextmanager
from pathlib import Path

# Load backend/.env into the process environment (GEMINI_API_KEY, etc.)
try:
    from dotenv import load_dotenv

    _env_path = Path(__file__).resolve().parent / ".env"
    load_dotenv(_env_path, override=True)
except ImportError:
    pass

# OpenAI is not used; strip legacy key so it is never read by mistake
os.environ.pop("OPENAI_API_KEY", None)

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from clustering import cluster_problems
from routes import dashboard, problems, startups
from services import db_service
from services.dataset_service import load_problems
from services.state import app_state


@asynccontextmanager
async def lifespan(_: FastAPI):
    db_service.init_db()
    raw = load_problems()
    raw.extend(db_service.list_user_problems())
    if not raw:
        app_state.problems = []
        app_state.by_id = {}
        app_state.cluster_labels_unique = []
    else:
        labels_list, id_to_label, _, _ = cluster_problems(raw)
        enriched: list[dict] = []
        for p, cid in zip(raw, labels_list, strict=True):
            row = {
                **p,
                "cluster_id": cid,
                "cluster_label": id_to_label.get(cid, "General"),
            }
            enriched.append(row)

        app_state.problems = enriched
        app_state.by_id = {p["id"]: p for p in enriched}
        app_state.cluster_labels_unique = sorted(
            {p["cluster_label"] for p in enriched},
            key=lambda s: (
                -sum(1 for x in enriched if x["cluster_label"] == s),
                s,
            ),
        )

    yield


app = FastAPI(
    title="AI Startup Problem Solver Dashboard",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(problems.router, tags=["problems"])
app.include_router(dashboard.router, tags=["dashboard"])
app.include_router(startups.router, tags=["startups"])


@app.get("/health")
def health():
    gemini_key = (
        os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY") or ""
    ).strip()
    return {
        "status": "ok",
        "problems_loaded": len(app_state.problems),
        "gemini_key_loaded": len(gemini_key) > 0,
    }


# --- Static HTML/CSS/JS UI (register after API routes) ---
_FRONTEND = Path(__file__).resolve().parent.parent / "frontend"


@app.get("/")
def serve_index():
    return FileResponse(_FRONTEND / "index.html")


@app.get("/problems.html")
def serve_problems_html():
    return FileResponse(_FRONTEND / "problems.html")


@app.get("/problem.html")
def serve_problem_html():
    return FileResponse(_FRONTEND / "problem.html")


@app.get("/add-startup.html")
def serve_add_startup_html():
    return FileResponse(_FRONTEND / "add-startup.html")


@app.get("/profile.html")
def serve_profile_html():
    return FileResponse(_FRONTEND / "profile.html")


@app.get("/settings.html")
def serve_settings_html():
    return FileResponse(_FRONTEND / "settings.html")


@app.get("/startup-ideas.html")
def serve_startup_ideas_html():
    return FileResponse(_FRONTEND / "startup-ideas.html")


@app.get("/startup-idea.html")
def serve_startup_idea_html():
    return FileResponse(_FRONTEND / "startup-idea.html")


app.mount("/css", StaticFiles(directory=_FRONTEND / "css"), name="css")
app.mount("/js", StaticFiles(directory=_FRONTEND / "js"), name="js")
