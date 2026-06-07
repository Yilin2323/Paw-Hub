"""
Behavior-based pet care tips for the owner and sitter dashboards.

All tip copy lives in care_tips.json, grouped into four sections:
  - general:  fallback tips per role
  - behavior: activity-driven tips (pending applications, ratings, outcomes...)
  - service:  tips per service type (Pet Sitting, Dog Walking, ...)
  - pet:      tips per species (dog, cat, rabbit, fish, bird)

Each build_* function looks at what the user has actually DONE (their listings,
applications, ratings, completed jobs) and assembles the two most relevant tips
in priority order: behavior signals first, then their dominant service type,
then the pet species they work with, then a general fallback.
"""

from __future__ import annotations

import json
import os
from collections import Counter
from typing import Any

_APP_DIR = os.path.dirname(os.path.abspath(__file__))
_CARE_TIPS_JSON = os.path.join(_APP_DIR, "care_tips.json")

# Tie-break when two pet types are equally common (earlier = preferred).
PET_JSON_ORDER = ["dog", "cat", "rabbit", "fish", "bird"]

MAX_TIPS_SHOWN = 2

# Rating thresholds that change which sitter tips we surface.
LOW_RATING_BELOW = 4.0
STRONG_RATING_AT_LEAST = 4.5


def _load_tips() -> dict:
    try:
        with open(_CARE_TIPS_JSON, encoding="utf-8") as f:
            data = json.load(f)
        return data if isinstance(data, dict) else {}
    except (OSError, json.JSONDecodeError):
        return {}


TIPS = _load_tips()


def _clean_list(value: Any) -> list[str]:
    if not isinstance(value, list):
        return []
    return [str(x).strip() for x in value if str(x).strip()]


def _role_list(block: Any, role: str) -> list[str]:
    """Pull the owner/sitter list out of a {owner: [...], sitter: [...]} block."""
    if isinstance(block, dict):
        return _clean_list(block.get(role))
    return []


def _general_tips(role: str) -> list[str]:
    return _role_list(TIPS.get("general", {}), role)


def _behavior_tips(role: str, key: str) -> list[str]:
    block = TIPS.get("behavior", {})
    role_block = block.get(role, {}) if isinstance(block, dict) else {}
    return _clean_list(role_block.get(key)) if isinstance(role_block, dict) else []


def _service_tips(service_type: str | None, role: str) -> list[str]:
    if not service_type:
        return []
    return _role_list(TIPS.get("service", {}).get(service_type, {}), role)


def _pet_tips(pet_key: str | None, role: str) -> list[str]:
    if not pet_key:
        return []
    return _role_list(TIPS.get("pet", {}).get(pet_key, {}), role)


def _dominant(counter: Counter, order: list[str] | None = None) -> str | None:
    """Most common key; ties broken by `order` (earlier wins), then alphabetically."""
    if not counter:
        return None

    def sort_key(item: tuple[str, int]):
        name, n = item
        if order and name in order:
            idx = order.index(name)
        else:
            idx = len(order) if order else 0
        return (-n, idx, name)

    return sorted(counter.items(), key=sort_key)[0][0]


def _flatten(sources: list[list[str]]) -> list[str]:
    out: list[str] = []
    for source in sources:
        for tip in source:
            if tip and tip not in out:
                out.append(tip)
    return out


def _mix(behavior: list[list[str]], context: list[list[str]], fallback: list[str]) -> list[str]:
    """
    Build the two shown tips so they reflect BOTH the user's activity and the
    pets/services they handle: take one behavior tip, then one context
    (service/species) tip. Fill any remaining slot from the other pools, then
    the general fallback.
    """
    behavior_tips = _flatten(behavior)
    context_tips = _flatten(context)

    picked: list[str] = []

    def add(tip: str) -> bool:
        if tip and tip not in picked:
            picked.append(tip)
        return len(picked) >= MAX_TIPS_SHOWN

    # One activity-based tip, then one pet/service-based tip.
    if behavior_tips and add(behavior_tips[0]):
        return picked
    if context_tips and add(context_tips[0]):
        return picked
    # Fill leftover slot: more context, then more behavior, then general.
    for tip in context_tips[1:] + behavior_tips[1:] + fallback:
        if add(tip):
            return picked
    return picked


