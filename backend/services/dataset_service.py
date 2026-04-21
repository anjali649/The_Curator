"""Load and hold the preloaded problems dataset."""

from __future__ import annotations

import csv
import json
from pathlib import Path

DATA_DIR = Path(__file__).resolve().parent.parent / "data"

# Normalized CSV exports merged after the primary dataset (see data/SOURCES.txt).
_EXTRA_PROBLEM_CSV = (
    "sdg_targets.csv",
    "cfpb_complaints_sample.csv",
    "global_health_challenges.csv",
    "climate_energy_challenges.csv",
    "digital_society_challenges.csv",
    "agri_food_systems.csv",
    "innovation_policy_gaps_1k.csv",
    "large_synthetic_problems.csv",
)


def _first_str(row: dict, *keys: str) -> str:
    """First non-empty string among possible CSV header spellings."""
    for k in keys:
        v = row.get(k)
        if v is None:
            continue
        s = str(v).strip()
        if s:
            return s
    return ""


def _normalize_row(row: dict, idx: int) -> dict:
    # Strip Excel UTF-8 BOM from first column name if present
    row = {str(k).lstrip("\ufeff"): v for k, v in row.items()}

    tags_raw = _first_str(row, "tags", "Tags", "Keywords", "keywords")
    if tags_raw:
        tags = [t.strip() for t in tags_raw.split(",") if t.strip()]
    else:
        tags = []

    idea = _first_str(row, "startup_idea", "Startup Idea")
    if not idea:
        idea = None

    title = _first_str(row, "title", "Title", "Problem Title", "Problem", "problem")
    problem_statement = _first_str(row, "Problem Statement", "problem_statement")
    description = _first_str(row, "description", "Description")
    if problem_statement and description:
        description = problem_statement + "\n\n" + description
    elif problem_statement and not description:
        description = problem_statement

    category = _first_str(row, "category", "Category") or "General"

    raw_id = _first_str(row, "id", "ID", "Id")
    pid = int(raw_id) if raw_id.isdigit() else idx + 1

    out: dict = {
        "id": pid,
        "title": title,
        "description": description,
        "category": category,
        "tags": tags,
        "startup_idea": idea,
    }

    loc = _first_str(row, "location", "Location")
    if loc:
        out["location"] = loc
    sev = _first_str(row, "severity", "Severity")
    if sev:
        out["severity"] = sev
    sent = _first_str(row, "sentiment", "Sentiment")
    if sent:
        out["sentiment"] = sent

    return out


def _load_csv_path(path: Path) -> list[dict]:
    with path.open(encoding="utf-8", newline="") as f:
        reader = csv.DictReader(f)
        return [_normalize_row(dict(r), i) for i, r in enumerate(reader)]


def _merge_extra_csvs(base: list[dict]) -> list[dict]:
    """Append rows from supplemental CSVs; assign unique ids after the primary set."""
    next_id = max((p["id"] for p in base), default=0) + 1
    merged = list(base)
    for name in _EXTRA_PROBLEM_CSV:
        path = DATA_DIR / name
        if not path.exists():
            continue
        for row in _load_csv_path(path):
            row["id"] = next_id
            next_id += 1
            merged.append(row)
    return merged


def load_problems() -> list[dict]:
    """Load primary dataset (JSON preferred, else problems.csv), then merge extra CSVs."""
    json_path = DATA_DIR / "problems.json"
    csv_path = DATA_DIR / "problems.csv"

    out: list[dict] = []

    if json_path.exists():
        raw = json.loads(json_path.read_text(encoding="utf-8"))
        for i, row in enumerate(raw):
            if isinstance(row, dict):
                out.append(_normalize_row(row, i))
        for i, p in enumerate(out):
            p.setdefault("id", i + 1)
    elif csv_path.exists():
        out = _load_csv_path(csv_path)
    else:
        out = []

    return _merge_extra_csvs(out)
