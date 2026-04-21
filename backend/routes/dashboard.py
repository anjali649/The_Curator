from __future__ import annotations

from fastapi import APIRouter, Depends

from services.analytics_service import build_dashboard_stats
from services.state import AppState, app_state

router = APIRouter()


def get_state() -> AppState:
    return app_state


@router.get("/dashboard-stats")
def dashboard_stats(state: AppState = Depends(get_state)):
    dist: dict[str, int] = {}
    for p in state.problems:
        label = p.get("cluster_label") or "Unknown"
        dist[label] = dist.get(label, 0) + 1
    return build_dashboard_stats(state.problems, dist)
