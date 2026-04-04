from flask import Flask, render_template

app = Flask(__name__)


def get_owner_dashboard_context():
    user_display_name = "Jordan"
    total_services_count = 12
    average_rating = 4.8
    return {
        "user_display_name": user_display_name,
        "total_services_count": total_services_count,
        "average_rating": average_rating,
    }


@app.route("/")
def owner_dashboard():
    return render_template("owner_dashboard.html", **get_owner_dashboard_context())


@app.route("/owner/services")
def owner_services():
    return render_template("owner_services.html")

@app.route("/owner/create-service", methods=["GET", "POST"])
def create_service():
    return render_template("create_service.html")


@app.route("/owner/applications")
def owner_applications():
    return render_template("owner_applications.html")


@app.route("/notifications")
def notifications():
    return render_template("notifications.html")


@app.route("/profile")
def profile():
    return render_template("profile.html")

if __name__ == "__main__":
    app.run(debug=True)