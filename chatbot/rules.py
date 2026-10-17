"""A fixed decision tree: button choice -> written help + next choices.

No AI, database access, or account records. Each branch is an explicit if–then rule.
"""


def choice(value, label):
    return {"value": value, "label": label}


MAIN_OPTIONS = [
    choice("find", "How to look for a service"),
    choice("apply", "How to apply"),
    choice("journey", "How to start my journey"),
]


def reply_to(option):
    """Resolve a button ID. Unknown IDs safely return the main menu."""
    if option == "menu":
        title = "Main menu"
        text = "Hi! Let's find your next step. What would you like help with?"
        options = MAIN_OPTIONS
    elif option == "find":
        title = "Find a service"
        text = "Are you looking for a pet care job, or someone to care for your pet?"
        options = [choice("find_jobs", "Find a pet care job"), choice("owner_post", "Find a sitter for my pet")]
    elif option == "find_jobs":
        title = "Browse jobs"
        text = "1. Sign in as a pet sitter.\n2. Open Services and browse Latest post.\n3. Use Pet type, Types of services, and Location to narrow the listings.\n4. Choose a suitable job and click Apply."
        options = [choice("apply_steps", "How do I apply?"), choice("no_jobs", "I cannot find a suitable job")]
    elif option == "no_jobs":
        title = "No suitable jobs"
        text = "Try clearing the Pet type, Types of services, and Location filters. Browse Latest post again.\n\nIf nothing suits you, check again later. Upcoming and Completed contain your assigned jobs, not new opportunities."
        options = [choice("find_jobs", "Show browsing steps")]
    elif option == "apply":
        title = "Application help"
        text = "Applying is for pet sitters. Which part would you like help with?"
        options = [choice("apply_steps", "Application steps"), choice("requirements", "What do I need?"), choice("problems", "I am having a problem")]
    elif option == "apply_steps":
        title = "Send an application"
        text = "1. Open Services as a pet sitter.\n2. Choose an available job and click Apply.\n3. Check your name, experience, gender, age, and phone number.\n4. Add an optional description.\n5. Click Submit application."
        options = [choice("after_apply", "What happens next?"), choice("requirements", "Check the requirements"), choice("problems", "I cannot submit")]
    elif option == "requirements":
        title = "Before you apply"
        text = "• Use a pet sitter account.\n• Choose an available service that has not started.\n• Complete the required application fields.\n• Apply only once to each service.\n• The job must not overlap an approved or ongoing job assigned to you."
        options = [choice("apply_steps", "Show application steps"), choice("problems", "Help with a problem")]
    elif option == "after_apply":
        title = "After applying"
        text = "Open Applications to view your status.\n\nPending: the pet owner has not decided yet.\nApproved: the owner has selected you.\nRejected: the owner did not select your application.\n\nFor assigned active jobs, open Services → Upcoming."
        options = [choice("find_jobs", "Find another job"), choice("conflict", "Understand time conflicts")]
    elif option == "problems":
        title = "Application problems"
        text = "Which situation looks like yours?"
        options = [choice("already_applied", "Already applied"), choice("conflict", "Time conflict"), choice("missing_apply", "Cannot find Apply")]
    elif option == "already_applied":
        title = "Already applied"
        text = "You can apply only once to the same service. Open Applications to check your existing application instead of submitting again."
        options = [choice("after_apply", "Explain application statuses"), choice("find_jobs", "Look for another job")]
    elif option == "conflict":
        title = "Time conflict"
        text = "A job cannot overlap an approved or ongoing job assigned to you. Compare its date, start time, and duration with your Upcoming services.\n\nChoose a job at another time. Pending applications may overlap, but availability is checked again when an owner approves one."
        options = [choice("find_jobs", "Find another job"), choice("problems", "A different problem")]
    elif option == "missing_apply":
        title = "Cannot find Apply"
        text = "1. Make sure you are using a pet sitter account.\n2. Open Services → Latest post.\n3. Look for an available listing you have not already applied to.\n\nPet owners create service requests instead of applying for jobs."
        options = [choice("already_applied", "I already applied"), choice("owner_post", "I am a pet owner")]
    elif option == "journey":
        title = "Start your journey"
        text = "Which journey would you like to explore?"
        options = [choice("owner_start", "I am a pet owner"), choice("sitter_start", "I am a pet sitter")]
    elif option == "owner_start":
        title = "Pet owner journey"
        text = "1. Register as a pet owner, verify your account, and sign in.\n2. Complete your profile.\n3. Create a service request for your pet.\n4. Review applications and choose a sitter."
        options = [choice("owner_post", "Help me post a service"), choice("owner_choose", "How do I choose a sitter?")]
    elif option == "sitter_start":
        title = "Pet sitter journey"
        text = "1. Register as a pet sitter, verify your account, and sign in.\n2. Complete your profile.\n3. Browse available jobs in Services.\n4. Apply and follow your status in Applications."
        options = [choice("find_jobs", "Help me find a job"), choice("apply", "Help me apply")]
    elif option == "owner_post":
        title = "Post a service request"
        text = "1. Open Create Service as a pet owner.\n2. Select the pet type, service type, and number of pets.\n3. Enter the date, time, duration, location, and salary offered.\n4. Add care instructions if needed and submit.\n\nPet sitters can then apply to your listing."
        options = [choice("owner_choose", "What happens next?")]
    elif option == "owner_choose":
        title = "Choose a sitter"
        text = "Open Applications to review applicants for your services. Review their details, then approve a suitable sitter or reject an application.\n\nIf approval reports a time conflict, choose another available sitter."
        options = [choice("owner_finish", "What happens after the service?"), choice("owner_post", "Post another service")]
    elif option == "owner_finish":
        title = "Finish your service"
        text = "When the care is finished, open your service and mark it completed when the option is available. You can then leave a review for your sitter."
        options = [choice("owner_start", "Review my journey")]
    else:
        result = reply_to("menu")
        result["reply"] = "Please choose one of the help options to continue."
        return result

    return {"node": option, "title": title, "reply": text, "options": options}
