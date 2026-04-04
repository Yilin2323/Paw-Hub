from flask import Flask, render_template

app = Flask(__name__)


def get_owner_dashboard_context():
    """
    Owner dashboard data for the template.
    Replace these assignments with session user + database queries when auth and models exist.
    """
    # user_display_name = current_user.first_name  # example
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


if __name__ == "__main__":
    app.run(debug=True)