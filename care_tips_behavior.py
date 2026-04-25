"""
Pet care tips: all copy lives in care_tips.json (including general.owner / general.sitter).

Simple rule (both dashboards): count services for a pet_type; if count >= 2,
show tips for that species and role. DB uses Title Case (e.g. Cat); JSON keys
are lowercase (e.g. cat). Below threshold, show general.owner or general.sitter.
"""

from __future__ import annotations

import json
import os
from collections import Counter
from typing import Any

_APP_DIR = os.path.dirname(os.path.abspath(__file__))
_CARE_TIPS_JSON = os.path.join(_APP_DIR, "care_tips.json")

# Tie-break when two pet types both meet the threshold (JSON key order).
PET_JSON_ORDER = ["dog", "cat", "rabbit", "fish", "bird"]

# Same threshold for owners (all listings) and sitters (completed only), per user request.
PET_TIP_MIN_COUNT = 2

MAX_TIPS_SHOWN = 2


def _load_care_tips() -> dict[str, dict[str, list[str]]]:
    try:
        with open(_CARE_TIPS_JSON, encoding="utf-8") as f:
            raw = json.load(f)
    except (OSError, json.JSONDecodeError):
        return {}
    out: dict[str, dict[str, list[str]]] = {}
    if not isinstance(raw, dict):
        return out
    for pet_key, block in raw.items():
        if not isinstance(pet_key, str) or not isinstance(block, dict):
            continue
        pk = pet_key.strip().lower()
        owner = block.get("owner")
        sitter = block.get("sitter")
        if isinstance(owner, list) and isinstance(sitter, list):
            out[pk] = {
                "owner": [str(x).strip() for x in owner if str(x).strip()],
                "sitter": [str(x).strip() for x in sitter if str(x).strip()],
            }
    return out


CARE_TIPS: dict[str, dict[str, list[str]]] = _load_care_tips()


def _db_pet_to_json_key(pet_type: str | None) -> str | None:
    if not pet_type:
        return None
    k = pet_type.strip().lower()
    if k == "general":
        return None
    return k if k in CARE_TIPS else None


def _pick_db_pet(pet_counts: Counter[str], min_count: int) -> tuple[str | None, int]:
    """Pick one DB pet_type (e.g. Cat) meeting min_count; highest count, then PET_JSON_ORDER."""
    eligible = []
    for db_pet, n in pet_counts.items():
        if n >= min_count and _db_pet_to_json_key(db_pet):
            eligible.append((db_pet, n))
    if not eligible:
        return None, 0
    db_pet, n = min(
        eligible,
        key=lambda x: (
            -x[1],
            PET_JSON_ORDER.index(_db_pet_to_json_key(x[0]) or "dog"),
        ),
    )
    return db_pet, n


def show_pet_tips(role: str, json_key: str | None) -> list[str]:
    """role is 'owner' or 'sitter'; json_key is e.g. 'cat', or None for general.* in JSON."""
    if json_key and json_key in CARE_TIPS and json_key != "general":
        block = CARE_TIPS[json_key]
        tips = block.get(role) or []
        if tips:
            return tips[:MAX_TIPS_SHOWN]
    gen = CARE_TIPS.get("general", {})
    tips = gen.get(role) or []
    return tips[:MAX_TIPS_SHOWN]


def build_owner_care_tips(conn: Any, user_id: int, _stats: dict) -> dict:
    rows = conn.execute(
        """
        SELECT pet_type, COUNT(*) AS c
        FROM services
        WHERE owner_id = ?
        GROUP BY pet_type
        """,
        (user_id,),
    ).fetchall()

    pet_counts: Counter[str] = Counter()
    for r in rows:
        pt = r["pet_type"]
        if pt:
            pet_counts[pt] += int(r["c"])

    pet_db, n = _pick_db_pet(pet_counts, PET_TIP_MIN_COUNT)
    jk = _db_pet_to_json_key(pet_db) if pet_db else None
    if jk:
        label = pet_db or jk.title()
        subtitle = (
            f"You have at least {PET_TIP_MIN_COUNT} services involving {label.lower()}s "
            f"({n} listings) — here are pet owner tips for {label.lower()}s."
        )
        return {"subtitle": subtitle, "tips": show_pet_tips("owner", jk)}

    subtitle = (
        f"Create at least {PET_TIP_MIN_COUNT} services for the same pet type "
        "(e.g. Cat or Dog) to unlock species-specific owner tips from our library."
    )
    return {"subtitle": subtitle, "tips": show_pet_tips("owner", None)}


def build_sitter_care_tips(conn: Any, user_id: int, _stats: dict) -> dict:
    rows = conn.execute(
        """
        SELECT pet_type, COUNT(*) AS c
        FROM services
        WHERE approved_sitter_id = ? AND lower(trim(status)) = 'completed'
        GROUP BY pet_type
        """,
        (user_id,),
    ).fetchall()

    pet_counts: Counter[str] = Counter()
    for r in rows:
        pt = r["pet_type"]
        if pt:
            pet_counts[pt] += int(r["c"])

    pet_db, n = _pick_db_pet(pet_counts, PET_TIP_MIN_COUNT)
    jk = _db_pet_to_json_key(pet_db) if pet_db else None
    if jk:
        label = pet_db or jk.title()
        subtitle = (
            f"You completed at least {PET_TIP_MIN_COUNT} jobs involving {label.lower()}s "
            f"({n} completed) — here are pet sitter tips for {label.lower()}s."
        )
        return {"subtitle": subtitle, "tips": show_pet_tips("sitter", jk)}

    subtitle = (
        f"Complete at least {PET_TIP_MIN_COUNT} jobs for the same pet type "
        "(e.g. Cat or Dog) to unlock species-specific sitter tips."
    )
    return {"subtitle": subtitle, "tips": show_pet_tips("sitter", None)}
