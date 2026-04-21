"""SQLite persistence for user-submitted startups and upvotes."""

from __future__ import annotations

import json
import sqlite3
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path

DB_PATH = Path(__file__).resolve().parent.parent / "data" / "app.db"


def _utc_now() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


@contextmanager
def get_conn():
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    try:
        yield conn
        conn.commit()
    finally:
        conn.close()


def init_db() -> None:
    with get_conn() as conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS user_startups (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                problem_id INTEGER NOT NULL,
                title TEXT NOT NULL,
                description TEXT NOT NULL,
                target_audience TEXT,
                expected_impact TEXT,
                created_at TEXT NOT NULL,
                upvotes INTEGER NOT NULL DEFAULT 0
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS startup_upvote_ips (
                startup_id INTEGER NOT NULL,
                voter_key TEXT NOT NULL,
                PRIMARY KEY (startup_id, voter_key)
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS problem_views (
                problem_id INTEGER PRIMARY KEY,
                view_count INTEGER NOT NULL DEFAULT 0
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS user_problems (
                problem_id INTEGER PRIMARY KEY,
                title TEXT NOT NULL,
                description TEXT NOT NULL,
                category TEXT NOT NULL,
                tags TEXT NOT NULL DEFAULT '[]',
                created_at TEXT NOT NULL
            )
            """
        )


def insert_startup(
    problem_id: int,
    title: str,
    description: str,
    target_audience: str | None,
    expected_impact: str | None,
) -> int:
    with get_conn() as conn:
        cur = conn.execute(
            """
            INSERT INTO user_startups
            (problem_id, title, description, target_audience, expected_impact, created_at)
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            (
                problem_id,
                title,
                description,
                target_audience or "",
                expected_impact or "",
                _utc_now(),
            ),
        )
        return int(cur.lastrowid)


def list_startups_for_problem(problem_id: int) -> list[dict]:
    with get_conn() as conn:
        rows = conn.execute(
            """
            SELECT id, problem_id, title, description, target_audience, expected_impact,
                   created_at, upvotes
            FROM user_startups WHERE problem_id = ? ORDER BY upvotes DESC, id DESC
            """,
            (problem_id,),
        ).fetchall()
    return [dict(r) for r in rows]


def list_all_user_startups() -> list[dict]:
    with get_conn() as conn:
        rows = conn.execute(
            """
            SELECT id, problem_id, title, description, target_audience, expected_impact,
                   created_at, upvotes
            FROM user_startups ORDER BY created_at ASC
            """
        ).fetchall()
    return [dict(r) for r in rows]


def increment_upvote(startup_id: int, voter_key: str) -> tuple[bool, int]:
    """Returns (accepted, new_upvote_count). Rejects duplicate voter_key per startup."""
    with get_conn() as conn:
        row = conn.execute(
            "SELECT upvotes FROM user_startups WHERE id = ?", (startup_id,)
        ).fetchone()
        if not row:
            return False, 0
        try:
            conn.execute(
                "INSERT INTO startup_upvote_ips (startup_id, voter_key) VALUES (?, ?)",
                (startup_id, voter_key),
            )
        except sqlite3.IntegrityError:
            return False, int(row["upvotes"])
        new_val = int(row["upvotes"]) + 1
        conn.execute(
            "UPDATE user_startups SET upvotes = ? WHERE id = ?",
            (new_val, startup_id),
        )
        return True, new_val


def count_startups_total() -> int:
    with get_conn() as conn:
        r = conn.execute("SELECT COUNT(*) AS c FROM user_startups").fetchone()
        return int(r["c"]) if r else 0


def record_problem_view(problem_id: int) -> None:
    with get_conn() as conn:
        conn.execute(
            """
            INSERT INTO problem_views (problem_id, view_count) VALUES (?, 1)
            ON CONFLICT(problem_id) DO UPDATE SET view_count = view_count + 1
            """,
            (problem_id,),
        )


def get_trending_problem_ids(limit: int = 5) -> list[int]:
    """By view count, then by total upvotes on ideas for that problem."""
    with get_conn() as conn:
        rows = conn.execute(
            """
            SELECT p.problem_id,
                   COALESCE(p.view_count, 0) AS vc,
                   COALESCE(SUM(u.upvotes), 0) AS uv
            FROM problem_views p
            LEFT JOIN user_startups u ON u.problem_id = p.problem_id
            GROUP BY p.problem_id
            ORDER BY vc DESC, uv DESC
            LIMIT ?
            """,
            (limit,),
        ).fetchall()
    ids = [int(r["problem_id"]) for r in rows]
    if len(ids) < limit:
        # Fill from problems with ideas but fewer views
        with get_conn() as conn:
            extra = conn.execute(
                """
                SELECT problem_id FROM user_startups
                GROUP BY problem_id ORDER BY SUM(upvotes) DESC LIMIT ?
                """,
                (limit,),
            ).fetchall()
        for r in extra:
            pid = int(r["problem_id"])
            if pid not in ids:
                ids.append(pid)
            if len(ids) >= limit:
                break
    return ids[:limit]


def list_user_problems() -> list[dict]:
    """Rows contributed via POST /problems; merged into the dataset before clustering."""
    with get_conn() as conn:
        rows = conn.execute(
            """
            SELECT problem_id, title, description, category, tags
            FROM user_problems ORDER BY problem_id
            """
        ).fetchall()
    out: list[dict] = []
    for r in rows:
        raw_tags = r["tags"] or "[]"
        try:
            tags = json.loads(raw_tags)
            if not isinstance(tags, list):
                tags = []
        except Exception:
            tags = []
        tags = [str(t).strip() for t in tags if str(t).strip()][:24]
        out.append(
            {
                "id": int(r["problem_id"]),
                "title": r["title"],
                "description": r["description"],
                "category": (r["category"] or "").strip() or "General",
                "tags": tags,
                "startup_idea": None,
            }
        )
    return out


def insert_user_problem(
    problem_id: int,
    title: str,
    description: str,
    category: str,
    tags: list[str],
) -> None:
    with get_conn() as conn:
        conn.execute(
            """
            INSERT INTO user_problems
            (problem_id, title, description, category, tags, created_at)
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            (
                problem_id,
                title,
                description,
                category or "General",
                json.dumps(tags),
                _utc_now(),
            ),
        )