"""Read-only account lookups and admin reports using predefined SQL."""

import sqlite3
from contextlib import contextmanager
from dataclasses import dataclass
from datetime import date, datetime, timezone
from pathlib import Path
from zoneinfo import ZoneInfo
from typing import Literal

from langchain.tools import ToolRuntime, tool


KL_TZ = ZoneInfo("Asia/Kuala_Lumpur")
MAX_TIED_SITTERS = 5


@dataclass(frozen=True)
class ChatContext:
    # Supplied by Flask, never by the model or the request JSON.
    user_id: int
    database: str


@contextmanager
def account_database(context: ChatContext, roles):
    if context is None:
        raise PermissionError("Active account required.")
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
        if not user or user["role"] not in roles or user["is_suspended"]:
            raise PermissionError("Account access denied.")
        yield conn, user["role"]
    finally:
        conn.close()


@contextmanager
def admin_database(context: ChatContext):
    with account_database(context, {"admin"}) as (conn, _):
        yield conn


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


PAGE_SIZE = 20


def _service_filters(status, date_from, date_to, allowed):
    if status not in allowed:
        raise ValueError('Unsupported status.')
    for value in (date_from, date_to):
        if value is not None and date.fromisoformat(value).isoformat() != value:
            raise ValueError('Use dates in YYYY-MM-DD format.')
    if date_from and date_to and date_from > date_to:
        raise ValueError('Start date must not be after end date.')
    clauses, params = [], []
    if status != 'all':
        clauses.append('lower(s.status) = ?')
        params.append(status)
    if date_from:
        clauses.append('s.service_date >= ?')
        params.append(date_from)
    if date_to:
        clauses.append('s.service_date <= ?')
        params.append(date_to)
    return clauses, params


def _page(conn, query, params, order, offset):
    if type(offset) is not int or offset < 0:
        raise ValueError('Offset must be a nonnegative integer.')
    total = conn.execute('SELECT COUNT(*) FROM (' + query + ')', params).fetchone()[0]
    rows = conn.execute(query + ' ORDER BY ' + order + ' LIMIT ? OFFSET ?',
                        [*params, PAGE_SIZE, offset]).fetchall()
    records = [dict(row) for row in rows]
    return {'total_matching': total, 'offset': offset, 'records': records,
            'next_offset': offset + len(records) if offset + len(records) < total else None}


@tool
def get_my_bookings(
    runtime: ToolRuntime[ChatContext],
    status: Literal['all', 'pending', 'approved', 'ongoing', 'completed'] = 'all',
    date_from: str | None = None,
    date_to: str | None = None,
    offset: int = 0,
) -> dict:
    """Fetch my service requests (owner) or assigned bookings (sitter).

    Optional inclusive YYYY-MM-DD dates filter the service START date in Malaysia
    time, not overlap with its duration. Status filters service status. Returns
    20 rows per page, total_matching and next_offset. No user ID can be supplied.
    """
    clauses, params = _service_filters(status, date_from, date_to,
                                      {'all', 'pending', 'approved', 'ongoing', 'completed'})
    with account_database(runtime.context, {'owner', 'sitter'}) as (conn, role):
        scope = 's.owner_id = ?' if role == 'owner' else 's.approved_sitter_id = ?'
        query = '''SELECT s.service_id, s.service_type, s.pet_type, s.number_of_pets,
                          s.service_date, s.service_time, s.duration, s.location,
                          s.salary, s.status AS service_status,
                          substr(s.full_address, 1, 500) AS full_address,
                          substr(o.username, 1, 80) AS owner_name,
                          substr(t.username, 1, 80) AS sitter_name
                   FROM services s JOIN users o ON o.user_id = s.owner_id
                   LEFT JOIN users t ON t.user_id = s.approved_sitter_id
                   WHERE ''' + ' AND '.join([scope, *clauses])
        result = _page(conn, query, [runtime.context.user_id, *params],
                       's.service_date ASC, s.service_time ASC, s.service_id ASC', offset)
        return {**result, 'scope': 'my_services' if role == 'owner' else 'my_assigned_bookings',
                'timezone': 'Asia/Kuala_Lumpur', 'status': status,
                'date_from': date_from, 'date_to': date_to}


