"""Application state populated at startup (dataset + clustering)."""

from __future__ import annotations

from dataclasses import dataclass, field


@dataclass
class AppState:
    problems: list[dict] = field(default_factory=list)
    by_id: dict[int, dict] = field(default_factory=dict)
    cluster_labels_unique: list[str] = field(default_factory=list)


app_state = AppState()
