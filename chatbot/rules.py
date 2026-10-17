"""Deterministic FAQ routing and fixed read-only commands. No AI or network calls."""
import re
import shlex

from chatbot.knowledge import load_workflows
from chatbot.lookups import (
    get_my_bookings, get_my_applications, get_my_reviews,
    get_monthly_registrations, get_sitter_rating_extremes,
)


def normalize(text):
    return " ".join(re.findall(r"[a-z0-9]+", text.lower()))


# Ordered, hand-written conditions: specific questions come before general ones.
# Every pattern points to a written workflow in knowledge.json.
RULES = (
    (r"\b(conflict|overlap|double book)\b", "booking_conflicts"),
    (r"\b(forgot|reset)\b.*\bpassword\b", "reset_forgotten_password"),
    (r"\bpassword\b", "change_password"),
    (r"\b(avatar|photo|picture)\b", "change_profile_picture"),
    (r"\b(profile|username|phone|gender|email)\b", "edit_profile"),
    (r"\b(notification|notifications)\b", "view_notifications"),
    (r"\b(cancel|cancellation)\b", "cancel_service"),
    (r"\bdelete\b.*\b(service|listing|post)\b", "delete_service_listing"),
    (r"\b(description|edit service)\b", "edit_service_description"),
    (r"\b(approve|accept|reject|choose|select)\b.*\b(sitter|application|applicant)\b", "approve_or_reject_application"),
    (r"\b(complete|completed|finish|finished)\b.*\b(service|job|booking)\b", "complete_service"),
    (r"\b(rate|rating|review)\b.*\bsitter\b", "review_sitter"),
    (r"\b(post|create|add)\b.*\b(service|job|request)\b", "create_service"),
    (r"\b(apply|application form)\b", "apply_for_service"),
    (r"\b(browse|find|available)\b.*\b(jobs|services|job|service)\b", "browse_sitter_services"),
)

ALIASES = {
    "my bookings": "/bookings", "show my bookings": "/bookings",
    "my services": "/bookings", "my applications": "/applications",
    "show my applications": "/applications", "my reviews": "/reviews",
    "show my reviews": "/reviews", "registrations this month": "/registrations",
    "sitter rating report": "/ratings",
}


def help_text(role):
    topics = [w["title"] for w in load_workflows() if w["role"] in (role, "all")]
    commands = (
        "/registrations — current-month registrations\n/ratings — all-time sitter rating report"
        if role == "admin" else
        "/bookings — your services/bookings\n/applications — your applications\n/reviews — your reviews"
    )
    return ("I answer from written rules, not an AI model. Ask about one topic at a time.\n\n"
            + "Topics:\n" + "\n".join("• " + title for title in topics)
            + "\n\nRead-only commands:\n" + commands
            + "\nType a topic title or a command. For command options, type /help.")


def workflow_reply(workflow, role):
    allowed = workflow["role"]
    if allowed not in ("all", role):
        label = {"pet_owner": "pet owners", "pet_sitter": "pet sitters", "admin": "admins"}[allowed]
        return f"{workflow['title']} is for {label}. Type help to see options for your account."
    lines = [workflow["title"]]
    lines.extend(f"{i}. {step}" for i, step in enumerate(workflow.get("steps", []), 1))
    if workflow.get("rules"):
        lines.append("\nRules:")
        lines.extend("• " + rule for rule in workflow["rules"])
    return "\n".join(lines)


COMMAND_HELP = (
    "Commands read records; they never change them.\n"
    "/bookings [status=all|pending|approved|ongoing|completed] [from=YYYY-MM-DD] [to=YYYY-MM-DD] [offset=0]\n"
    "/applications [status=all|pending|approved|rejected] [from=YYYY-MM-DD] [to=YYYY-MM-DD] [offset=0]\n"
    "/reviews [offset=0]\n"
    "Admins only: /registrations (current month), /ratings (all time).\n"
    "Dates filter the service start date in Malaysia time. Each page contains at most 20 records.\n"
    "Use exact dates and commands; relative dates and conversational follow-ups are not supported."
)


