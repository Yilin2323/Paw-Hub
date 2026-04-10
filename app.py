import os
import re
import sqlite3
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

PUBLIC_ENDPOINTS = frozenset({"index", "login", "logout", "signup"})
OWNER_ONLY = frozenset({"owner_services", "owner_applications", "create_service"})
SITTER_ONLY = frozenset({"sitter_dashboard", "sitter_services", "sitter_applications"})


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


def get_owner_dashboard_context():
    user_display_name = session.get("display_name") or "Jordan"
    total_services_count = 12
    average_rating = 4.8
    return {
        "user_display_name": user_display_name,
        "total_services_count": total_services_count,
        "average_rating": average_rating,
    }


def get_sitter_dashboard_context():
    return {"sitter_display_name": session.get("display_name") or "Alex"}


@app.route("/")
def index():
    role = session.get("role")
    if role == "sitter":
        return redirect(url_for("sitter_dashboard"))
    if role == "owner":
        return render_template("owner_dashboard.html", **get_owner_dashboard_context())
    return render_template("landing.html")


@app.route("/login", methods=["GET", "POST"])
def login():
    if session.get("role"):
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
                return redirect(url_for("index"))
            return redirect(url_for("index"))

    return render_template("login.html")


@app.route("/logout")
def logout():
    session.clear()
    return redirect(url_for("index"))


@app.route("/signup", methods=["GET", "POST"])
def signup():
    if session.get("role"):
        return redirect(url_for("index"))

    if request.method == "POST":
        email = (request.form.get("email") or "").strip().lower()
        role = (request.form.get("role") or "").strip().lower()
        gender = (request.form.get("gender") or "").strip()
        username = (request.form.get("username") or "").strip()
        phone = (request.form.get("phone") or "").strip()
        password = request.form.get("password") or ""
        confirm_password = request.form.get("confirm_password") or ""

        if request.form.get("terms") != "on":
            flash("Please accept the Terms of Service and Privacy Policy.", "danger")
            return render_template("signup.html"), 400

        if role not in ("owner", "sitter"):
            flash("Please select a valid account role.", "danger")
            return render_template("signup.html"), 400

        if gender and gender not in ("Male", "Female"):
            flash("Please select a valid gender.", "danger")
            return render_template("signup.html"), 400

        if not username:
            flash("Username is required.", "danger")
            return render_template("signup.html"), 400

        if not phone:
            flash("Phone number is required.", "danger")
            return render_template("signup.html"), 400

        if not email:
            flash("Email is required.", "danger")
            return render_template("signup.html"), 400

        is_valid_password, password_message = is_strong_password(password)
        if not is_valid_password:
            flash(password_message, "danger")
            return render_template("signup.html"), 400

        if password != confirm_password:
            flash("Passwords do not match.", "danger")
            return render_template("signup.html"), 400

        if get_user_by_email(email):
            flash("Email already in use.", "danger")
            return render_template("signup.html"), 400

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
            user_id = cur.lastrowid
        except sqlite3.IntegrityError:
            conn.rollback()
            flash("Email already in use.", "danger")
            return render_template("signup.html"), 400
        finally:
            conn.close()

        session["user_id"] = user_id
        session["role"] = role
        session["email"] = email
        session["display_name"] = username
        flash("Account created successfully. Welcome to Paw Hub!", "success")
        if role == "sitter":
            return redirect(url_for("sitter_dashboard"))
        return redirect(url_for("index"))

    return render_template("signup.html")

@app.route("/owner/services")
def owner_services():
    return render_template("owner_services.html")


@app.route("/owner/create-service", methods=["GET", "POST"])
def create_service():
    return render_template("create_service.html")


@app.route("/owner/applications")
def owner_applications():
    return render_template("owner_applications.html")


@app.route("/sitter")
def sitter_dashboard():
    return render_template("sitter_dashboard.html", **get_sitter_dashboard_context())


@app.route("/sitter/services")
def sitter_services():
    return render_template("sitter_services.html")


@app.route("/sitter/applications")
def sitter_applications():
    return render_template("sitter_applications.html")


@app.route("/notifications")
def notifications():
    return render_template("notifications.html")


@app.route("/profile")
def profile():
    return render_template("profile.html", **get_owner_dashboard_context())


if __name__ == "__main__":
    app.run(debug=True)
