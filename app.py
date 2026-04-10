import os
from urllib.parse import urlparse
import re

from flask import (
    Flask,
    flash,
    redirect,
    render_template,
    request,
    session,
    url_for,
)

app = Flask(__name__)
app.secret_key = os.environ.get("FLASK_SECRET_KEY", "dev-mock-secret-change-in-production")

# Mock users (no database) — align emails with static/js/mock_data.js for client-side data
MOCK_USERS = {
    "jordan@email.com": {
        "password": "password123",
        "role": "owner",
        "display_name": "Jordan",
    },
    "alex@email.com": {
        "password": "password123",
        "role": "sitter",
        "display_name": "Alex",
    },
}

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
        "logged_in": bool(role),
        "account_role_label": (
            "Pet Sitter"
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
        return redirect(url_for("sitter_dashboard") if role == "sitter" else url_for("login"))
    if ep in SITTER_ONLY and role != "sitter":
        return redirect(url_for("index") if role == "owner" else url_for("login"))


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
        user = MOCK_USERS.get(email)
        if not user or user["password"] != password:
            flash("Invalid email or password.", "danger")
        else:
            session["role"] = user["role"]
            session["email"] = email
            session["display_name"] = user["display_name"]
            nxt = _safe_next_url(request.form.get("next") or request.args.get("next"))
            if nxt:
                return redirect(nxt)
            if user["role"] == "sitter":
                return redirect(url_for("sitter_dashboard"))
            return redirect(url_for("index"))

    return render_template("login.html")


@app.route("/logout")
def logout():
    session.clear()
    return redirect(url_for("index"))


@app.route("/signup", methods=["GET", "POST"])
def signup():
    if request.method == "POST":
        email = (request.form.get("email") or "").strip().lower()
        role = request.form.get("role") or ""
        gender = request.form.get("gender") or ""
        username = request.form.get("username") or ""
        phone = request.form.get("phone") or ""
        password = request.form.get("password") or ""
        confirm_password = request.form.get("confirm_password") or ""

        # Password strength check
        is_valid_password, password_message = is_strong_password(password)
        if not is_valid_password:
            flash(password_message, "danger")
            return render_template("signup.html"), 400

        # Confirm password check
        if password != confirm_password:
            flash("Passwords do not match.", "danger")
            return render_template("signup.html"), 400

        # Email duplicate check
        if email in MOCK_USERS:
            flash("Email already in use.", "danger")
            return render_template("signup.html"), 400

        # Save user
        MOCK_USERS[email] = {
            "password": password,
            "role": role,
            "gender": gender,
            "username": username,
            "phone": phone,
        }

        session["role"] = role
        session["email"] = email
        session["display_name"] = username

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
