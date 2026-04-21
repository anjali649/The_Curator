"""
Generate innovation_policy_gaps_1k.csv — 1200 synthetic cross-sector problem scenarios.
Run: python scripts/generate_innovation_policy_gaps.py
"""

from __future__ import annotations

import csv
import random
from pathlib import Path

random.seed(2026)

DATA_DIR = Path(__file__).resolve().parent.parent / "data"
OUT = DATA_DIR / "innovation_policy_gaps_1k.csv"
N_ROWS = 1200

# Align with clustering.py CATEGORY_TO_CLUSTER_LABEL where possible
CATEGORIES = [
    "Healthcare",
    "Education",
    "Technology",
    "Sustainability",
    "FinTech",
    "Logistics",
    "Genomics",
    "Cybersecurity",
    "Agriculture",
    "General",
]

PHASES = [
    "discovery",
    "pilot rollout",
    "scale-up",
    "legacy migration",
    "post-merger integration",
    "regulatory refresh",
]

STAKEHOLDERS = [
    "city innovation offices",
    "provincial regulators",
    "NGO consortia",
    "university labs",
    "industry alliances",
    "patient advocacy groups",
    "teacher cooperatives",
    "SME federations",
]

BLOCKERS = [
    "unclear procurement rules",
    "missing interoperability standards",
    "talent retention in remote hubs",
    "vendor lock-in risk",
    "data residency conflicts",
    "underfunded change management",
    "weak outcome baselines",
    "fragmented funding cycles",
]

METRICS = [
    "time-to-deployment",
    "cost per outcome",
    "adoption depth",
    "error rates",
    "equity of access",
]


def main() -> None:
    rows: list[dict[str, str]] = []
    for i in range(N_ROWS):
        cat = CATEGORIES[i % len(CATEGORIES)]
        title = (
            f"{cat}: {random.choice(PHASES).title()} bottleneck #{i + 1}"
        )
        desc = (
            f"Scenario {i + 1} ({cat}). "
            f"{random.choice(STAKEHOLDERS).title()} cite {random.choice(BLOCKERS)} while prioritizing "
            f"{random.choice(METRICS)}. Cross-functional alignment and shared KPIs remain inconsistent. "
            "Synthetic educational row for clustering and dashboard demos."
        )
        tags = f"{cat.lower().replace(' ', '-')},policy,innovation,synthetic,{i % 100}"
        rows.append(
            {
                "id": str(i + 1),
                "title": title,
                "description": desc,
                "category": cat,
                "tags": tags,
            }
        )

    with OUT.open("w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(
            f, fieldnames=["id", "title", "description", "category", "tags"]
        )
        w.writeheader()
        w.writerows(rows)

    print(f"Wrote {len(rows)} rows to {OUT} ({OUT.stat().st_size // 1024} KB)")


if __name__ == "__main__":
    main()
