# 🐾 Paw Hub — Pet Care Service Platform

## 📌 Overview

**Paw Hub** is a web-based platform that connects **pet owners** with **pet sitters**. It allows pet owners to create pet care service requests and enables pet sitters to apply for available services through a structured and user-friendly system.

In addition, the platform includes a **rule-based chatbot** that guides users through preset help choices using if–then rules. It uses no AI models or external model APIs.

---

## 🎯 Objectives

- Provide a centralized platform for pet care service management
- Simplify the process of matching pet owners with pet sitters
- Help users manage service requests and applications efficiently
- Enhance user experience with rule-based support

---

## 👥 User Roles

### 🐶 Pet Owner

- Create and manage pet care service posts
- View sitter applications
- Accept or reject applicants
- Mark services as completed
- Leave reviews and ratings

### 🐱 Pet Sitter

- Browse available pet care services
- Apply for services
- Track application status
- View accepted or joined services

---

## ⚙️ Features

- 🔐 User registration and login
- 📋 Pet care service posting and management
- 📥 Service application system
- Booking-time conflict checks with popup warnings (no separate Schedule page)
- ✅ Applicant approval and rejection
- ⭐ Review and rating system
- 📊 Dashboard for both roles
- 👤 User profile management
- Rule-based chatbot with three preset help options

---

## Booking-time rules

Sitters cannot apply for a service that overlaps a confirmed assignment (a service
assigned to them with `approved` or `ongoing` status). Pending applications do not
reserve time, and completed services do not block it. An owner approving an
application triggers the same check again, so a sitter who became unavailable
while waiting cannot be double-booked. A rejected action shows a popup warning
without changing the application or assignment.

Intervals overlap when each starts before the other ends. A job ending at 16:00
and another beginning at 16:00 are allowed; travel time is not included. Checks
use the full date and duration, including overnight and multi-day services.
Booking details remain available in Services and Applications.

## Rule-based chatbot

The active chatbot requires no model, API key, LangChain, LangGraph, or OpenAI SDK.
It does not send chat messages or account data to an external service.

How it works:

1. Start with “How to look for a service”, “How to apply”, or “How to start my journey”.
2. Choose follow-up buttons for owner/sitter journeys, application requirements,
   troubleshooting, and next steps.
3. `static/js/chabot.js` sends a fixed button ID to `/chatbot/message`.
4. Flask checks the login session without querying the database.
5. `chatbot/rules.py` uses explicit `if / elif / else` branches to return written
   guidance and the next button choices. Unknown IDs return the main menu.

Back follows the user's actual path; Main menu starts over. Navigation is kept
in browser memory while the page is open. Failed requests retain the current
choices so users can retry. There is no free-text input, database lookup, or AI.
All guidance and choices are defined directly in `chatbot/rules.py`.

Install `requirements.txt`, then start the app as usual. No model configuration
is needed. Tests run with `python -m unittest discover -s tests -v` using temporary
databases. The historical implementation and restoration steps are preserved in
[backups/README.md](backups/README.md). Nothing in that archive is loaded at runtime.

---

## 🖥️ Tech Stack

### Frontend

- HTML5
- CSS3
- JavaScript

### Backend

- Python (Flask)

### Database

- SQLite

---

## 🚀 System Flow

1. User registers an account and selects a role
2. Pet Owner creates a pet care service post
3. Pet Sitter browses available services
4. Pet Sitter applies for a service
5. Pet Owner reviews applications and selects a sitter
6. The service is completed
7. Pet Owner submits a review and rating
8. Use the rule-based chatbot for help

---
