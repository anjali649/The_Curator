"""
TF-IDF + KMeans clustering for problem texts.
Assigns human-readable cluster labels from dominant categories.
"""

from __future__ import annotations

from collections import Counter
from typing import Any

import numpy as np
from sklearn.cluster import KMeans
from sklearn.feature_extraction.text import TfidfVectorizer

# Map dataset categories to display-style cluster names
CATEGORY_TO_CLUSTER_LABEL: dict[str, str] = {
    "Healthcare": "Healthcare Issues",
    "Education": "Education Gaps",
    "Technology": "Tech Problems",
    "FinTech": "FinTech Challenges",
    "Logistics": "Logistics & Maritime",
    "Sustainability": "Sustainability Tech",
    "Genomics": "Genomics & Precision Med",
    "Cybersecurity": "Security & Privacy",
    "Agriculture": "Agri & Food Systems",
    "General": "Cross-Domain Challenges",
}


def _combine_text(p: dict[str, Any]) -> str:
    title = p.get("title") or ""
    desc = p.get("description") or ""
    tags = " ".join(p.get("tags") or [])
    return f"{title} {desc} {tags}"


def build_cluster_labels(
    problems: list[dict[str, Any]], cluster_ids: list[int]
) -> dict[int, str]:
    """For each cluster id, pick label from the most common category in that cluster."""
    by_cluster: dict[int, list[str]] = {}
    for p, cid in zip(problems, cluster_ids, strict=True):
        cat = p.get("category") or "General"
        by_cluster.setdefault(cid, []).append(cat)

    out: dict[int, str] = {}
    for cid, cats in by_cluster.items():
        top = Counter(cats).most_common(1)[0][0]
        out[cid] = CATEGORY_TO_CLUSTER_LABEL.get(
            top, f"{top} Cluster"
        )
    return out


def cluster_problems(
    problems: list[dict[str, Any]],
    n_clusters: int | None = None,
    random_state: int = 42,
) -> tuple[list[int], dict[int, str], TfidfVectorizer, KMeans]:
    """
    Returns per-problem cluster id, id->label map, fitted vectorizer, and kmeans model.
    """
    n = len(problems)
    if n == 0:
        return [], {}, TfidfVectorizer(), KMeans(n_clusters=1)

    texts = [_combine_text(p) for p in problems]
    k = n_clusters or max(2, min(8, n // 3 or 2))
    k = min(k, n)

    vectorizer = TfidfVectorizer(
        max_features=5000,
        stop_words="english",
        ngram_range=(1, 2),
        min_df=1,
        max_df=0.95,
    )
    X = vectorizer.fit_transform(texts)

    kmeans = KMeans(n_clusters=k, random_state=random_state, n_init=10)
    labels = kmeans.fit_predict(X)
    labels_list = [int(x) for x in labels]

    id_to_label = build_cluster_labels(problems, labels_list)
    return labels_list, id_to_label, vectorizer, kmeans
