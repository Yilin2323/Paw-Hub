import os
import re
import sqlite3
from datetime import datetime
from urllib.parse import urlparse

from flask import (
    Flask,
    flash,
    redirect,
    render_template,
    request,
    session,
    url_for,
)
from werkzeug.security import check_password_hash, generate_password_hash

app = Flask(__name__)
app.secret_key = os.environ.get("FLASK_SECRET_KEY", "dev-mock-secret-change-in-production")

DATABASE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "PawHub.db")


def get_db():
    conn = sqlite3.connect(DATABASE)
    conn.row_factory = sqlite3.Row
    return conn


def get_user_by_email(email):
    if not email:
        return None
    conn = get_db()
    try:
        row = conn.execute(
            """
            SELECT user_id, username, role, email, password, is_suspended
            FROM users
            WHERE lower(trim(email)) = ?
            """,
            (email.strip().lower(),),
        ).fetchone()
        return row
    finally:
        conn.close()


def fetch_owner_dashboard_stats(user_id):
    """Counts from DB for the logged-in owner (new users → zeros / empty)."""
    if not user_id:
        return {
            "totalServices": 0,
            "myRating": None,
            "applicationStatus": {"pending": 0, "approved": 0, "rejected": 0},
            "serviceTypes": [],
        }
    conn = get_db()
    try:
        total_services = conn.execute(
            "SELECT COUNT(*) AS c FROM services WHERE owner_id = ?",
            (user_id,),
        ).fetchone()["c"]

        avg_row = conn.execute(
            """
            SELECT AVG(r.rating) AS avg_r
            FROM reviews r
            INNER JOIN services s ON r.service_id = s.service_id
            WHERE s.owner_id = ?
            """,
            (user_id,),
        ).fetchone()["avg_r"]

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

        service_types = []
        for row in conn.execute(
            """
            SELECT service_type AS st, COUNT(*) AS c
            FROM services
            WHERE owner_id = ?
            GROUP BY service_type
            """,
            (user_id,),
        ):
            service_types.append({"label": row["st"], "value": int(row["c"])})

        my_rating = None
        if avg_row is not None:
            my_rating = round(float(avg_row), 1)

        return {
            "totalServices": int(total_services),
            "myRating": my_rating,
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
            SELECT activity_summary, activity_ts FROM (
                SELECT
                    ('User registered: ' || username || ' (' || role || ')')
                        AS activity_summary,
                    created_at AS activity_ts,
                    user_id AS sort_id
                FROM users
                UNION ALL
                SELECT
                    ('Service listing: ' || service_type || ' · ' || pet_type),
                    created_at,
                    service_id
                FROM services
                UNION ALL
                SELECT
                    ('Application: ' || applicant_name || ' · ' || status),
                    applied_at,
                    application_id
                FROM applications
                UNION ALL
                SELECT message, created_at, notification_id
                FROM notifications
                UNION ALL
                SELECT
                    ('Review: ' || rating || '/5 stars'),
                    created_at,
                    review_id
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


def fetch_sitter_dashboard_stats(user_id):
    """Counts from DB for the logged-in sitter (new users → zeros / empty)."""
    if not user_id:
        return {
            "joinedServices": 0,
            "myRating": None,
            "applicationStatus": {"pending": 0, "approved": 0, "rejected": 0},
            "serviceCategoriesJoined": [],
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

        categories = []
        for row in conn.execute(
            """
            SELECT s.service_type AS st, COUNT(*) AS c
            FROM services s
            WHERE s.approved_sitter_id = ?
            GROUP BY s.service_type
            """,
            (user_id,),
        ):
            categories.append({"label": row["st"], "value": int(row["c"])})

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


def _salary_display(val):
    if val is None:
        return "—"
    v = float(val)
    if abs(v - round(v)) < 0.001:
        return f"RM {int(round(v))}"
    return f"RM {v:.2f}"


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
    }


def fetch_owner_service_partition(owner_id):
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
            else:
                latest.append(card)
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
        browse_rows = conn.execute(
            """
            SELECT * FROM services
            WHERE status = 'pending' AND owner_id != ?
            ORDER BY service_id DESC
            """,
            (sitter_id,),
        ).fetchall()
        up_rows = conn.execute(
            """
            SELECT * FROM services
            WHERE approved_sitter_id = ? AND status IN ('approved', 'ongoing')
            ORDER BY service_id DESC
            """,
            (sitter_id,),
        ).fetchall()
        done_rows = conn.execute(
            """
            SELECT * FROM services
            WHERE approved_sitter_id = ? AND status = 'completed'
            ORDER BY service_id DESC
            """,
            (sitter_id,),
        ).fetchall()
        return {
            "browse": [_service_row_to_card(r) for r in browse_rows],
            "upcoming": [_service_row_to_card(r) for r in up_rows],
            "completed": [_service_row_to_card(r) for r in done_rows],
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
            SELECT a.application_id, a.applicant_name, a.applicant_phone,
                   a.applicant_gender, a.experience_years, a.short_description,
                   a.status, s.service_type, u.email AS sitter_email
            FROM applications a
            INNER JOIN services s ON s.service_id = a.service_id
            INNER JOIN users u ON u.user_id = a.sitter_id
            WHERE s.owner_id = ?
            ORDER BY a.application_id DESC
            """,
            (owner_id,),
        ).fetchall()
        out = []
        for r in rows:
            ey = r["experience_years"]
            exp = f"{int(ey)} years" if ey is not None else "—"
            out.append(
                {
                    "applicationId": r["application_id"],
                    "name": r["applicant_name"],
                    "gender": r["applicant_gender"] or "—",
                    "experience": exp,
                    "rating": None,
                    "serviceType": r["service_type"],
                    "status": _status_title(r["status"]),
                    "description": (r["short_description"] or "").strip(),
                    "phone": r["applicant_phone"] or "",
                    "email": (r["sitter_email"] or "").strip(),
                }
            )
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
                   s.service_type, s.pet_type, s.service_date, s.service_time,
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


PUBLIC_ENDPOINTS = frozenset({"index", "login", "logout", "signup"})
OWNER_ONLY = frozenset(
    {
        "owner_services",
        "owner_applications",
        "create_service",
        "owner_service_complete",
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
ADMIN_ONLY = frozenset({"admin_dashboard"})


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
    return {
        "is_owner": role == "owner",
        "is_sitter": role == "sitter",
        "is_admin": role == "admin",
        "logged_in": bool(role),
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
        else:
            session["user_id"] = row["user_id"]
            session["role"] = row["role"]
            session["email"] = row["email"]
            session["display_name"] = row["username"]
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
                INSERT INTO users (username, role, email, phone_number, password, gender, experience_years, bio)
                VALUES (?, ?, ?, ?, ?, ?, 0, ?)
                """,
                (
                    username,
                    role,
                    email,
                    phone,
                    pw_hash,
                    gender_val,
                    "Paw Hub member",
                ),
            )
            conn.commit()
        except sqlite3.IntegrityError:
            conn.rollback()
            flash("Email already in use.", "danger")
            return render_template("signup.html", **form_ctx)
        finally:
            conn.close()

        flash(
            "Account created. Please sign in with your email and password.",
            "success",
        )
        return redirect(url_for("login"))

    return render_template("signup.html", **_signup_form_state())

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
            """,
            (sid, uid),
        )
        conn.commit()
        if cur.rowcount:
            flash("Service marked as completed.", "success")
        else:
            flash("Could not update that service.", "danger")
    finally:
        conn.close()
    return redirect(url_for("owner_services"))


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

@app.route("/admin/applications")
def admin_applications():
    return render_template("admin_applications.html", **get_admin_applications_context())

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
    )


@app.route("/sitter/services/<int:sid>/apply", methods=["POST"])
def sitter_apply_service(sid):
    sitter_id = session.get("user_id")
    conn = get_db()
    try:
        svc = conn.execute(
            "SELECT owner_id, status FROM services WHERE service_id = ?",
            (sid,),
        ).fetchone()
        if not svc or svc["owner_id"] == sitter_id or (svc["status"] or "").lower() != "pending":
            flash("This listing is not available to apply for.", "danger")
            return redirect(url_for("sitter_services"))
        user = conn.execute(
            """
            SELECT username, phone_number, gender, experience_years
            FROM users WHERE user_id = ?
            """,
            (sitter_id,),
        ).fetchone()
        if not user:
            flash("User not found.", "danger")
            return redirect(url_for("sitter_services"))
        exp = user["experience_years"]
        if exp is None:
            exp = 0
        conn.execute(
            """
            INSERT INTO applications (
                service_id, sitter_id, applicant_name, applicant_phone,
                applicant_gender, experience_years, short_description, status
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, 'pending')
            """,
            (
                sid,
                sitter_id,
                user["username"],
                user["phone_number"],
                user["gender"],
                int(exp),
                "",
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


@app.route("/profile")
def profile():
    return render_template("profile.html", **get_owner_dashboard_context())


if __name__ == "__main__":
    app.run(debug=True)