def _pet_key_if_known(pet_db: str | None) -> str | None:
    if not pet_db:
        return None
    key = pet_db.strip().lower()
    return key if key in TIPS.get("pet", {}) else None


def build_owner_care_tips(conn: Any, user_id: int, stats: dict | None = None) -> dict:
    """Owner tips driven by their listings + how applicants are flowing in."""
    stats = stats or {}

    rows = conn.execute(
        "SELECT pet_type, service_type, status FROM services WHERE owner_id = ?",
        (user_id,),
    ).fetchall()

    # New owner with no listings yet → encouragement (handled by caller via is_new).
    if not rows:
        return {"tips": [], "is_new": True}

    pet_counts: Counter = Counter()
    service_counts: Counter = Counter()
    completed = 0
    for r in rows:
        if r["pet_type"]:
            pet_counts[r["pet_type"].strip().lower()] += 1
        if r["service_type"]:
            service_counts[r["service_type"]] += 1
        if (r["status"] or "").strip().lower() == "completed":
            completed += 1

    app_status = stats.get("applicationStatus") or {}
    pending = int(app_status.get("pending", 0) or 0)

    dom_service = _dominant(service_counts)
    dom_pet = _pet_key_if_known(_dominant(pet_counts, PET_JSON_ORDER))

    behavior: list[list[str]] = []
    # Activity signals, highest priority first.
    if pending > 0:
        behavior.append(_behavior_tips("owner", "pending_applications"))
    if completed == 0:
        behavior.append(_behavior_tips("owner", "no_completed_yet"))
    elif len(rows) >= 3:
        behavior.append(_behavior_tips("owner", "active_poster"))

    # Context: their most-used service type, then the species they post most.
    context = [_service_tips(dom_service, "owner"), _pet_tips(dom_pet, "owner")]

    return {
        "tips": _mix(behavior, context, _general_tips("owner")),
        "is_new": False,
    }


def build_sitter_care_tips(conn: Any, user_id: int, stats: dict | None = None) -> dict:
    """Sitter tips driven by their applications, ratings, and completed jobs."""
    stats = stats or {}

    app_status = stats.get("applicationStatus") or {}
    pending = int(app_status.get("pending", 0) or 0)
    approved = int(app_status.get("approved", 0) or 0)
    rejected = int(app_status.get("rejected", 0) or 0)
    total_apps = pending + approved + rejected
    joined = int(stats.get("joinedServices", 0) or 0)

    # Truly new sitter: never applied and never assigned → encouragement.
    if total_apps == 0 and joined == 0:
        return {"tips": [], "is_new": True}

    rating = stats.get("myRating")

    rows = conn.execute(
        """
        SELECT pet_type, service_type
        FROM services
        WHERE approved_sitter_id = ? AND lower(trim(status)) = 'completed'
        """,
        (user_id,),
    ).fetchall()

    pet_counts: Counter = Counter()
    service_counts: Counter = Counter()
    for r in rows:
        if r["pet_type"]:
            pet_counts[r["pet_type"].strip().lower()] += 1
        if r["service_type"]:
            service_counts[r["service_type"]] += 1

    dom_service = _dominant(service_counts)
    dom_pet = _pet_key_if_known(_dominant(pet_counts, PET_JSON_ORDER))

    behavior: list[list[str]] = []
    # Rating-based coaching.
    if isinstance(rating, (int, float)):
        if rating < LOW_RATING_BELOW:
            behavior.append(_behavior_tips("sitter", "build_rating"))
        elif rating >= STRONG_RATING_AT_LEAST:
            behavior.append(_behavior_tips("sitter", "strong_rating"))
    # Applications keep getting rejected with no wins yet.
    if rejected >= 2 and approved == 0:
        behavior.append(_behavior_tips("sitter", "many_rejected"))
    # Applied but not yet approved for any job.
    if joined == 0 and pending > 0:
        behavior.append(_behavior_tips("sitter", "awaiting_approval"))

    # Context: most-completed service type, then the species they care for most.
    context = [_service_tips(dom_service, "sitter"), _pet_tips(dom_pet, "sitter")]

    return {
        "tips": _mix(behavior, context, _general_tips("sitter")),
        "is_new": False,
    }
