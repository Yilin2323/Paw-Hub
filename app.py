import glob
import json
import os
import re
import secrets
import smtplib
import sqlite3
import urllib.error
import urllib.request
from datetime import datetime, timedelta, timezone
from email.message import EmailMessage
from urllib.parse import urlparse

from flask import (
    Flask,
    flash,
    jsonify,
    redirect,
    render_template,
    request,
    session,
    url_for,
)
from werkzeug.security import check_password_hash, generate_password_hash

_APP_DIR = os.path.dirname(os.path.abspath(__file__))
AVATAR_MAX_BYTES = 5 * 1024 * 1024
AVATAR_STATIC_PREFIX = "uploads/avatars"


def _image_extension_from_magic(prefix: bytes):
    """Return file suffix (e.g. '.png') from magic bytes, or None."""
    if len(prefix) < 12:
        return None
    if prefix.startswith(b"\xff\xd8\xff"):
        return ".jpg"
    if prefix.startswith(b"\x89PNG\r\n\x1a\n"):
        return ".png"
    if prefix[:6] in (b"GIF87a", b"GIF89a"):
        return ".gif"
    if prefix.startswith(b"RIFF") and len(prefix) >= 12 and prefix[8:12] == b"WEBP":
        return ".webp"
    return None


def _avatar_abs_dir():
    return os.path.join(_APP_DIR, "static", "uploads", "avatars")


def _static_file_exists(relative_under_static: str) -> bool:
    if not relative_under_static or ".." in relative_under_static:
        return False
    parts = relative_under_static.replace("\\", "/").split("/")
    full = os.path.realpath(os.path.join(_APP_DIR, "static", *parts))
    root = os.path.realpath(os.path.join(_APP_DIR, "static"))
    if full != root and not full.startswith(root + os.sep):
        return False
    return os.path.isfile(full)


def _save_user_avatar_file(user_id: int, file_storage):
    """
    Validate and save uploaded avatar. Returns (ok, error_message, relative_static_path).
    relative_static_path like 'uploads/avatars/3.png' for url_for('static', filename=...).
    """
    if not file_storage or not (file_storage.filename or "").strip():
        return False, "No file selected.", None
    raw = file_storage.read(AVATAR_MAX_BYTES + 1)
    if len(raw) > AVATAR_MAX_BYTES:
        return False, "Image must be 5 MB or smaller.", None
    ext = _image_extension_from_magic(raw[:16])
    if not ext:
        return False, "Please upload a JPG, PNG, GIF, or WebP image.", None

    dest_dir = _avatar_abs_dir()
    os.makedirs(dest_dir, exist_ok=True)
    for old in glob.glob(os.path.join(dest_dir, f"{int(user_id)}.*")):
        try:
            os.remove(old)
        except OSError:
            pass

    basename = f"{int(user_id)}{ext}"
    abs_path = os.path.join(dest_dir, basename)
    try:
        with open(abs_path, "wb") as f:
            f.write(raw)
    except OSError as e:
        return False, f"Could not save image ({e}).", None

    rel = f"{AVATAR_STATIC_PREFIX}/{basename}"
    return True, "", rel


def _avatar_url_for_storage(relative_path):
    """Build avatar URL; fall back to default cat image."""
    fn = (relative_path or "").strip()
    if fn and _static_file_exists(fn):
        return url_for("static", filename=fn)
    return url_for("static", filename="images/cat.png")
try:
    from dotenv import load_dotenv

    load_dotenv(os.path.join(_APP_DIR, ".env"))
except ImportError:
    pass

app = Flask(__name__)
app.secret_key = os.environ.get("FLASK_SECRET_KEY") or os.environ.get(
    "SECRET_KEY", "dev-mock-secret-change-in-production"
)

DATABASE = os.path.join(_APP_DIR, "PawHub.db")

# -----------------------------------------------------------------------------
# Chatbot: Kimi (Moonshot) via NVIDIA OpenAI-compatible API.
# In .env:
#   NVIDIA_API_KEY=your_key
#   KIMI_MODEL=moonshotai/kimi-k2.5
# Optional:
#   NVIDIA_CHAT_URL=https://integrate.api.nvidia.com/v1/chat/completions
# -----------------------------------------------------------------------------
NVIDIA_API_KEY = os.environ.get("NVIDIA_API_KEY", "").strip()
KIMI_MODEL = os.environ.get("KIMI_MODEL", "moonshotai/kimi-k2.5").strip()
NVIDIA_CHAT_URL = os.environ.get(
    "NVIDIA_CHAT_URL", "https://integrate.api.nvidia.com/v1/chat/completions"
).strip()

_PAW_HUB_CHATBOT_SYSTEM = (
    "You are Paw Hub Assistant, a concise and friendly guide for the Paw Hub pet-care "
    "platform: pet owners create service listings, pet sitters apply to jobs, and "
    "administrators manage users and platform data. Give short, practical answers. "
    "If a question needs account-specific data you do not have, explain what the user "
    "can do in the app or suggest they check Notifications, Services, or Profile."
)