@tool
def get_my_applications(
    runtime: ToolRuntime[ChatContext],
    status: Literal['all', 'pending', 'approved', 'rejected'] = 'all',
    date_from: str | None = None,
    date_to: str | None = None,
    offset: int = 0,
) -> dict:
    """Fetch applications to my services (owner) or applications I sent (sitter).

    Status is APPLICATION status. Optional inclusive YYYY-MM-DD dates filter the
    service start date, not application submission time. Returns 20 rows per page
    with total_matching and next_offset. Does not reveal addresses or contacts.
    """
    clauses, params = _service_filters('all', date_from, date_to, {'all'})
    if status not in {'all', 'pending', 'approved', 'rejected'}:
        raise ValueError('Unsupported application status.')
    if status != 'all':
        clauses.append('lower(a.status) = ?')
        params.append(status)
    with account_database(runtime.context, {'owner', 'sitter'}) as (conn, role):
        scope = 's.owner_id = ?' if role == 'owner' else 'a.sitter_id = ?'
        query = '''SELECT a.application_id, a.service_id, a.status AS application_status,
                          a.applied_at, s.service_type, s.service_date, s.service_time,
                          s.status AS service_status, s.location,
                          substr(a.applicant_name, 1, 120) AS applicant_name,
                          substr(o.username, 1, 80) AS owner_name
                   FROM applications a JOIN services s ON s.service_id = a.service_id
                   JOIN users o ON o.user_id = s.owner_id
                   WHERE ''' + ' AND '.join([scope, *clauses])
        return {**_page(conn, query, [runtime.context.user_id, *params],
                        'a.applied_at DESC, a.application_id DESC', offset),
                'scope': 'applications_to_my_services' if role == 'owner' else 'my_sent_applications',
                'status': status, 'date_from': date_from, 'date_to': date_to,
                'timezone': 'Asia/Kuala_Lumpur'}


@tool
def get_my_reviews(runtime: ToolRuntime[ChatContext], offset: int = 0) -> dict:
    """Fetch reviews I wrote (owner) or received (sitter), newest first.

    Includes all-time review count and average rating out of five for this scope.
    Returns 20 reviews per page with next_offset. Comments are limited to 2000
    characters. Owners receive no ratings; their average is for reviews they wrote.
    """
    with account_database(runtime.context, {'owner', 'sitter'}) as (conn, role):
        scope = 'r.owner_id = ?' if role == 'owner' else 'r.sitter_id = ?'
        params = [runtime.context.user_id]
        query = '''SELECT r.review_id, r.service_id, r.rating,
                          substr(r.review_comment, 1, 2000) AS review_comment, r.created_at,
                          substr(o.username, 1, 80) AS owner_name,
                          substr(t.username, 1, 80) AS sitter_name
                   FROM reviews r JOIN users o ON o.user_id = r.owner_id
                   JOIN users t ON t.user_id = r.sitter_id WHERE ''' + scope
        result = _page(conn, query, params, 'r.created_at DESC, r.review_id DESC', offset)
        average = conn.execute('SELECT AVG(r.rating) FROM reviews r WHERE ' + scope, params).fetchone()[0]
        return {**result, 'scope': 'reviews_i_wrote' if role == 'owner' else 'reviews_i_received',
                'period': 'all_time', 'average_rating': round(average, 2) if average is not None else None}


PERSONAL_TOOLS = [get_my_bookings, get_my_applications, get_my_reviews]


def tools_for_role(role):
    if role == 'admin':
        return ADMIN_TOOLS
    if role in {'pet_owner', 'pet_sitter'}:
        return PERSONAL_TOOLS
    return []
