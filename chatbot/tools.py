"""Small, read-only admin reports. Database access is never model-generated."""

import sqlite3
from contextlib import contextmanager
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from zoneinfo import ZoneInfo

from langchain.tools import ToolRuntime, tool


KL_TZ = ZoneInfo("Asia/Kuala_Lumpur")
MAX_TIED_SITTERS = 5


@dataclass(frozen=True)
class ChatContext:
    # Supplied by Flask, never by the model or the request JSON.
    user_id: int
    database: str


@contextmanager
def admin_database(context: ChatContext):
    if context is None:
        raise PermissionError("Admin access required.")
    uri = Path(context.database).resolve().as_uri() + "?mode=ro"
    conn = sqlite3.connect(uri, uri=True, timeout=5)
    conn.row_factory = sqlite3.Row
    try:
        conn.execute("PRAGMA query_only = ON")
        conn.execute("BEGIN")
        user = conn.execute(
            "SELECT role, is_suspended FROM users WHERE user_id = ?",
            (context.user_id,),
        ).fetchone()
        if not user or user["role"] != "admin" or user["is_suspended"]:
            raise PermissionError("Admin access required.")
        yield conn
    finally:
        conn.close()


def current_month_window():
    """KL calendar-month boundaries converted to SQLite's stored UTC times."""
    now = datetime.now(KL_TZ)
    start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    if start.month == 12:
        end = start.replace(year=start.year + 1, month=1)
    else:
        end = start.replace(month=start.month + 1)
    return (
        start.strftime("%Y-%m"),
        start.astimezone(timezone.utc).strftime("%Y-%m-%d %H:%M:%S"),
        end.astimezone(timezone.utc).strftime("%Y-%m-%d %H:%M:%S"),
    )


@tool
def get_monthly_registrations(runtime: ToolRuntime[ChatContext]) -> dict:
    """Count new pet owners and pet sitters this calendar month (Kuala Lumpur).

    Includes all registered accounts, including unverified or suspended ones.
    Only the current month is supported; returns counts, not account details.
    """
    month, start, end = current_month_window()
    counts = {"owner": 0, "sitter": 0}
    with admin_database(runtime.context) as conn:
        for row in conn.execute(
            """
            SELECT role, COUNT(*) AS total FROM users
            WHERE role IN ('owner', 'sitter')
              AND datetime(created_at) >= ? AND datetime(created_at) < ?
            GROUP BY role
            """,
            (start, end),
        ):
            counts[row["role"]] = row["total"]
    return {"month": month, "timezone": "Asia/Kuala_Lumpur", **counts}


def _rating_extreme(conn, aggregate):
    # These SQL fragments are constants chosen by our code, never tool arguments.
    if aggregate not in ("MAX", "MIN"):
        raise ValueError("Invalid rating aggregate")
    rows = conn.execute(
        f"""
        WITH averages AS (
            SELECT u.user_id, u.username, AVG(r.rating) AS average_rating,
                   COUNT(*) AS review_count
            FROM reviews r JOIN users u ON u.user_id = r.sitter_id
            WHERE u.role = 'sitter'
            GROUP BY u.user_id, u.username
        )
        SELECT *, COUNT(*) OVER () AS total_tied
        FROM averages
        WHERE average_rating = (SELECT {aggregate}(average_rating) FROM averages)
        ORDER BY review_count DESC, user_id ASC
        LIMIT ?
        """,
        (MAX_TIED_SITTERS,),
    ).fetchall()
    return {
        "average_rating": round(rows[0]["average_rating"], 2) if rows else None,
        "total_tied": rows[0]["total_tied"] if rows else 0,
        "sitters": [
            {
                "user_id": row["user_id"],
                "username": row["username"][:80],
                "review_count": row["review_count"],
            }
            for row in rows
        ],
    }


@tool
def get_sitter_rating_extremes(runtime: ToolRuntime[ChatContext]) -> dict:
    """Get highest and lowest average sitter ratings across ALL received reviews.

    Excludes unrated sitters. Returns review counts and up to five names per
    tied group, plus the total tied count. Owners do not receive ratings.
    """
    with admin_database(runtime.context) as conn:
        return {
            "period": "all_time",
            "highest": _rating_extreme(conn, "MAX"),
            "lowest": _rating_extreme(conn, "MIN"),
        }


ADMIN_TOOLS = [get_monthly_registrations, get_sitter_rating_extremes]