def _call_nvidia_kimi_chat(openai_messages):
    """
    NVIDIA integrate OpenAI-compatible chat. `openai_messages` includes system + user/assistant.
    Returns (reply_text, None) or (None, error_code).
    """
    if not NVIDIA_API_KEY:
        return None, "missing_api_key"

    auth = NVIDIA_API_KEY
    if not auth.lower().startswith("bearer "):
        auth = f"Bearer {auth}"

    body = {
        "model": KIMI_MODEL,
        "messages": openai_messages,
        "max_tokens": 1024,
        "temperature": 0.7,
        "top_p": 0.95,
        "stream": False,
    }
    req = urllib.request.Request(
        NVIDIA_CHAT_URL,
        data=json.dumps(body).encode("utf-8"),
        headers={
            "Authorization": auth,
            "Content-Type": "application/json; charset=utf-8",
            "Accept": "application/json",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=90) as resp:
            data = json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError:
        return None, "api_http_error"
    except urllib.error.URLError:
        return None, "network_error"
    except json.JSONDecodeError:
        return None, "bad_response"

    if data.get("error"):
        return None, "api_error"

    choices = data.get("choices") or []
    if not choices:
        return None, "no_reply"

    msg = (choices[0].get("message") or {}).get("content") or ""
    text = str(msg).strip()
    if not text:
        return None, "empty_reply"
    return text, None


def get_db():
    conn = sqlite3.connect(DATABASE)
    conn.row_factory = sqlite3.Row
    return conn


OTP_LENGTH = 6
OTP_EXPIRY_MINUTES = 10
OTP_RESEND_SECONDS = 60
MAIL_SERVER = os.environ.get("MAIL_SERVER", "smtp.gmail.com").strip()
MAIL_PORT = int(os.environ.get("MAIL_PORT", "587") or "587")
MAIL_USE_TLS = os.environ.get("MAIL_USE_TLS", "1").strip().lower() not in (
    "0",
    "false",
    "no",
)
# Gmail also supports implicit TLS on port 465 (use when 587 is blocked or STARTTLS fails).
MAIL_USE_SSL = os.environ.get("MAIL_USE_SSL", "0").strip().lower() in (
    "1",
    "true",
    "yes",
)


def _mail_credentials():
    """Load SMTP login from env; tolerate BOM, surrounding quotes, spaces in app passwords."""
    raw_u = (os.environ.get("MAIL_USERNAME") or "").strip().lstrip("\ufeff")
    raw_p = (os.environ.get("MAIL_PASSWORD") or "").strip().lstrip("\ufeff")
    if (raw_p.startswith('"') and raw_p.endswith('"')) or (
        raw_p.startswith("'") and raw_p.endswith("'")
    ):
        raw_p = raw_p[1:-1]
    password = raw_p.replace(" ", "")
    return raw_u, password


def _migrate_users_email_otp_columns(conn):
    """Add email verification + OTP columns to existing SQLite DBs."""
    if not conn.execute(
        "SELECT 1 FROM sqlite_master WHERE type='table' AND name='users' LIMIT 1"
    ).fetchone():
        return False
    cols = {row[1] for row in conn.execute("PRAGMA table_info(users)")}
    changed = False
    if "email_verified" not in cols:
        conn.execute(
            "ALTER TABLE users ADD COLUMN email_verified INTEGER NOT NULL DEFAULT 1"
        )
        changed = True
    if "otp_code_hash" not in cols:
        conn.execute("ALTER TABLE users ADD COLUMN otp_code_hash TEXT")
        changed = True
    if "otp_expires_at" not in cols:
        conn.execute("ALTER TABLE users ADD COLUMN otp_expires_at TEXT")
        changed = True
    if "otp_last_sent_at" not in cols:
        conn.execute("ALTER TABLE users ADD COLUMN otp_last_sent_at TEXT")
        changed = True
    if "pwd_reset_otp_hash" not in cols:
        conn.execute("ALTER TABLE users ADD COLUMN pwd_reset_otp_hash TEXT")
        changed = True
    if "pwd_reset_otp_expires_at" not in cols:
        conn.execute("ALTER TABLE users ADD COLUMN pwd_reset_otp_expires_at TEXT")
        changed = True
    if "pwd_reset_otp_sent_at" not in cols:
        conn.execute("ALTER TABLE users ADD COLUMN pwd_reset_otp_sent_at TEXT")
        changed = True
    if "avatar_filename" not in cols:
        conn.execute("ALTER TABLE users ADD COLUMN avatar_filename TEXT")
        changed = True
    return changed


def _migrate_applications_applicant_age(conn):
    """Add per-application age for sitter apply form (existing rows may stay NULL)."""
    if not conn.execute(
        "SELECT 1 FROM sqlite_master WHERE type='table' AND name='applications' LIMIT 1"
    ).fetchone():
        return False
    cols = {row[1] for row in conn.execute("PRAGMA table_info(applications)")}
    if "applicant_age" in cols:
        return False
    conn.execute(
        "ALTER TABLE applications ADD COLUMN applicant_age INTEGER CHECK ("
        "applicant_age IS NULL OR (applicant_age >= 1 AND applicant_age <= 120))"
    )
    return True


def ensure_users_email_otp_schema():
    conn = get_db()
    try:
        if _migrate_users_email_otp_columns(conn):
            conn.commit()
    finally:
        conn.close()


def ensure_applications_applicant_age_schema():
    conn = get_db()
    try:
        if _migrate_applications_applicant_age(conn):
            conn.commit()
    finally:
        conn.close()


ensure_users_email_otp_schema()
ensure_applications_applicant_age_schema()


def _generate_otp_code():
    return f"{secrets.randbelow(10**OTP_LENGTH):0{OTP_LENGTH}d}"


def _utc_naive_iso(dt):
    return dt.replace(tzinfo=None).isoformat(timespec="seconds")


def _parse_utc_naive_iso(s):
    if not s:
        return None
    try:
        return datetime.fromisoformat(s)
    except ValueError:
        return None


def mask_email_for_display(email):
    if not email or "@" not in email:
        return email or ""
    local, domain = email.split("@", 1)
    if len(local) <= 1:
        return f"*@{domain}"
    return f"{local[0]}***@{domain}"


def _smtp_auth_failed_help():
    return (
        "Gmail: enable 2-Step Verification, create an App Password (Google Account → Security), "
        "and put that 16-character password in MAIL_PASSWORD (not your normal Gmail password). "
        "MAIL_USERNAME must be your full Gmail address. "
        "If it still fails, try MAIL_USE_SSL=1, MAIL_PORT=465, or check a VPN/firewall blocking SMTP."
    )


def send_otp_email(to_address, otp_code, purpose):
    """
    Send a 6-digit OTP via SMTP. purpose: 'signup' | 'password_reset'.
    Returns (success: bool, error_message: str).
    """
    from_addr, password = _mail_credentials()
    if not from_addr or not password:
        return False, "Email could not be sent: set MAIL_USERNAME and MAIL_PASSWORD in .env."

    if purpose == "password_reset":
        subject = "Your Paw Hub password reset code"
        body_text = (
            f"Your password reset code is: {otp_code}\n\n"
            f"This code expires in {OTP_EXPIRY_MINUTES} minutes.\n"
            "If you did not request a password reset, you can ignore this email.\n"
        )
    else:
        subject = "Your Paw Hub verification code"
        body_text = (
            f"Your Paw Hub verification code is: {otp_code}\n\n"
            f"This code expires in {OTP_EXPIRY_MINUTES} minutes.\n"
            "If you did not create an account, you can ignore this email.\n"
        )
    msg = EmailMessage()
    msg["Subject"] = subject
    msg["From"] = from_addr
    msg["To"] = to_address
    msg.set_content(body_text)

    def _send_with(smtp_factory, use_starttls):
        with smtp_factory() as smtp:
            if use_starttls:
                smtp.starttls()
            smtp.login(from_addr, password)
            smtp.send_message(msg)

    try:
        if MAIL_USE_SSL:
            _send_with(
                lambda: smtplib.SMTP_SSL(MAIL_SERVER, MAIL_PORT, timeout=30),
                False,
            )
        elif MAIL_USE_TLS:
            _send_with(
                lambda: smtplib.SMTP(MAIL_SERVER, MAIL_PORT, timeout=30),
                True,
            )
        else:
            _send_with(
                lambda: smtplib.SMTP_SSL(MAIL_SERVER, MAIL_PORT, timeout=30),
                False,
            )
    except smtplib.SMTPAuthenticationError as e:
        extra = ""
        if getattr(e, "smtp_code", None) is not None:
            err_b = e.smtp_error
            if isinstance(err_b, bytes):
                err_b = err_b.decode("utf-8", errors="replace")
            extra = f" [{e.smtp_code} {err_b}]"
        return (
            False,
            "SMTP login was rejected (wrong username/password or account security settings)."
            + extra
            + " "
            + _smtp_auth_failed_help(),
        )
    except OSError as e:
        return False, f"Email could not be sent ({e.__class__.__name__}). Check MAIL_* and network."
    except smtplib.SMTPException as e:
        return False, f"Email could not be sent: {e}"

    return True, ""


def send_verification_otp_email(to_address, otp_code):
    """Signup / email verification OTP (wrapper)."""
    return send_otp_email(to_address, otp_code, "signup")


def assign_and_email_otp(conn, user_id, email):
    """
    Send OTP email first; only then store hash + expiry (so a failed send leaves the prior code valid).
    Returns (success, error_message).
    """
    otp = _generate_otp_code()
    ok, err = send_otp_email(email, otp, "signup")
    if not ok:
        return ok, err
    otp_hash = generate_password_hash(otp)
    now = datetime.now(timezone.utc)
    expires = now + timedelta(minutes=OTP_EXPIRY_MINUTES)
    sent_iso = _utc_naive_iso(now)
    exp_iso = _utc_naive_iso(expires)
    conn.execute(
        """
        UPDATE users
        SET otp_code_hash = ?, otp_expires_at = ?, otp_last_sent_at = ?
        WHERE user_id = ?
        """,
        (otp_hash, exp_iso, sent_iso, user_id),
    )
    return True, ""


def assign_password_reset_otp(conn, user_id, email):
    """
    Password-reset OTP in pwd_reset_* columns (separate from signup email verification).
    Send email first, then store hash + expiry. Returns (success, error_message).
    """
    otp = _generate_otp_code()
    ok, err = send_otp_email(email, otp, "password_reset")
    if not ok:
        return ok, err
    otp_hash = generate_password_hash(otp)
    now = datetime.now(timezone.utc)
    expires = now + timedelta(minutes=OTP_EXPIRY_MINUTES)
    sent_iso = _utc_naive_iso(now)
    exp_iso = _utc_naive_iso(expires)
    conn.execute(
        """
        UPDATE users
        SET pwd_reset_otp_hash = ?, pwd_reset_otp_expires_at = ?, pwd_reset_otp_sent_at = ?
        WHERE user_id = ?
        """,
        (otp_hash, exp_iso, sent_iso, user_id),
    )
    return True, ""


def get_user_by_email(email):
    if not email:
        return None
    conn = get_db()
    try:
        row = conn.execute(
            """
            SELECT user_id, username, role, email, password, is_suspended,
                   email_verified, otp_code_hash, otp_expires_at, otp_last_sent_at,
                   pwd_reset_otp_hash, pwd_reset_otp_expires_at, pwd_reset_otp_sent_at,
                   avatar_filename
            FROM users
            WHERE lower(trim(email)) = ?
            """,
            (email.strip().lower(),),
        ).fetchone()
        return row
    finally:
        conn.close()


def get_user_by_id(user_id):
    if not user_id:
        return None
    try:
        uid = int(user_id)
    except (TypeError, ValueError):
        return None
    conn = get_db()
    try:
        return conn.execute(
            """
            SELECT user_id, username, role, email, password, is_suspended,
                   email_verified, otp_code_hash, otp_expires_at, otp_last_sent_at,
                   pwd_reset_otp_hash, pwd_reset_otp_expires_at, pwd_reset_otp_sent_at,
                   avatar_filename
            FROM users
            WHERE user_id = ?
            """,
            (uid,),
        ).fetchone()
    finally:
        conn.close()


def fetch_owner_dashboard_stats(user_id):
    """Counts from DB for the logged-in owner (new users → zeros / empty)."""
    if not user_id:
        return {
            "totalServices": 0,
            "joinedDays": 1,
            "applicationStatus": {"pending": 0, "approved": 0, "rejected": 0},
            "serviceTypes": [
                {"label": t, "value": 0} for t in OWNER_DASHBOARD_SERVICE_TYPES
            ],
        }
    conn = get_db()
    try:
        total_services = conn.execute(
            "SELECT COUNT(*) AS c FROM services WHERE owner_id = ?",
            (user_id,),
        ).fetchone()["c"]

        created_row = conn.execute(
            "SELECT created_at FROM users WHERE user_id = ?",
            (user_id,),
        ).fetchone()
        joined_days = _joined_days_since_registration(
            created_row["created_at"] if created_row else None
        )

        app_status = {"pending": 0, "approved": 0, "rejected": 0}
        for row in conn.execute(
            """
            SELECT a.status AS st, COUNT(*) AS c
            FROM applications a
            INNER JOIN services s ON a.service_id = s.service_id
            WHERE s.owner_id = ?
            GROUP BY a.status
            """,
            (user_id,),
        ):
            key = (row["st"] or "").lower()
            if key in app_status:
                app_status[key] = int(row["c"])

        counts_by_type = {}
        for row in conn.execute(
            """
            SELECT service_type AS st, COUNT(*) AS c
            FROM services
            WHERE owner_id = ? AND lower(status) = 'completed'
            GROUP BY service_type
            """,
            (user_id,),
        ):
            counts_by_type[row["st"]] = int(row["c"])

        service_types = [
            {"label": name, "value": counts_by_type.get(name, 0)}
            for name in OWNER_DASHBOARD_SERVICE_TYPES
        ]

        return {
            "totalServices": int(total_services),
            "joinedDays": joined_days,
            "applicationStatus": app_status,
            "serviceTypes": service_types,
        }
    finally:
        conn.close()


ADMIN_SERVICE_TYPE_ORDER = (
    "Pet Sitting",
    "Pet Day Care",
    "Pet Taxi",
    "Pet Training",
    "Dog Walking",
)

# Owner dashboard donut: completed jobs only (owner marked service complete).
OWNER_DASHBOARD_SERVICE_TYPES = (
    "Pet Day Care",
    "Pet Sitting",
    "Pet Training",
    "Pet Taxi",
    "Dog Walking",
)

# Sitter dashboard: same five types (counts = completed jobs as assigned sitter).
SITTER_DASHBOARD_SERVICE_TYPES = OWNER_DASHBOARD_SERVICE_TYPES


def _joined_days_since_registration(created_at_raw):
    """Calendar days on Paw Hub, inclusive of signup day (minimum 1)."""
    if created_at_raw is None:
        return 1
    s = str(created_at_raw).strip()
    if not s:
        return 1
    try:
        if "T" in s:
            d = datetime.fromisoformat(s.replace("Z", "+00:00")).date()
        else:
            d = datetime.strptime(s[:10], "%Y-%m-%d").date()
    except ValueError:
        return 1
    today = datetime.now(timezone.utc).date()
    return max(1, (today - d).days + 1)


def _format_activity_timestamp(ts):
    if ts is None:
        return ""
    s = str(ts).strip()
    if not s:
        return ""
    head = s[:19]
    try:
        return datetime.strptime(head, "%Y-%m-%d %H:%M:%S").strftime("%d %b %Y, %H:%M")
    except ValueError:
        return s


def fetch_admin_dashboard_payload():
    """Aggregates for admin dashboard (SQLite)."""
    conn = get_db()
    try:
        # "Users" for admin stats = owners + sitters only (excludes admin accounts)
        total_users = int(
            conn.execute("SELECT COUNT(*) AS c FROM users WHERE lower(role) IN ('owner', 'sitter')").fetchone()["c"]
        )

        total_owners = int(
            conn.execute(
                "SELECT COUNT(*) AS c FROM users WHERE lower(role) = 'owner'"
            ).fetchone()["c"]
        )
        total_sitters = int(
            conn.execute(
                "SELECT COUNT(*) AS c FROM users WHERE lower(role) = 'sitter'"
            ).fetchone()["c"]
        )


        counts_by_type = {}
        for row in conn.execute(
            """
            SELECT service_type AS st, COUNT(*) AS c
            FROM services
            WHERE lower(status) = 'completed'
            GROUP BY service_type
            """
        ):
            counts_by_type[row["st"]] = int(row["c"])

        service_types = [
            {"label": label, "value": int(counts_by_type.get(label, 0))}
            for label in ADMIN_SERVICE_TYPE_ORDER
        ]

        activity_rows = conn.execute(
            """
            SELECT activity_summary, activity_ts, activity_kind FROM (
                SELECT
                    ('User registered: ' || username || ' (' || role || ')')
                        AS activity_summary,
                    created_at AS activity_ts,
                    user_id AS sort_id,
                    'user' AS activity_kind
                FROM users
                UNION ALL
                SELECT
                    ('Service listing: ' || service_type || ' · ' || pet_type),
                    created_at,
                    service_id,
                    'service'
                FROM services
                UNION ALL
                SELECT
                    ('Application: ' || applicant_name || ' · ' || status),
                    applied_at,
                    application_id,
                    'application'
                FROM applications
                UNION ALL
                SELECT message, created_at, notification_id, 'notification'
                FROM notifications
                UNION ALL
                SELECT
                    ('Review: ' || rating || '/5 stars'),
                    created_at,
                    review_id,
                    'review'
                FROM reviews
            )
            WHERE activity_ts IS NOT NULL AND trim(activity_summary) != ''
            ORDER BY activity_ts DESC, sort_id DESC
            LIMIT 3
            """
        ).fetchall()

        recent_activity = [
            {
                "summary": r["activity_summary"],
                "timeLabel": _format_activity_timestamp(r["activity_ts"]),
                "kind": r["activity_kind"],
            }
            for r in activity_rows
        ]

        return {
            "totalUsers": total_users,
            "totalOwners": total_owners,
            "totalSitters": total_sitters,
            "serviceTypes": service_types,
            "recentActivity": recent_activity,
        }
    finally:
        conn.close()


def _admin_user_search_blob(**parts):
    chunks = []
    for v in parts.values():
        if v is None:
            continue
        s = str(v).strip()
        if s and s != "—":
            chunks.append(s)
    return re.sub(r"\s+", " ", " ".join(chunks)).lower()


def _admin_rating_star_glyphs(numeric):
    if numeric is None:
        return ""
    try:
        n = int(round(min(5, max(0, float(numeric)))))
    except (TypeError, ValueError):
        return ""
    return "\u2605" * n + "\u2606" * (5 - n)


def _admin_user_row_dict(row, review_avg, review_text, is_suspended, *, role_key):
    g = row["gender"]
    gender_display = g if g else "—"
    avg = review_avg
    rating_numeric = None
    if avg is not None:
        try:
            rating_numeric = float(avg)
        except (TypeError, ValueError):
            rating_numeric = None
    if rating_numeric is not None:
        rating_label = f"{rating_numeric:.1f}"
    else:
        rating_label = "—"
    rev = (review_text or "").strip() or "—"
    role_label = "Pet Owner" if role_key == "owner" else "Pet Sitter"
    return {
        "userId": row["user_id"],
        "username": row["username"],
        "email": row["email"],
        "phone": row["phone_number"],
        "gender": gender_display,
        "ratingLabel": rating_label,
        "ratingNumeric": rating_numeric,
        "starGlyphs": _admin_rating_star_glyphs(rating_numeric),
        "reviewSummary": rev,
        "isSuspended": bool(is_suspended),
        "roleKey": role_key,
        "roleLabel": role_label,
        "searchBlob": _admin_user_search_blob(
            username=row["username"],
            email=row["email"],
            phone=row["phone_number"],
            gender=gender_display,
            review=rev,
            role=role_label,
        ),
    }


def fetch_admin_users_lists():
    """Pet owners and sitters (SQLite). Sitters include review aggregates; owners do not."""
    conn = get_db()
    try:
        sitter_review = {}
        for r in conn.execute(
            """
            SELECT sitter_id AS uid,
                   AVG(rating) AS avg_r,
                   GROUP_CONCAT(TRIM(COALESCE(review_comment, '')), char(10)) AS txt
            FROM reviews
            GROUP BY sitter_id
            """
        ):
            uid = r["uid"]
            parts = [p.strip() for p in (r["txt"] or "").split("\n") if p.strip()]
            merged = " · ".join(parts) if parts else ""
            sitter_review[uid] = {"avg": r["avg_r"], "text": merged}

        pet_owners = []
        for row in conn.execute(
            """
            SELECT user_id, username, email, phone_number, gender, role, is_suspended
            FROM users
            WHERE lower(role) = 'owner'
            ORDER BY lower(username)
            """
        ):
            pet_owners.append(
                _admin_user_row_dict(
                    row,
                    None,
                    None,
                    row["is_suspended"],
                    role_key="owner",
                )
            )

        pet_sitters = []
        for row in conn.execute(
            """
            SELECT user_id, username, email, phone_number, gender, role, is_suspended
            FROM users
            WHERE lower(role) = 'sitter'
            ORDER BY lower(username)
            """
        ):
            agg = sitter_review.get(row["user_id"], {})
            pet_sitters.append(
                _admin_user_row_dict(
                    row,
                    agg.get("avg"),
                    agg.get("text"),
                    row["is_suspended"],
                    role_key="sitter",
                )
            )

        return pet_owners, pet_sitters
    finally:
        conn.close()


def fetch_sitter_dashboard_stats(user_id):
    """Counts from DB for the logged-in sitter (new users → zeros / empty)."""
    if not user_id:
        return {
            "joinedServices": 0,
            "myRating": None,
            "applicationStatus": {"pending": 0, "approved": 0, "rejected": 0},
            "serviceCategoriesJoined": [
                {"label": t, "value": 0} for t in SITTER_DASHBOARD_SERVICE_TYPES
            ],
        }
    conn = get_db()
    try:
        joined = conn.execute(
            "SELECT COUNT(*) AS c FROM services WHERE approved_sitter_id = ?",
            (user_id,),
        ).fetchone()["c"]

        avg_row = conn.execute(
            "SELECT AVG(rating) AS avg_r FROM reviews WHERE sitter_id = ?",
            (user_id,),
        ).fetchone()["avg_r"]

        app_status = {"pending": 0, "approved": 0, "rejected": 0}
        for row in conn.execute(
            """
            SELECT status AS st, COUNT(*) AS c
            FROM applications
            WHERE sitter_id = ?
            GROUP BY status
            """,
            (user_id,),
        ):
            key = (row["st"] or "").lower()
            if key in app_status:
                app_status[key] = int(row["c"])

        counts_by_type = {}
        for row in conn.execute(
            """
            SELECT s.service_type AS st, COUNT(*) AS c
            FROM services s
            WHERE s.approved_sitter_id = ? AND lower(s.status) = 'completed'
            GROUP BY s.service_type
            """,
            (user_id,),
        ):
            counts_by_type[row["st"]] = int(row["c"])

        categories = [
            {"label": name, "value": counts_by_type.get(name, 0)}
            for name in SITTER_DASHBOARD_SERVICE_TYPES
        ]

        my_rating = None
        if avg_row is not None:
            my_rating = round(float(avg_row), 1)

        return {
            "joinedServices": int(joined),
            "myRating": my_rating,
            "applicationStatus": app_status,
            "serviceCategoriesJoined": categories,
        }
    finally:
        conn.close()


def _format_service_date(iso_date):
    if not iso_date:
        return "—"
    try:
        return datetime.strptime(str(iso_date)[:10], "%Y-%m-%d").strftime("%d %B %Y")
    except (ValueError, TypeError):
        return str(iso_date)


def _format_posted_at(val):
    """When the listing was created (services.created_at), for sitter cards."""
    if not val:
        return "—"
    s = str(val).strip().replace("T", " ")
    try:
        if len(s) >= 19:
            dt = datetime.strptime(s[:19], "%Y-%m-%d %H:%M:%S")
        elif len(s) >= 16:
            dt = datetime.strptime(s[:16], "%Y-%m-%d %H:%M")
        else:
            dt = datetime.strptime(s[:10], "%Y-%m-%d")
        return dt.strftime("%d %b %Y, %I:%M %p")
    except (ValueError, TypeError):
        return s[:19] if len(s) > 10 else "—"


def _salary_display(val):
    if val is None:
        return "—"
    v = float(val)
    if abs(v - round(v)) < 0.001:
        return f"RM {int(round(v))}"
    return f"RM {v:.2f}"


def _word_count(text):
    if not text:
        return 0
    return len([w for w in str(text).split() if w])


def _service_row_to_card(row):
    return {
        "id": row["service_id"],
        "serviceType": row["service_type"],
        "petType": row["pet_type"],
        "pets": row["number_of_pets"],
        "date": _format_service_date(row["service_date"]),
        "time": row["service_time"] or "—",
        "location": row["location"],
        "salary": _salary_display(row["salary"]),
        "description": (row["description"] or "").strip(),
        "sitterApplied": row["approved_sitter_id"] is not None,
        "postedAt": _format_posted_at(row["created_at"]),
    }


def _service_row_to_card_for_sitter(row):
    """Adds owner username; postedAt comes from _service_row_to_card (under status badge)."""
    card = _service_row_to_card(row)
    card["ownerName"] = (row["owner_name"] or "").strip() or "Owner"
    return card


def _fetch_sitter_reputation_bundle(conn, sitter_id):
    """Average rating, count, and up to 3 most recent review snippets for a sitter."""
    agg = conn.execute(
        """
        SELECT AVG(rating) AS avg_r, COUNT(*) AS c
        FROM reviews
        WHERE sitter_id = ?
        """,
        (sitter_id,),
    ).fetchone()
    cnt = int(agg["c"] or 0)
    avg = None
    if cnt > 0 and agg["avg_r"] is not None:
        avg = round(float(agg["avg_r"]), 1)
    rev_rows = conn.execute(
        """
        SELECT rating, review_comment, created_at
        FROM reviews
        WHERE sitter_id = ?
        ORDER BY datetime(created_at) DESC
        LIMIT 3
        """,
        (sitter_id,),
    ).fetchall()
    past = []
    for rr in rev_rows:
        past.append(
            {
                "rating": int(rr["rating"]),
                "comment": (rr["review_comment"] or "").strip(),
                "createdAt": str(rr["created_at"] or "")[:19].replace("T", " "),
            }
        )
    return {"avgRating": avg, "reviewCount": cnt, "pastReviews": past}


def fetch_owner_service_partition(owner_id):
    """Owner My Services: pending listings, active jobs (approved/ongoing), and completed."""
    if not owner_id:
        return {"latest": [], "upcoming": [], "completed": []}
    conn = get_db()
    try:
        rows = conn.execute(
            """
            SELECT * FROM services
            WHERE owner_id = ?
            ORDER BY service_id DESC
            """,
            (owner_id,),
        ).fetchall()
        latest, upcoming, completed = [], [], []
        for r in rows:
            card = _service_row_to_card(r)
            st = (r["status"] or "").lower()
            if st == "pending":
                latest.append(card)
            elif st in ("approved", "ongoing"):
                upcoming.append(card)
            elif st == "completed":
                completed.append(card)
        return {"latest": latest, "upcoming": upcoming, "completed": completed}
    finally:
        conn.close()


def fetch_owner_pet_rows_for_tips(owner_id):
    if not owner_id:
        return []
    conn = get_db()
    try:
        rows = conn.execute(
            "SELECT pet_type FROM services WHERE owner_id = ?",
            (owner_id,),
        ).fetchall()
        return [{"petType": r["pet_type"]} for r in rows]
    finally:
        conn.close()


def fetch_sitter_service_partition(sitter_id):
    if not sitter_id:
        return {"browse": [], "upcoming": [], "completed": []}
    conn = get_db()
    try:
        applied_rows = conn.execute(
            "SELECT service_id FROM applications WHERE sitter_id = ?",
            (sitter_id,),
        ).fetchall()
        applied_ids = {int(r["service_id"]) for r in applied_rows}

        browse_rows = conn.execute(
            """
            SELECT s.*, u.username AS owner_name
            FROM services s
            INNER JOIN users u ON u.user_id = s.owner_id
            WHERE s.status = 'pending' AND s.owner_id != ?
            ORDER BY s.service_id DESC
            """,
            (sitter_id,),
        ).fetchall()
        up_rows = conn.execute(
            """
            SELECT s.*, u.username AS owner_name
            FROM services s
            INNER JOIN users u ON u.user_id = s.owner_id
            WHERE s.approved_sitter_id = ? AND s.status IN ('approved', 'ongoing')
            ORDER BY s.service_id DESC
            """,
            (sitter_id,),
        ).fetchall()
        done_rows = conn.execute(
            """
            SELECT s.*, u.username AS owner_name
            FROM services s
            INNER JOIN users u ON u.user_id = s.owner_id
            WHERE s.approved_sitter_id = ? AND s.status = 'completed'
            ORDER BY s.service_id DESC
            """,
            (sitter_id,),
        ).fetchall()
        browse_cards = []
        for r in browse_rows:
            card = _service_row_to_card_for_sitter(r)
            card["alreadyApplied"] = int(r["service_id"]) in applied_ids
            browse_cards.append(card)
        return {
            "browse": browse_cards,
            "upcoming": [_service_row_to_card_for_sitter(r) for r in up_rows],
            "completed": [_service_row_to_card_for_sitter(r) for r in done_rows],
        }
    finally:
        conn.close()


def fetch_sitter_apply_defaults(user_id):
    """Prefill apply modal from account (username as display name)."""
    if not user_id:
        return {
            "name": "",
            "phone": "",
            "gender": "",
            "experienceYears": 0,
        }
    conn = get_db()
    try:
        row = conn.execute(
            """
            SELECT username, phone_number, gender, experience_years
            FROM users WHERE user_id = ?
            """,
            (user_id,),
        ).fetchone()
        if not row:
            return {
                "name": "",
                "phone": "",
                "gender": "",
                "experienceYears": 0,
            }
        ey = row["experience_years"]
        try:
            exp = int(ey) if ey is not None else 0
        except (TypeError, ValueError):
            exp = 0
        g = (row["gender"] or "").strip()
        if g not in ("Male", "Female"):
            g = ""
        return {
            "name": (row["username"] or "").strip(),
            "phone": (row["phone_number"] or "").strip(),
            "gender": g,
            "experienceYears": max(0, min(60, exp)),
        }
    finally:
        conn.close()


def fetch_notifications_for_user(user_id):
    if not user_id:
        return []
    conn = get_db()
    try:
        return conn.execute(
            """
            SELECT notification_id, message, notif_type, is_read, created_at
            FROM notifications
            WHERE user_id = ?
            ORDER BY notification_id DESC
            """,
            (user_id,),
        ).fetchall()
    finally:
        conn.close()


def _status_title(st):
    s = (st or "").lower()
    return s.capitalize() if s else "Pending"


def fetch_owner_applications_payload(owner_id):
    if not owner_id:
        return []
    conn = get_db()
    try:
        rows = conn.execute(
            """
            SELECT a.application_id, a.service_id AS job_service_id, a.sitter_id,
                   a.applicant_name, a.applicant_phone,
                   a.applicant_gender, a.experience_years, a.applicant_age,
                   a.short_description, a.status, s.service_type, s.pet_type, s.number_of_pets,
                   s.status AS service_status,
                   u.email AS sitter_email
            FROM applications a
            INNER JOIN services s ON s.service_id = a.service_id
            INNER JOIN users u ON u.user_id = a.sitter_id
            WHERE s.owner_id = ?
            ORDER BY a.application_id DESC
            """,
            (owner_id,),
        ).fetchall()
        sitter_ids = {int(r["sitter_id"]) for r in rows}
        rep_map = {sid: _fetch_sitter_reputation_bundle(conn, sid) for sid in sitter_ids}
        out = []
        for r in rows:
            ey = r["experience_years"]
            exp = f"{int(ey)} years" if ey is not None else "—"
            sitter_user_id = int(r["sitter_id"])
            rep = rep_map.get(sitter_user_id) or {
                "avgRating": None,
                "reviewCount": 0,
                "pastReviews": [],
            }
            svc_st = (r["service_status"] or "").lower()
            app_raw = (r["status"] or "").lower()
            job_id = int(r["job_service_id"])

            review_eligible = False
            has_review = False
            my_rating = None
            my_comment = ""
            my_at = ""
            if app_raw == "approved" and svc_st == "completed":
                svc_row = conn.execute(
                    """
                    SELECT approved_sitter_id FROM services
                    WHERE service_id = ? AND owner_id = ?
                    """,
                    (job_id, owner_id),
                ).fetchone()
                if svc_row and svc_row["approved_sitter_id"]:
                    review_eligible = True
                    rev = conn.execute(
                        """
                        SELECT rating, review_comment, created_at
                        FROM reviews
                        WHERE service_id = ?
                        """,
                        (job_id,),
                    ).fetchone()
                    if rev:
                        has_review = True
                        my_rating = int(rev["rating"])
                        my_comment = (rev["review_comment"] or "").strip()
                        my_at = str(rev["created_at"] or "").strip()

            age_val = r["applicant_age"]
            try:
                age_disp = str(int(age_val)) if age_val is not None else "—"
            except (TypeError, ValueError):
                age_disp = "—"

            rec = {
                "applicationId": r["application_id"],
                "serviceId": job_id,
                "serviceStatus": svc_st,
                "sitterId": sitter_user_id,
                "name": r["applicant_name"],
                "gender": r["applicant_gender"] or "—",
                "age": age_disp,
                "experience": exp,
                "avgRating": rep["avgRating"],
                "reviewCount": rep["reviewCount"],
                "pastReviews": rep["pastReviews"],
                "serviceType": r["service_type"],
                "petType": r["pet_type"] or "",
                "pets": int(r["number_of_pets"] or 0) or 1,
                "status": _status_title(r["status"]),
                "description": (r["short_description"] or "").strip(),
                "phone": r["applicant_phone"] or "",
                "email": (r["sitter_email"] or "").strip(),
                "reviewEligible": review_eligible,
                "hasReview": has_review,
            }
            if has_review:
                rec["myReviewRating"] = my_rating
                rec["myReviewComment"] = my_comment
                rec["myReviewAt"] = my_at
            out.append(rec)
        return out
    finally:
        conn.close()


def fetch_sitter_applications_payload(sitter_id):
    if not sitter_id:
        return []
    conn = get_db()
    try:
        rows = conn.execute(
            """
            SELECT a.application_id, a.status,
                   s.service_type, s.pet_type, s.number_of_pets, s.service_date, s.service_time,
                   s.location, s.salary,
                   o.username AS owner_name, o.phone_number AS owner_phone,
                   o.email AS owner_email
            FROM applications a
            INNER JOIN services s ON s.service_id = a.service_id
            INNER JOIN users o ON o.user_id = s.owner_id
            WHERE a.sitter_id = ?
            ORDER BY a.application_id DESC
            """,
            (sitter_id,),
        ).fetchall()
        out = []
        for r in rows:
            out.append(
                {
                    "applicationId": r["application_id"],
                    "serviceType": r["service_type"],
                    "petType": r["pet_type"],
                    "pets": int(r["number_of_pets"] or 0) or 1,
                    "date": _format_service_date(r["service_date"]),
                    "time": r["service_time"] or "—",
                    "location": r["location"],
                    "salary": _salary_display(r["salary"]),
                    "ownerName": r["owner_name"],
                    "status": _status_title(r["status"]),
                    "ownerPhone": (r["owner_phone"] or "").strip(),
                    "ownerEmail": (r["owner_email"] or "").strip(),
                }
            )
        return out
    finally:
        conn.close()


PUBLIC_ENDPOINTS = frozenset(
    {
        "index",
        "login",
        "logout",
        "signup",
        "verify_email",
        "verify_email_resend",
        "forgot_password",
        "forgot_password_verify",
        "forgot_password_resend",
        "forgot_password_new",
    }
)
OWNER_ONLY = frozenset(
    {
        "owner_services",
        "owner_applications",
        "create_service",
        "owner_service_complete",
        "owner_service_review",
        "owner_service_delete",
        "owner_service_patch_desc",
        "owner_application_approve",
        "owner_application_reject",
    }
)
SITTER_ONLY = frozenset(
    {
        "sitter_dashboard",
        "sitter_services",
        "sitter_applications",
        "sitter_apply_service",
    }
)
ADMIN_ONLY = frozenset(
    {
        "admin_dashboard",
        "admin_users",
        "admin_user_suspend",
        "admin_user_unsuspend",
        "admin_applications",
        "admin_application_delete",
        "admin_analytics",
    }
)


def _safe_next_url(target):
    if not target or not isinstance(target, str):
        return None
    if not target.startswith("/") or target.startswith("//"):
        return None
    parsed = urlparse(target)
    if parsed.netloc:
        return None
    return target

# Condition of Password Creation 
def is_strong_password(password):
    if len(password) < 8:
        return False, "Password must be at least 8 characters long."

    if not re.search(r"[A-Z]", password):
        return False, "Password must include at least one uppercase letter."

    if not re.search(r"[a-z]", password):
        return False, "Password must include at least one lowercase letter."

    if not re.search(r"\d", password):
        return False, "Password must include at least one number."

    if not re.search(r"[^\w\s]", password):
        return False, "Password must include at least one symbol."

    return True, ""

@app.context_processor
def inject_auth():
    role = session.get("role")
    header_avatar_url = url_for("static", filename="images/cat.png")
    if role:
        header_avatar_url = _avatar_url_for_storage(session.get("avatar_filename"))
    return {
        "is_owner": role == "owner",
        "is_sitter": role == "sitter",
        "is_admin": role == "admin",
        "logged_in": bool(role),
        "header_avatar_url": header_avatar_url,
        "account_role_label": (
            "Administrator"
            if role == "admin"
            else "Pet Sitter"
            if role == "sitter"
            else "Pet Owner"
            if role == "owner"
            else ""
        ),
    }


@app.before_request
def mock_auth_gate():
    ep = request.endpoint
    if ep is None or ep == "static":
        return
    if ep in PUBLIC_ENDPOINTS:
        return
    role = session.get("role")
    if not role:
        return redirect(url_for("login", next=request.path))
    if ep in OWNER_ONLY and role != "owner":
        if role == "sitter":
            return redirect(url_for("sitter_dashboard"))
        if role == "admin":
            return redirect(url_for("index"))
        return redirect(url_for("login"))
    if ep in SITTER_ONLY and role != "sitter":
        if role == "owner":
            return redirect(url_for("index"))
        if role == "admin":
            return redirect(url_for("index"))
        return redirect(url_for("login"))
    if ep in ADMIN_ONLY and role != "admin":
        if role == "owner":
            return redirect(url_for("index"))
        if role == "sitter":
            return redirect(url_for("sitter_dashboard"))
        return redirect(url_for("login"))


def get_owner_dashboard_context():
    uid = session.get("user_id")
    user_display_name = session.get("display_name") or "Member"
    stats = fetch_owner_dashboard_stats(uid)
    return {
        "user_display_name": user_display_name,
        "owner_dashboard_payload": stats,
        "owner_pet_tip_services": fetch_owner_pet_rows_for_tips(uid) if uid else [],
    }


def get_sitter_dashboard_context():
    uid = session.get("user_id")
    return {
        "sitter_display_name": session.get("display_name") or "Member",
        "sitter_dashboard_payload": fetch_sitter_dashboard_stats(uid),
    }


def get_admin_dashboard_context():
    return {
        "admin_display_name": session.get("display_name") or "Admin",
        "admin_dashboard_payload": fetch_admin_dashboard_payload(),
    }


def get_admin_users_context():
    owners, sitters = fetch_admin_users_lists()
    rows = sorted(owners + sitters, key=lambda r: r["username"].lower())
    return {
        "admin_pet_owners": owners,
        "admin_pet_sitters": sitters,
        "admin_users_rows": rows,
        "admin_users_count": len(rows),
    }


def _admin_application_status_label(st):
    s = (st or "").lower()
    if s == "approved":
        return "Approved"
    if s == "rejected":
        return "Rejected"
    return "Pending"


def fetch_admin_applications_rows():
    """All applications with service and user names for the admin applications page (SQLite)."""
    conn = get_db()
    try:
        rows = conn.execute(
            """
            SELECT
                a.application_id,
                a.applicant_name,
                a.applicant_phone,
                a.applicant_gender,
                a.experience_years,
                a.applicant_age,
                a.short_description,
                a.status,
                a.applied_at,
                s.service_id,
                s.service_type,
                s.pet_type,
                s.location,
                s.service_date,
                o.username AS owner_username,
                sit.username AS sitter_username
            FROM applications a
            INNER JOIN services s ON s.service_id = a.service_id
            INNER JOIN users o ON o.user_id = s.owner_id
            INNER JOIN users sit ON sit.user_id = a.sitter_id
            ORDER BY a.application_id DESC
            """
        ).fetchall()
        out = []
        for r in rows:
            desc = (r["short_description"] or "").strip()
            st_label = _admin_application_status_label(r["status"])
            title = f"{r['pet_type']} · {r['service_type']}"
            applicant_nm = (r["applicant_name"] or "").strip()
            sitter_acct = (r["sitter_username"] or "").strip()
            try:
                app_age = (
                    int(r["applicant_age"])
                    if r["applicant_age"] is not None
                    else None
                )
            except (TypeError, ValueError):
                app_age = None
            applied = r["applied_at"]
            date_display = (
                _format_activity_timestamp(applied)
                if applied
                else _format_service_date(r["service_date"])
            )
            owner_nm = r["owner_username"] or "—"
            sitter_nm = applicant_nm or sitter_acct or "—"
            stype = r["service_type"] or "—"
            out.append(
                {
                    "applicationId": int(r["application_id"]),
                    "id": str(r["application_id"]),
                    "serviceTitle": title,
                    "ownerName": owner_nm,
                    "sitterName": sitter_nm,
                    "serviceType": stype,
                    "date": date_display,
                    "status": st_label,
                    "message": desc or "No message provided.",
                    "isSuspicious": len(desc) < 8,
                    "applicantPhone": (r["applicant_phone"] or "").strip(),
                    "applicantAge": app_age,
                    "sitterAccountName": sitter_acct or "—",
                    "location": r["location"] or "—",
                    "searchBlob": _admin_user_search_blob(
                        svc=title,
                        owner=owner_nm,
                        sitter=sitter_nm,
                        stype=stype,
                        status=st_label,
                        msg=desc,
                    ),
                }
            )
        return out
    finally:
        conn.close()


def get_admin_applications_context():
    return {"admin_applications_rows": fetch_admin_applications_rows()}


def _admin_month_keys_ending_now(count=12):
    now = datetime.now()
    y, m = now.year, now.month
    keys_rev = []
    for _ in range(count):
        keys_rev.append(f"{y:04d}-{m:02d}")
        m -= 1
        if m == 0:
            m = 12
            y -= 1
    return list(reversed(keys_rev))


def _admin_month_label(ym_key):
    return datetime.strptime(ym_key + "-01", "%Y-%m-%d").strftime("%b %Y")


def _build_admin_ai_insights(payload):
    lines = []
    pop = payload.get("popularServices") or []
    total_svc = int(payload.get("totalServices") or 0)
    total_app = int(payload.get("totalApplications") or 0)
    total_rev = int(payload.get("totalReviews") or 0)
    low = payload.get("lowestSitter")

    if pop and pop[0]["count"] > 0:
        top = pop[0]
        runner = pop[1]["count"] if len(pop) > 1 else 0
        if total_svc > 0 and top["count"] >= max(2, (total_svc + 2) // 3):
            lines.append(
                f"{top['serviceType']} makes up a large share of listings; prioritise sitter coverage for this category."
            )
        if runner > 0 and top["count"] >= runner * 2:
            lines.append(
                f"{top['serviceType']} demand is high relative to other types; more sitter participation may be needed."
            )

    if total_svc > 0 and total_app >= total_svc * 2:
        lines.append(
            "Application volume is high compared to listings; competition per job may be elevated."
        )

    if total_svc > 0 and total_rev < max(3, (total_svc + 1) // 2):
        lines.append(
            "Review volume is still modest; encourage owners to submit ratings after completed services."
        )

    if low and low.get("avgRating") is not None and float(low["avgRating"]) < 3.5:
        lines.append(
            f"Lowest average sitter rating is {float(low['avgRating']):.1f}/5; consider outreach or quality checks."
        )

    if not lines:
        lines.append(
            "Platform metrics look balanced. Keep monitoring monthly trends as volume grows."
        )

    seen = set()
    out = []
    for item in lines:
        if item not in seen:
            seen.add(item)
            out.append(item)
    return out[:8]


def fetch_admin_analytics_payload():
    """Aggregates for admin analytics (SQLite): trends, sitters, services, AI-style insights."""
    conn = get_db()
    try:
        total_services = int(
            conn.execute("SELECT COUNT(*) AS c FROM services").fetchone()["c"]
        )
        total_apps = int(
            conn.execute("SELECT COUNT(*) AS c FROM applications").fetchone()["c"]
        )
        total_reviews = int(
            conn.execute("SELECT COUNT(*) AS c FROM reviews").fetchone()["c"]
        )

        svc_m = {}
        for row in conn.execute(
            """
            SELECT strftime('%Y-%m', created_at) AS ym, COUNT(*) AS c
            FROM services
            WHERE created_at IS NOT NULL
            GROUP BY ym
            """
        ):
            if row["ym"]:
                svc_m[row["ym"]] = int(row["c"])

        app_m = {}
        for row in conn.execute(
            """
            SELECT strftime('%Y-%m', applied_at) AS ym, COUNT(*) AS c
            FROM applications
            WHERE applied_at IS NOT NULL
            GROUP BY ym
            """
        ):
            if row["ym"]:
                app_m[row["ym"]] = int(row["c"])

        keys = _admin_month_keys_ending_now(12)
        monthly_trend = []
        for ym in keys:
            monthly_trend.append(
                {
                    "label": _admin_month_label(ym),
                    "services": int(svc_m.get(ym, 0)),
                    "applications": int(app_m.get(ym, 0)),
                }
            )

        top_rows = conn.execute(
            """
            SELECT u.username AS un,
                   AVG(r.rating) AS avg_r,
                   COUNT(*) AS n
            FROM reviews r
            INNER JOIN users u ON u.user_id = r.sitter_id
            GROUP BY r.sitter_id
            HAVING COUNT(*) >= 1
            ORDER BY avg_r DESC, n DESC
            LIMIT 3
            """
        ).fetchall()

        top_sitters = []
        for r in top_rows:
            avg_r = r["avg_r"]
            top_sitters.append(
                {
                    "username": r["un"],
                    "avgRating": round(float(avg_r), 2) if avg_r is not None else None,
                    "reviewCount": int(r["n"]),
                }
            )

        low_row = conn.execute(
            """
            SELECT u.username AS un,
                   AVG(r.rating) AS avg_r,
                   COUNT(*) AS n
            FROM reviews r
            INNER JOIN users u ON u.user_id = r.sitter_id
            GROUP BY r.sitter_id
            HAVING COUNT(*) >= 1
            ORDER BY avg_r ASC, n ASC
            LIMIT 1
            """
        ).fetchone()

        lowest_sitter = None
        if low_row:
            ar = low_row["avg_r"]
            lowest_sitter = {
                "username": low_row["un"],
                "avgRating": round(float(ar), 2) if ar is not None else None,
                "reviewCount": int(low_row["n"]),
            }

        pop_rows = conn.execute(
            """
            SELECT service_type AS st, COUNT(*) AS c
            FROM services
            GROUP BY service_type
            ORDER BY c DESC
            """
        ).fetchall()
        popular_services = [
            {"serviceType": r["st"], "count": int(r["c"])} for r in pop_rows
        ]

        popular_name = "—"
        if popular_services and popular_services[0]["count"] > 0:
            popular_name = popular_services[0]["serviceType"]

        payload = {
            "totalServices": total_services,
            "totalApplications": total_apps,
            "totalReviews": total_reviews,
            "popularServiceName": popular_name,
            "monthlyTrend": monthly_trend,
            "topSitters": top_sitters,
            "lowestSitter": lowest_sitter,
            "popularServices": popular_services,
        }
        payload["aiInsights"] = _build_admin_ai_insights(payload)
        return payload
    finally:
        conn.close()


def get_admin_analytics_context():
    return {"admin_analytics_payload": fetch_admin_analytics_payload()}


@app.route("/")
def index():
    role = session.get("role")
    if role == "sitter":
        return redirect(url_for("sitter_dashboard"))
    if role == "owner":
        return render_template("owner_dashboard.html", **get_owner_dashboard_context())
    if role == "admin":
        return redirect(url_for("admin_dashboard"))
    return render_template("landing.html")


@app.route("/login", methods=["GET", "POST"])
def login():
    if session.get("role"):
        flash(
            "You're already signed in. Log out first if you need a different account.",
            "info",
        )
        return redirect(url_for("index"))

    if request.method == "POST":
        email = (request.form.get("email") or "").strip().lower()
        password = request.form.get("password") or ""
        row = get_user_by_email(email)
        if not row or not check_password_hash(row["password"], password):
            flash("Invalid email or password.", "danger")
        elif row["is_suspended"]:
            flash("This account is suspended. Contact support.", "danger")
        elif not int(row["email_verified"] or 0):
            session["pending_verify_user_id"] = row["user_id"]
            flash(
                "Please verify your email. Enter the 6-digit code we sent you.",
                "warning",
            )
            return redirect(url_for("verify_email"))
        else:
            session["user_id"] = row["user_id"]
            session["role"] = row["role"]
            session["email"] = row["email"]
            session["display_name"] = row["username"]
            session["avatar_filename"] = (row["avatar_filename"] or "").strip()
            nxt = _safe_next_url(request.form.get("next") or request.args.get("next"))
            if nxt:
                return redirect(nxt)
            if row["role"] == "sitter":
                return redirect(url_for("sitter_dashboard"))
            if row["role"] == "admin":
                return redirect(url_for("admin_dashboard"))
            return redirect(url_for("index"))

    return render_template("login.html")


@app.route("/logout")
def logout():
    session.clear()
    return redirect(url_for("index"))


def _signup_form_state(
    email="",
    username="",
    phone="",
    role="",
    gender="",
    terms_checked=False,
):
    """Template context to repopulate signup after validation errors (never passwords)."""
    return {
        "signup_email": email,
        "signup_username": username,
        "signup_phone": phone,
        "signup_role": role,
        "signup_gender": gender,
        "signup_terms": bool(terms_checked),
    }


@app.route("/signup", methods=["GET", "POST"])
def signup():
    if session.get("role"):
        flash(
            "You're already signed in. Log out before creating another account.",
            "info",
        )
        return redirect(url_for("index"))

    if request.method == "POST":
        email = (request.form.get("email") or "").strip().lower()
        role = (request.form.get("role") or "").strip().lower()
        gender = (request.form.get("gender") or "").strip()
        username = (request.form.get("username") or "").strip()
        phone = (request.form.get("phone") or "").strip()
        password = request.form.get("password") or ""
        confirm_password = request.form.get("confirm_password") or ""

        form_ctx = _signup_form_state(
            email=email,
            username=username,
            phone=phone,
            role=role,
            gender=gender,
            terms_checked=request.form.get("terms") == "on",
        )

        if request.form.get("terms") != "on":
            flash("Please accept the Terms of Service and Privacy Policy.", "danger")
            return render_template("signup.html", **form_ctx)

        if role not in ("owner", "sitter"):
            flash("Please select a valid account role.", "danger")
            return render_template("signup.html", **form_ctx)

        if gender and gender not in ("Male", "Female"):
            flash("Please select a valid gender.", "danger")
            return render_template("signup.html", **form_ctx)

        if not username:
            flash("Username is required.", "danger")
            return render_template("signup.html", **form_ctx)

        if not phone:
            flash("Phone number is required.", "danger")
            return render_template("signup.html", **form_ctx)

        if not email:
            flash("Email is required.", "danger")
            return render_template("signup.html", **form_ctx)

        is_valid_password, password_message = is_strong_password(password)
        if not is_valid_password:
            flash(password_message, "danger")
            return render_template("signup.html", **form_ctx)

        if password != confirm_password:
            flash("Passwords do not match.", "danger")
            return render_template("signup.html", **form_ctx)

        if get_user_by_email(email):
            flash("Email already in use.", "danger")
            return render_template("signup.html", **form_ctx)

        pw_hash = generate_password_hash(password)
        gender_val = gender if gender in ("Male", "Female") else None

        conn = get_db()
        try:
            cur = conn.execute(
                """
                INSERT INTO users (
                    username, role, email, phone_number, password, gender,
                    experience_years, email_verified
                )
                VALUES (?, ?, ?, ?, ?, ?, 0, 0)
                """,
                (
                    username,
                    role,
                    email,
                    phone,
                    pw_hash,
                    gender_val,
                ),
            )
            new_uid = cur.lastrowid
            ok_send, send_err = assign_and_email_otp(conn, new_uid, email)
            if not ok_send:
                conn.execute("DELETE FROM users WHERE user_id = ?", (new_uid,))
                conn.commit()
                flash(send_err, "danger")
                return render_template("signup.html", **form_ctx)
            conn.commit()
        except sqlite3.IntegrityError:
            conn.rollback()
            flash("Email already in use.", "danger")
            return render_template("signup.html", **form_ctx)
        finally:
            conn.close()

        session.pop("password_reset_user_id", None)
        session.pop("password_reset_verified", None)
        session["pending_verify_user_id"] = new_uid
        flash(
            f"We sent a {OTP_LENGTH}-digit code to your email. Enter it below to verify your account.",
            "success",
        )
        return redirect(url_for("verify_email"))

    return render_template("signup.html", **_signup_form_state())


def _verify_page_context(user_row, resend_seconds_left=0):
    return {
        "verify_masked_email": mask_email_for_display(user_row["email"]),
        "resend_locked_seconds": max(0, int(resend_seconds_left)),
        "otp_length": OTP_LENGTH,
        "otp_expiry_minutes": OTP_EXPIRY_MINUTES,
    }


@app.route("/verify-email", methods=["GET", "POST"])
def verify_email():
    if session.get("role"):
        return redirect(url_for("index"))

    uid = session.get("pending_verify_user_id")
    if not uid:
        flash("Start by creating an account, or sign in if you already have one.", "info")
        return redirect(url_for("signup"))

    user_row = get_user_by_id(uid)
    if not user_row:
        session.pop("pending_verify_user_id", None)
        flash("That account could not be found. Please sign up again.", "danger")
        return redirect(url_for("signup"))

    if int(user_row["email_verified"] or 0):
        session.pop("pending_verify_user_id", None)
        flash("Your email is already verified. You can sign in.", "success")
        return redirect(url_for("login"))

    now_naive = datetime.now(timezone.utc).replace(tzinfo=None)
    last_sent = _parse_utc_naive_iso(user_row["otp_last_sent_at"])
    resend_left = 0
    if last_sent:
        elapsed = (now_naive - last_sent).total_seconds()
        resend_left = max(0, int(OTP_RESEND_SECONDS - elapsed))

    if request.method == "POST":
        raw = (request.form.get("otp") or "").strip()
        digits = re.sub(r"\D", "", raw)
        if len(digits) != OTP_LENGTH:
            flash(f"Enter the {OTP_LENGTH}-digit code from your email.", "danger")
            return render_template(
                "verify_email.html", **_verify_page_context(user_row, resend_left)
            )

        exp = _parse_utc_naive_iso(user_row["otp_expires_at"])
        if not exp or now_naive > exp:
            flash("That code has expired. Request a new code below.", "danger")
            return render_template(
                "verify_email.html", **_verify_page_context(user_row, resend_left)
            )

        if not user_row["otp_code_hash"] or not check_password_hash(
            user_row["otp_code_hash"], digits
        ):
            flash("Invalid code. Try again or request a new code.", "danger")
            return render_template(
                "verify_email.html", **_verify_page_context(user_row, resend_left)
            )

        conn = get_db()
        try:
            conn.execute(
                """
                UPDATE users
                SET email_verified = 1,
                    otp_code_hash = NULL,
                    otp_expires_at = NULL,
                    otp_last_sent_at = NULL
                WHERE user_id = ?
                """,
                (uid,),
            )
            conn.commit()
        finally:
            conn.close()

        session.pop("pending_verify_user_id", None)
        flash("Email verified. You can sign in now.", "success")
        return redirect(url_for("login"))

    return render_template(
        "verify_email.html", **_verify_page_context(user_row, resend_left)
    )


@app.route("/verify-email/resend", methods=["POST"])
def verify_email_resend():
    if session.get("role"):
        return redirect(url_for("index"))

    uid = session.get("pending_verify_user_id")
    if not uid:
        flash("Your verification session expired. Please sign up or sign in again.", "info")
        return redirect(url_for("signup"))

    user_row = get_user_by_id(uid)
    if not user_row or int(user_row["email_verified"] or 0):
        session.pop("pending_verify_user_id", None)
        flash("Nothing to resend. Try signing in.", "info")
        return redirect(url_for("login"))

    now_naive = datetime.now(timezone.utc).replace(tzinfo=None)
    last_sent = _parse_utc_naive_iso(user_row["otp_last_sent_at"])
    if last_sent:
        elapsed = (now_naive - last_sent).total_seconds()
        if elapsed < OTP_RESEND_SECONDS:
            wait = int(OTP_RESEND_SECONDS - elapsed)
            flash(f"Please wait {wait} seconds before requesting another code.", "warning")
            return redirect(url_for("verify_email"))

    conn = get_db()
    try:
        ok_send, send_err = assign_and_email_otp(conn, uid, user_row["email"])
        if not ok_send:
            flash(send_err, "danger")
            return redirect(url_for("verify_email"))
        conn.commit()
    finally:
        conn.close()

    flash("A new verification code has been sent to your email.", "success")
    return redirect(url_for("verify_email"))


@app.route("/forgot-password", methods=["GET", "POST"])
def forgot_password():
    if session.get("role"):
        return redirect(url_for("index"))

    if request.method == "POST":
        email = (request.form.get("email") or "").strip().lower()
        session.pop("password_reset_user_id", None)
        session.pop("password_reset_verified", None)

        if not email:
            flash("Enter the email you used to register.", "danger")
            return render_template("forgot_password.html", forgot_email="")

        row = get_user_by_email(email)
        if not row:
            flash(
                "No Paw Hub account is registered with that email. "
                "Use the same address you used at sign-up, or create an account first.",
                "warning",
            )
            return render_template("forgot_password.html", forgot_email=email)
        if int(row["is_suspended"] or 0):
            flash(
                "This account cannot reset its password here. Please contact support.",
                "danger",
            )
            return render_template("forgot_password.html", forgot_email=email)

        conn = get_db()
        try:
            ok_send, send_err = assign_password_reset_otp(conn, row["user_id"], row["email"])
            if not ok_send:
                flash(send_err, "danger")
                return render_template("forgot_password.html", forgot_email=email)
            conn.commit()
        finally:
            conn.close()

        session.pop("pending_verify_user_id", None)
        session["password_reset_user_id"] = row["user_id"]
        session.pop("password_reset_verified", None)
        flash(
            "We sent a 6-digit code to your email. Enter it on the next step.",
            "success",
        )
        return redirect(url_for("forgot_password_verify"))

    return render_template("forgot_password.html", forgot_email="")


@app.route("/forgot-password/verify", methods=["GET", "POST"])
def forgot_password_verify():
    if session.get("role"):
        return redirect(url_for("index"))

    uid = session.get("password_reset_user_id")
    if not uid:
        flash("Start from the forgot password page and enter your email.", "info")
        return redirect(url_for("forgot_password"))

    if session.get("password_reset_verified"):
        return redirect(url_for("forgot_password_new"))

    user_row = get_user_by_id(uid)
    if not user_row:
        session.pop("password_reset_user_id", None)
        session.pop("password_reset_verified", None)
        flash("That account could not be found. Try again.", "danger")
        return redirect(url_for("forgot_password"))

    now_naive = datetime.now(timezone.utc).replace(tzinfo=None)
    last_sent = _parse_utc_naive_iso(user_row["pwd_reset_otp_sent_at"])
    resend_left = 0
    if last_sent:
        elapsed = (now_naive - last_sent).total_seconds()
        resend_left = max(0, int(OTP_RESEND_SECONDS - elapsed))

    if request.method == "POST":
        raw = (request.form.get("otp") or "").strip()
        digits = re.sub(r"\D", "", raw)
        if len(digits) != OTP_LENGTH:
            flash(f"Enter the {OTP_LENGTH}-digit code from your email.", "danger")
            return render_template(
                "forgot_password_verify.html",
                **_verify_page_context(user_row, resend_left),
            )

        exp = _parse_utc_naive_iso(user_row["pwd_reset_otp_expires_at"])
        if not exp or now_naive > exp:
            flash("That code has expired. Request a new code below.", "danger")
            return render_template(
                "forgot_password_verify.html",
                **_verify_page_context(user_row, resend_left),
            )

        if not user_row["pwd_reset_otp_hash"] or not check_password_hash(
            user_row["pwd_reset_otp_hash"], digits
        ):
            flash("Invalid code. Try again or request a new code.", "danger")
            return render_template(
                "forgot_password_verify.html",
                **_verify_page_context(user_row, resend_left),
            )

        conn = get_db()
        try:
            conn.execute(
                """
                UPDATE users
                SET pwd_reset_otp_hash = NULL,
                    pwd_reset_otp_expires_at = NULL,
                    pwd_reset_otp_sent_at = NULL
                WHERE user_id = ?
                """,
                (uid,),
            )
            conn.commit()
        finally:
            conn.close()

        session["password_reset_verified"] = True
        flash("Code accepted. Choose a new password.", "success")
        return redirect(url_for("forgot_password_new"))

    return render_template(
        "forgot_password_verify.html", **_verify_page_context(user_row, resend_left)
    )


@app.route("/forgot-password/resend", methods=["POST"])
def forgot_password_resend():
    if session.get("role"):
        return redirect(url_for("index"))

    uid = session.get("password_reset_user_id")
    if not uid or session.get("password_reset_verified"):
        flash("Start the reset flow from the forgot password page.", "info")
        return redirect(url_for("forgot_password"))

    user_row = get_user_by_id(uid)
    if not user_row:
        session.pop("password_reset_user_id", None)
        flash("Session expired. Enter your email again.", "info")
        return redirect(url_for("forgot_password"))

    now_naive = datetime.now(timezone.utc).replace(tzinfo=None)
    last_sent = _parse_utc_naive_iso(user_row["pwd_reset_otp_sent_at"])
    if last_sent:
        elapsed = (now_naive - last_sent).total_seconds()
        if elapsed < OTP_RESEND_SECONDS:
            wait = int(OTP_RESEND_SECONDS - elapsed)
            flash(f"Please wait {wait} seconds before requesting another code.", "warning")
            return redirect(url_for("forgot_password_verify"))

    conn = get_db()
    try:
        ok_send, send_err = assign_password_reset_otp(conn, uid, user_row["email"])
        if not ok_send:
            flash(send_err, "danger")
            return redirect(url_for("forgot_password_verify"))
        conn.commit()
    finally:
        conn.close()

    flash("A new code has been sent to your email.", "success")
    return redirect(url_for("forgot_password_verify"))


@app.route("/forgot-password/new", methods=["GET", "POST"])
def forgot_password_new():
    if session.get("role"):
        return redirect(url_for("index"))

    uid = session.get("password_reset_user_id")
    if not uid or not session.get("password_reset_verified"):
        flash("Verify the code from your email first.", "info")
        return redirect(url_for("forgot_password"))

    user_row = get_user_by_id(uid)
    if not user_row:
        session.pop("password_reset_user_id", None)
        session.pop("password_reset_verified", None)
        flash("That account could not be found.", "danger")
        return redirect(url_for("forgot_password"))

    if request.method == "POST":
        password = request.form.get("password") or ""
        confirm = request.form.get("confirm_password") or ""
        ok_pw, msg = is_strong_password(password)
        if not ok_pw:
            flash(msg, "danger")
            return render_template("forgot_password_new.html")
        if password != confirm:
            flash("Passwords do not match.", "danger")
            return render_template("forgot_password_new.html")

        pw_hash = generate_password_hash(password)
        conn = get_db()
        try:
            conn.execute(
                """
                UPDATE users
                SET password = ?,
                    pwd_reset_otp_hash = NULL,
                    pwd_reset_otp_expires_at = NULL,
                    pwd_reset_otp_sent_at = NULL
                WHERE user_id = ?
                """,
                (pw_hash, uid),
            )
            conn.commit()
        finally:
            conn.close()

        session.pop("password_reset_user_id", None)
        session.pop("password_reset_verified", None)
        flash("Your password was updated. Sign in with your new password.", "success")
        return redirect(url_for("login"))

    return render_template("forgot_password_new.html")


@app.route("/owner/services")
def owner_services():
    uid = session.get("user_id")
    part = fetch_owner_service_partition(uid)
    return render_template(
        "owner_services.html",
        owner_service_partition=part,
    )


@app.route("/owner/services/<int:sid>/complete", methods=["POST"])
def owner_service_complete(sid):
    uid = session.get("user_id")
    conn = get_db()
    try:
        cur = conn.execute(
            """
            UPDATE services SET status = 'completed'
            WHERE service_id = ? AND owner_id = ?
              AND status IN ('approved', 'ongoing')
            """,
            (sid, uid),
        )
        conn.commit()
        if cur.rowcount:
            flash(
                "Service marked as completed. Rate your sitter on this Applications page.",
                "success",
            )
        else:
            flash(
                "Could not mark that service complete. It may already be finished or not assigned yet.",
                "danger",
            )
    finally:
        conn.close()
    return redirect(url_for("owner_applications") + "#applications-approved")


@app.route("/owner/services/<int:sid>/review", methods=["POST"])
def owner_service_review(sid):
    owner_id = session.get("user_id")
    raw_rating = request.form.get("rating")
    comment = (request.form.get("review_comment") or "").strip()
    try:
        rating = int(raw_rating)
    except (TypeError, ValueError):
        flash("Please choose a rating from 1 to 5.", "danger")
        return redirect(url_for("owner_applications") + "#applications-approved")
    if rating < 1 or rating > 5:
        flash("Rating must be between 1 and 5.", "danger")
        return redirect(url_for("owner_applications") + "#applications-approved")
    if len(comment) > 2000:
        flash("Review comment is too long (max 2000 characters).", "danger")
        return redirect(url_for("owner_applications") + "#applications-approved")

    conn = get_db()
    try:
        row = conn.execute(
            """
            SELECT service_id, owner_id, status, approved_sitter_id
            FROM services
            WHERE service_id = ?
            """,
            (sid,),
        ).fetchone()
        if not row or row["owner_id"] != owner_id:
            flash("Service not found.", "danger")
            return redirect(url_for("owner_applications") + "#applications-approved")
        if (row["status"] or "").lower() != "completed":
            flash("You can only review sitters after the service is completed.", "danger")
            return redirect(url_for("owner_applications") + "#applications-approved")
        sitter_id = row["approved_sitter_id"]
        if not sitter_id:
            flash("This service has no assigned sitter to review.", "danger")
            return redirect(url_for("owner_applications") + "#applications-approved")
        dup = conn.execute(
            "SELECT 1 FROM reviews WHERE service_id = ?",
            (sid,),
        ).fetchone()
        if dup:
            flash("You already submitted a review for this service.", "info")
            return redirect(url_for("owner_applications") + "#applications-approved")
        conn.execute(
            """
            INSERT INTO reviews (service_id, owner_id, sitter_id, rating, review_comment)
            VALUES (?, ?, ?, ?, ?)
            """,
            (sid, owner_id, sitter_id, rating, comment or None),
        )
        conn.commit()
        flash("Thanks — your review was saved.", "success")
    except sqlite3.IntegrityError:
        conn.rollback()
        flash("A review for this service already exists.", "info")
    finally:
        conn.close()
    return redirect(url_for("owner_applications") + "#applications-approved")


@app.route("/owner/services/<int:sid>/delete", methods=["POST"])
def owner_service_delete(sid):
    uid = session.get("user_id")
    conn = get_db()
    try:
        own = conn.execute(
            "SELECT 1 FROM services WHERE service_id = ? AND owner_id = ?",
            (sid, uid),
        ).fetchone()
        if not own:
            flash("Service not found.", "danger")
            return redirect(url_for("owner_services"))
        conn.execute("DELETE FROM applications WHERE service_id = ?", (sid,))
        conn.execute(
            "DELETE FROM reviews WHERE service_id = ?",
            (sid,),
        )
        conn.execute(
            "DELETE FROM services WHERE service_id = ? AND owner_id = ?",
            (sid, uid),
        )
        conn.commit()
        flash("Service deleted.", "success")
    finally:
        conn.close()
    return redirect(url_for("owner_services"))


@app.route("/owner/services/<int:sid>/description", methods=["POST"])
def owner_service_patch_desc(sid):
    uid = session.get("user_id")
    desc = (request.form.get("description") or "").strip()
    conn = get_db()
    try:
        cur = conn.execute(
            """
            UPDATE services SET description = ?
            WHERE service_id = ? AND owner_id = ?
            """,
            (desc, sid, uid),
        )
        conn.commit()
        if cur.rowcount:
            flash("Description updated.", "success")
        else:
            flash("Could not update description.", "danger")
    finally:
        conn.close()
    return redirect(url_for("owner_services"))


@app.route("/owner/create-service", methods=["GET", "POST"])
def create_service():
    if request.method == "POST":
        uid = session.get("user_id")
        pet_type = request.form.get("pet_type")
        service_type = request.form.get("service_type")
        try:
            n_pets = int(request.form.get("number_of_pets") or 0)
        except ValueError:
            n_pets = 0
        service_date = (request.form.get("service_date") or "").strip()
        service_time = (request.form.get("service_time") or "").strip()
        duration = (request.form.get("duration") or "").strip()
        location = request.form.get("location")
        try:
            salary = float(request.form.get("salary") or 0)
        except ValueError:
            salary = 0.0
        description = (request.form.get("description") or "").strip()

        allowed_pet = {"Dog", "Cat", "Rabbit", "Bird"}
        allowed_svc = {
            "Pet Sitting",
            "Pet Day Care",
            "Pet Taxi",
            "Pet Training",
            "Dog Walking",
        }
        allowed_loc = {
            "Petaling Jaya",
            "Bukit Bintang",
            "Bukit Jalil",
            "Puchong",
            "Cheras",
        }
        if (
            pet_type not in allowed_pet
            or service_type not in allowed_svc
            or location not in allowed_loc
            or n_pets < 1
            or salary <= 0
            or not service_date
            or not service_time
            or not duration
        ):
            flash("Please fill all required fields with valid values.", "danger")
            return render_template("create_service.html"), 400

        conn = get_db()
        try:
            conn.execute(
                """
                INSERT INTO services (
                    owner_id, pet_type, service_type, number_of_pets,
                    service_date, service_time, duration, location, salary,
                    description, status
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')
                """,
                (
                    uid,
                    pet_type,
                    service_type,
                    n_pets,
                    service_date,
                    service_time,
                    duration,
                    location,
                    salary,
                    description,
                ),
            )
            conn.commit()
        finally:
            conn.close()
        flash("Your service is live. Sitters can now apply.", "success")
        return redirect(url_for("owner_services"))

    return render_template("create_service.html")


@app.route("/owner/applications")
def owner_applications():
    uid = session.get("user_id")
    apps = fetch_owner_applications_payload(uid)
    return render_template(
        "owner_applications.html",
        owner_applications_payload=apps,
    )


@app.route("/owner/applications/<int:aid>/approve", methods=["POST"])
def owner_application_approve(aid):
    owner_id = session.get("user_id")
    conn = get_db()
    try:
        row = conn.execute(
            """
            SELECT a.application_id, a.sitter_id, a.service_id, s.owner_id
            FROM applications a
            INNER JOIN services s ON s.service_id = a.service_id
            WHERE a.application_id = ?
            """,
            (aid,),
        ).fetchone()
        if not row or row["owner_id"] != owner_id:
            flash("Application not found.", "danger")
            return redirect(url_for("owner_applications"))
        sid = row["service_id"]
        sitter_id = row["sitter_id"]
        conn.execute(
            "UPDATE applications SET status = 'rejected' WHERE service_id = ? AND application_id != ?",
            (sid, aid),
        )
        conn.execute(
            "UPDATE applications SET status = 'approved' WHERE application_id = ?",
            (aid,),
        )
        conn.execute(
            """
            UPDATE services
            SET approved_sitter_id = ?, status = 'ongoing'
            WHERE service_id = ? AND owner_id = ?
            """,
            (sitter_id, sid, owner_id),
        )
        conn.commit()
        flash("Application approved. The sitter is assigned to this service.", "success")
    finally:
        conn.close()
    return redirect(url_for("owner_applications"))


@app.route("/owner/applications/<int:aid>/reject", methods=["POST"])
def owner_application_reject(aid):
    owner_id = session.get("user_id")
    conn = get_db()
    try:
        row = conn.execute(
            """
            SELECT a.application_id, s.owner_id
            FROM applications a
            INNER JOIN services s ON s.service_id = a.service_id
            WHERE a.application_id = ?
            """,
            (aid,),
        ).fetchone()
        if not row or row["owner_id"] != owner_id:
            flash("Application not found.", "danger")
            return redirect(url_for("owner_applications"))
        conn.execute(
            "UPDATE applications SET status = 'rejected' WHERE application_id = ?",
            (aid,),
        )
        conn.commit()
        flash("Application rejected.", "info")
    finally:
        conn.close()
    return redirect(url_for("owner_applications"))


@app.route("/admin/dashboard")
def admin_dashboard():
    return render_template("admin_dashboard.html", **get_admin_dashboard_context())

@app.route("/admin/users")
def admin_users():
    return render_template("admin_users.html", **get_admin_users_context())


@app.route("/admin/users/<int:uid>/suspend", methods=["POST"])
def admin_user_suspend(uid):
    admin_id = session.get("user_id")
    conn = get_db()
    try:
        row = conn.execute(
            "SELECT role, is_suspended FROM users WHERE user_id = ?",
            (uid,),
        ).fetchone()
        if not row:
            flash("User not found.", "danger")
        elif (row["role"] or "").lower() == "admin":
            flash("Administrator accounts cannot be suspended.", "warning")
        elif admin_id is not None and uid == admin_id:
            flash("You cannot suspend your own account.", "warning")
        elif row["is_suspended"]:
            flash("This account is already suspended.", "info")
        else:
            conn.execute(
                "UPDATE users SET is_suspended = 1 WHERE user_id = ?",
                (uid,),
            )
            conn.commit()
            flash("User has been suspended. They cannot sign in until reactivated.", "success")
    finally:
        conn.close()
    return redirect(url_for("admin_users"))


@app.route("/admin/users/<int:uid>/unsuspend", methods=["POST"])
def admin_user_unsuspend(uid):
    conn = get_db()
    try:
        row = conn.execute(
            "SELECT role, is_suspended FROM users WHERE user_id = ?",
            (uid,),
        ).fetchone()
        if not row:
            flash("User not found.", "danger")
        elif (row["role"] or "").lower() == "admin":
            flash("Administrator accounts are managed separately.", "warning")
        elif not row["is_suspended"]:
            flash("This account is already active.", "info")
        else:
            conn.execute(
                "UPDATE users SET is_suspended = 0 WHERE user_id = ?",
                (uid,),
            )
            conn.commit()
            flash("User has been reactivated. They can sign in again.", "success")
    finally:
        conn.close()
    return redirect(url_for("admin_users"))


@app.route("/admin/applications")
def admin_applications():
    return render_template("admin_applications.html", **get_admin_applications_context())


@app.route("/admin/applications/<int:aid>/delete", methods=["POST"])
def admin_application_delete(aid):
    conn = get_db()
    try:
        cur = conn.execute(
            "DELETE FROM applications WHERE application_id = ?",
            (aid,),
        )
        conn.commit()
        if cur.rowcount:
            flash("Application removed.", "success")
        else:
            flash("Application not found.", "danger")
    finally:
        conn.close()
    return redirect(url_for("admin_applications"))


@app.route("/admin/analytics")
def admin_analytics():
    return render_template("admin_analytics.html", **get_admin_analytics_context())

@app.route("/sitter")
def sitter_dashboard():
    return render_template("sitter_dashboard.html", **get_sitter_dashboard_context())


@app.route("/sitter/services")
def sitter_services():
    uid = session.get("user_id")
    part = fetch_sitter_service_partition(uid)
    return render_template(
        "sitter_services.html",
        sitter_service_partition=part,
        sitter_apply_defaults=fetch_sitter_apply_defaults(uid),
    )


@app.route("/sitter/services/<int:sid>/apply", methods=["POST"])
def sitter_apply_service(sid):
    sitter_id = session.get("user_id")
    if not sitter_id:
        flash("Please log in.", "danger")
        return redirect(url_for("login"))

    name = (request.form.get("applicant_name") or "").strip()
    phone = (request.form.get("applicant_phone") or "").strip()
    gender = (request.form.get("applicant_gender") or "").strip()
    desc = (request.form.get("short_description") or "").strip()

    try:
        exp = int(request.form.get("experience_years", "-1"))
    except (TypeError, ValueError):
        exp = -1
    try:
        age = int(request.form.get("applicant_age", "0"))
    except (TypeError, ValueError):
        age = 0

    errs = []
    if not name or len(name) > 120:
        errs.append("Name is required (max 120 characters).")
    if not phone or len(phone) > 40:
        errs.append("Phone number is required (max 40 characters).")
    if gender not in ("Male", "Female"):
        errs.append("Please select a gender.")
    if exp < 0 or exp > 60:
        errs.append("Please select years of experience (0–60).")
    if age < 1 or age > 120:
        errs.append("Please enter a valid age (1–120).")
    if _word_count(desc) > 100:
        errs.append("Short description must be 100 words or fewer.")

    if errs:
        flash(errs[0], "danger")
        return redirect(url_for("sitter_services"))

    conn = get_db()
    try:
        svc = conn.execute(
            "SELECT owner_id, status FROM services WHERE service_id = ?",
            (sid,),
        ).fetchone()
        if not svc or svc["owner_id"] == sitter_id or (svc["status"] or "").lower() != "pending":
            flash("This listing is not available to apply for.", "danger")
            return redirect(url_for("sitter_services"))

        dup = conn.execute(
            """
            SELECT 1 FROM applications
            WHERE service_id = ? AND sitter_id = ?
            LIMIT 1
            """,
            (sid, sitter_id),
        ).fetchone()
        if dup:
            flash("You have already applied for this service.", "warning")
            return redirect(url_for("sitter_services"))

        conn.execute(
            """
            INSERT INTO applications (
                service_id, sitter_id, applicant_name, applicant_phone,
                applicant_gender, experience_years, applicant_age,
                short_description, status
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending')
            """,
            (
                sid,
                sitter_id,
                name,
                phone,
                gender,
                exp,
                age,
                desc or None,
            ),
        )
        conn.commit()
        flash("Application sent. The owner will review it.", "success")
    except sqlite3.IntegrityError:
        conn.rollback()
        flash("You have already applied for this service.", "warning")
    finally:
        conn.close()
    return redirect(url_for("sitter_services"))


@app.route("/sitter/applications")
def sitter_applications():
    uid = session.get("user_id")
    apps = fetch_sitter_applications_payload(uid)
    return render_template(
        "sitter_applications.html",
        sitter_applications_payload=apps,
    )


@app.route("/chatbot/message", methods=["POST"])
def chatbot_message():
    """Proxy chat to Kimi (Moonshot) via NVIDIA for logged-in users."""
    if not session.get("role"):
        return jsonify({"error": "unauthorized", "reply": None}), 401

    payload = request.get_json(silent=True) or {}
    raw_msgs = payload.get("messages")
    if not isinstance(raw_msgs, list):
        return jsonify({"error": "invalid_messages", "reply": None}), 400

    openai_msgs = [{"role": "system", "content": _PAW_HUB_CHATBOT_SYSTEM}]
    for m in raw_msgs[-24:]:
        if not isinstance(m, dict):
            continue
        role = m.get("role")
        text = (m.get("text") or "").strip()
        if not text or len(text) > 8000:
            continue
        if role == "user":
            openai_msgs.append({"role": "user", "content": text})
        elif role in ("model", "assistant"):
            openai_msgs.append({"role": "assistant", "content": text})

    if len(openai_msgs) <= 1:
        return jsonify({"error": "empty_conversation", "reply": None}), 400
    if openai_msgs[-1]["role"] != "user":
        return jsonify({"error": "expected_user_message", "reply": None}), 400

    if not NVIDIA_API_KEY:
        return jsonify(
            {
                "configured": False,
                "reply": (
                    "Paw Hub Assistant needs NVIDIA_API_KEY in your .env file (Kimi via NVIDIA). "
                    "Restart the app after saving. See the comment block near the top of app.py."
                ),
            }
        )

    reply, err = _call_nvidia_kimi_chat(openai_msgs)
    if err:
        return jsonify(
            {
                "configured": True,
                "reply": (
                    "I couldn’t reach the AI service. Check NVIDIA_API_KEY, KIMI_MODEL "
                    f"({KIMI_MODEL}), and your network, then try again."
                ),
                "error": err,
            }
        )

    return jsonify({"configured": True, "reply": reply})


@app.route("/notifications")
def notifications():
    uid = session.get("user_id")
    rows = fetch_notifications_for_user(uid)
    return render_template("notifications.html", notifications=rows)


@app.route("/notifications/<int:nid>/read", methods=["POST"])
def notification_mark_read(nid):
    uid = session.get("user_id")
    conn = get_db()
    try:
        conn.execute(
            """
            UPDATE notifications SET is_read = 1
            WHERE notification_id = ? AND user_id = ?
            """,
            (nid, uid),
        )
        conn.commit()
    finally:
        conn.close()
    return redirect(url_for("notifications"))


@app.route("/notifications/mark-all-read", methods=["POST"])
def notifications_mark_all_read():
    uid = session.get("user_id")
    conn = get_db()
    try:
        conn.execute(
            "UPDATE notifications SET is_read = 1 WHERE user_id = ?",
            (uid,),
        )
        conn.commit()
    finally:
        conn.close()
    return redirect(url_for("notifications"))


def _profile_page_context(user_id):
    conn = get_db()
    try:
        row = conn.execute(
            """
            SELECT username, email, phone_number, gender, email_verified, avatar_filename
            FROM users
            WHERE user_id = ?
            """,
            (user_id,),
        ).fetchone()
    finally:
        conn.close()
    if not row:
        return {
            "user_display_name": session.get("display_name") or "Member",
            "profile_username": "",
            "profile_email": "",
            "profile_phone": "",
            "profile_gender": "",
            "profile_email_verified": False,
            "profile_avatar_url": _avatar_url_for_storage(None),
        }
    g = row["gender"]
    gender_val = g if g in ("Male", "Female") else ""
    return {
        "user_display_name": (row["username"] or "").strip() or "Member",
        "profile_username": (row["username"] or "").strip(),
        "profile_email": (row["email"] or "").strip(),
        "profile_phone": (row["phone_number"] or "").strip(),
        "profile_gender": gender_val,
        "profile_email_verified": bool(int(row["email_verified"] or 0)),
        "profile_avatar_url": _avatar_url_for_storage(row["avatar_filename"]),
    }


@app.route("/profile", methods=["GET", "POST"])
def profile():
    uid = session.get("user_id")
    if not uid:
        return redirect(url_for("login"))

    if request.method == "POST":
        username = (request.form.get("username") or "").strip()
        email = (request.form.get("email") or "").strip().lower()
        phone = (request.form.get("phone") or "").strip()
        gender_raw = (request.form.get("gender") or "").strip()
        password_current = request.form.get("password_current") or ""
        password_new = request.form.get("password_new") or ""
        password_confirm = request.form.get("password_confirm") or ""

        if gender_raw and gender_raw not in ("Male", "Female"):
            flash("Please choose a valid gender option.", "danger")
            return render_template("profile.html", **_profile_page_context(uid))

        gender_val = gender_raw if gender_raw in ("Male", "Female") else None

        if not username:
            flash("Username is required.", "danger")
            return render_template("profile.html", **_profile_page_context(uid))
        if not email:
            flash("Email is required.", "danger")
            return render_template("profile.html", **_profile_page_context(uid))
        if not phone:
            flash("Phone number is required.", "danger")
            return render_template("profile.html", **_profile_page_context(uid))

        new_avatar_rel = None
        conn = get_db()
        try:
            row = conn.execute(
                "SELECT user_id, email, password FROM users WHERE user_id = ?",
                (uid,),
            ).fetchone()
            if not row:
                flash("Account not found.", "danger")
                return redirect(url_for("login"))

            existing = get_user_by_email(email)
            if existing and int(existing["user_id"]) != int(uid):
                flash("That email is already in use by another account.", "danger")
                return render_template("profile.html", **_profile_page_context(uid))

            wants_pw_change = bool(
                password_current.strip() or password_new.strip() or password_confirm.strip()
            )
            if wants_pw_change:
                if not (password_current and password_new and password_confirm):
                    flash(
                        "To change your password, fill in current, new, and confirm fields.",
                        "danger",
                    )
                    return render_template("profile.html", **_profile_page_context(uid))
                if not check_password_hash(row["password"], password_current):
                    flash("Current password is incorrect.", "danger")
                    return render_template("profile.html", **_profile_page_context(uid))
                if password_new != password_confirm:
                    flash("New password and confirmation do not match.", "danger")
                    return render_template("profile.html", **_profile_page_context(uid))
                ok_pw, msg = is_strong_password(password_new)
                if not ok_pw:
                    flash(msg, "danger")
                    return render_template("profile.html", **_profile_page_context(uid))
                new_hash = generate_password_hash(password_new)
            else:
                new_hash = None

            upload = request.files.get("profile_photo")
            if upload and upload.filename:
                ok_av, err_av, rel_av = _save_user_avatar_file(int(uid), upload)
                if not ok_av:
                    flash(err_av, "danger")
                    return render_template("profile.html", **_profile_page_context(uid))
                new_avatar_rel = rel_av

            set_parts = ["username = ?", "email = ?", "phone_number = ?", "gender = ?"]
            params = [username, email, phone, gender_val]
            if new_avatar_rel is not None:
                set_parts.append("avatar_filename = ?")
                params.append(new_avatar_rel)
            if wants_pw_change:
                set_parts.append("password = ?")
                params.append(new_hash)
            params.append(uid)
            conn.execute(
                f"UPDATE users SET {', '.join(set_parts)} WHERE user_id = ?",
                tuple(params),
            )
            conn.commit()
        finally:
            conn.close()

        session["display_name"] = username
        session["email"] = email
        if new_avatar_rel is not None:
            session["avatar_filename"] = new_avatar_rel
        flash("Your profile has been saved.", "success")
        return redirect(url_for("profile"))

    return render_template("profile.html", **_profile_page_context(uid))


if __name__ == "__main__":
    app.run(debug=True)
