# 🐾 Paw Hub — Pet Care Service Platform

## 📌 Overview

**Paw Hub** is a web-based platform that connects **pet owners** with **pet sitters**. It allows pet owners to create pet care service requests and enables pet sitters to apply for available services through a structured and user-friendly system.

In addition, the platform includes an **rule-based chatbot** that answers predefined support questions and reads permitted records using fixed commands. It uses no AI models or external model APIs.

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
- Rule-based chatbot for help and read-only record lookups

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

1. Flask checks the signed-in account and rechecks its stored role and suspension.
2. `chatbot/rules.py` matches exact FAQ examples, titles, or ordered keyword rules.
3. FAQ replies use the written steps and rules in `chatbot/knowledge.json`.
4. Fixed record commands call ordinary Python functions in `chatbot/lookups.py`.
5. Fixed templates format the result. Unknown questions show a help menu; there
   is no model fallback, learned intent classifier, embedding search, or generation.

Examples: “How to apply the job”, “How to post a service”, “Change password”,
“Why is there a time conflict?”, or `help`.

Owners and sitters can read their own records with these commands:

- `/bookings` — owner service requests or sitter assigned bookings, all statuses.
- `/applications` — applications to the owner's services or sent by the sitter.
- `/reviews` — reviews written by the owner or received by the sitter.
- `/bookings status=ongoing from=2026-10-01 to=2026-10-31`
- `/applications status=pending offset=20`
- `/reviews offset=20`

Dates must be explicit YYYY-MM-DD values. They filter the service START date
in Malaysia time, not every day spanned by a booking. Results contain at most
20 records per page, total matching count, and a next-page command. Review
averages cover all reviews in the account's scope. Full addresses are returned
only for the owner's own services or sitter's assigned bookings. Applications
exclude contacts and addresses; no lookup selects passwords or verification codes.

Admins have `/registrations` for current-month registration counts (including
unverified/suspended accounts), and `/ratings` for all-time highest/lowest sitter
ratings, with ties and review counts. Other report periods are not supported.

All lookups use fixed SQL, recheck account access, and open SQLite read-only.
A command cannot choose another account or change records. Relative dates such
as “next week”, arbitrary natural-language data filters, conversation follow-ups,
and writing assistance are not supported. Type `/help` for exact syntax.

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