def command_reply(text, role, context):
    try:
        parts = shlex.split(text)
        command = parts[0].lower()
        if command == "/help":
            return COMMAND_HELP
        personal = {"/bookings": get_my_bookings, "/applications": get_my_applications, "/reviews": get_my_reviews}
        admin = {"/registrations": get_monthly_registrations, "/ratings": get_sitter_rating_extremes}
        if command not in personal and command not in admin:
            return "Unknown command. " + COMMAND_HELP
        if (command in admin and role != "admin") or (command in personal and role == "admin"):
            return "This command is not available for your account role. Type help for your options."
        allowed = {"offset"} if command == "/reviews" else {"status", "from", "to", "offset"}
        if command in admin:
            allowed = set()
        options = {}
        for part in parts[1:]:
            key, value = part.split("=", 1)
            if key not in allowed or key in options or not value:
                raise ValueError("Invalid option")
            options[key] = value
        kwargs = {({"from": "date_from", "to": "date_to"}.get(k, k)): v for k, v in options.items()}
        if "offset" in kwargs:
            kwargs["offset"] = int(kwargs["offset"])
            if not 0 <= kwargs["offset"] <= 2147483647:
                raise ValueError("Invalid offset")
        data = (personal | admin)[command](context, **kwargs)
    except (ValueError, TypeError):
        return "Invalid command options. " + COMMAND_HELP
    except PermissionError:
        return "This information is not available for your account. Please sign in again."

    if command == "/registrations":
        return (f"Registrations for {data['month']} (Malaysia time):\n"
                f"Pet owners: {data['owner']}\nPet sitters: {data['sitter']}\n"
                "Includes unverified and suspended accounts.")
    if command == "/ratings":
        lines = ["Sitter ratings — all time, out of 5; unrated sitters excluded."]
        for label in ("highest", "lowest"):
            group = data[label]
            if not group["sitters"]:
                lines.append(f"{label.capitalize()}: no rated sitters.")
                continue
            lines.append(f"{label.capitalize()}: {group['average_rating']} / 5; {group['total_tied']} sitter(s) tied.")
            lines.extend(f"• {sitter['username']}: {sitter['review_count']} review(s)" for sitter in group["sitters"])
            if group["total_tied"] > len(group["sitters"]):
                lines.append(f"Showing {len(group['sitters'])} of {group['total_tied']} tied sitters.")
        return "\n".join(lines)

    titles = {"my_services": "Your service requests", "my_assigned_bookings": "Your assigned bookings",
              "applications_to_my_services": "Applications to your services", "my_sent_applications": "Your sent applications",
              "reviews_i_wrote": "Reviews you wrote", "reviews_i_received": "Reviews you received"}
    title = titles.get(data["scope"], data["scope"].replace("_", " ").capitalize())
    records, total = data["records"], data["total_matching"]
    lines = [title, f"Matching records: {total}."]
    if command != "/reviews":
        lines.append(f"Status: {data['status']}; start dates: {data['date_from'] or 'any'} to {data['date_to'] or 'any'} (Malaysia time).")
    else:
        lines.append(f"All-time average of these reviews: {data['average_rating'] if data['average_rating'] is not None else 'no ratings'} / 5.")
    if not records:
        lines.append("No records on this page.")
    else:
        lines.append(f"Showing {data['offset'] + 1}–{data['offset'] + len(records)} of {total}:")
        for record in records:
            lines.append("\n" + " | ".join(f"{key.replace('_', ' ')}: {value}" for key, value in record.items() if value is not None))
    if data["next_offset"] is not None:
        options["offset"] = str(data["next_offset"])
        lines.append("\nNext page: " + command + " " + " ".join(f"{k}={v}" for k, v in options.items()))
    return "\n".join(lines)


def reply_to(text, role, context):
    """Resolve an exact command, known FAQ, or explicit keyword rule; otherwise show help."""
    if role not in {"pet_owner", "pet_sitter", "admin"}:
        return "Please sign in with an active Paw Hub account."
    normalized = normalize(text)
    if text.strip().startswith("/"):
        return command_reply(text.strip(), role, context)
    if normalized in ALIASES:
        return command_reply(ALIASES[normalized], role, context)
    if normalized in {"hi", "hello", "help", "menu", "how to use the system", "how do i use paw hub"}:
        return help_text(role)
    workflows = load_workflows()
    for workflow in workflows:
        examples = [workflow["title"], *workflow.get("example_questions", [])]
        if normalized in {normalize(example) for example in examples}:
            return workflow_reply(workflow, role)
    # A live-data question must not be mistaken for a general FAQ answer.
    if re.search(r"\b(my|next week|today|tomorrow|this month)\b", normalized) and re.search(r"\b(bookings|applications|reviews|records|assigned|registered)\b", normalized):
        return "To look up your records, use a fixed command with exact dates.\n" + COMMAND_HELP
    for pattern, workflow_id in RULES:
        if re.search(pattern, normalized):
            workflow = next((w for w in workflows if w["id"] == workflow_id), None)
            if workflow:
                return workflow_reply(workflow, role)
    return "I do not have a written answer for that question.\n\n" + help_text(role)
