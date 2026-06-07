"""
Free up an email address so it can be registered again on Paw Hub.

Useful between demo/recording takes: it deletes the user account that owns the
given email (matched case-insensitively) plus its related records so there are
no leftover foreign-key references.

Usage:
    python free_email.py someone@example.com
    python free_email.py first@example.com second@example.com
"""

import os
import sqlite3
import sys

_DB_DIR = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.path.join(_DB_DIR, "PawHub.db")


def _purge_user(conn, uid):
    """Delete a user's dependent rows, then the user itself (single transaction)."""
    owned = [
        r[0]
        for r in conn.execute(
            "SELECT service_id FROM services WHERE owner_id = ?", (uid,)
        ).fetchall()
    ]
    if owned:
        marks = ",".join("?" * len(owned))
        conn.execute(f"DELETE FROM applications WHERE service_id IN ({marks})", owned)
        conn.execute(f"DELETE FROM reviews WHERE service_id IN ({marks})", owned)
        conn.execute(f"DELETE FROM services WHERE service_id IN ({marks})", owned)

    # If this user was an approved sitter, detach them so the owner's listing stays.
    conn.execute(
        """
        UPDATE services
        SET approved_sitter_id = NULL,
            status = CASE
                WHEN lower(trim(status)) IN ('approved', 'completed') THEN 'pending'
                ELSE status
            END
        WHERE approved_sitter_id = ?
        """,
        (uid,),
    )

    conn.execute("DELETE FROM applications WHERE sitter_id = ?", (uid,))
    conn.execute("DELETE FROM reviews WHERE owner_id = ? OR sitter_id = ?", (uid, uid))
    conn.execute("DELETE FROM notifications WHERE user_id = ?", (uid,))
    conn.execute("DELETE FROM users WHERE user_id = ?", (uid,))


def free_email(email):
    """Remove the account using `email` (if any). Returns True if something was removed."""
    if not email:
        return False
    target = email.strip().lower()
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    try:
        row = conn.execute(
            "SELECT user_id, username, role FROM users WHERE lower(trim(email)) = ?",
            (target,),
        ).fetchone()
        if not row:
            print(f"  '{email}' is already free (no account found).")
            return False
        conn.execute("BEGIN")
        _purge_user(conn, int(row["user_id"]))
        conn.commit()
        print(
            f"  Removed {row['role']} '{row['username']}' (user_id={row['user_id']}) "
            f"using '{email}'."
        )
        return True
    finally:
        conn.close()


def main(argv):
    if len(argv) < 2:
        print("Usage: python free_email.py <email> [<email> ...]")
        return 1
    if not os.path.exists(DB_PATH):
        print(f"Database not found at {DB_PATH}")
        return 1
    for email in argv[1:]:
        print(f"Freeing: {email}")
        free_email(email)
    print("Done. You can register these emails again.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))

