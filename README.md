# 🐾 Paw Hub — Pet Care Service Platform

## 📌 Overview

**Paw Hub** is a web-based platform that connects **pet owners** with **pet sitters**. It allows pet owners to create pet care service requests and enables pet sitters to apply for available services through a structured and user-friendly system.

In addition, the platform includes an **AI-powered chatbot** to assist users in writing content and improving their experience.

---

## 🎯 Objectives

- Provide a centralized platform for pet care service management
- Simplify the process of matching pet owners with pet sitters
- Help users manage service requests and applications efficiently
- Enhance user experience with AI-assisted support

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
- ✅ Applicant approval and rejection
- ⭐ Review and rating system
- 📊 Dashboard for both roles
- 👤 User profile management
- 🤖 AI chatbot for content assistance (Markdown-based writing support)

---

## 🤖 AI Chatbot Feature

All signed-in users can ask for Paw Hub guidance from the verified workflows in
`chatbot/knowledge.json`. Owners and sitters can also ask about their own live
SQLite records:

- “What confirmed bookings do I have next week?”
- “What is the status of my applications?”
- “Who is assigned to my service?”
- “What reviews have I received?” (sitters) or “What reviews have I written?” (owners)

In simple terms, this works in five steps:

1. Flask identifies the signed-in user from their session.
2. The chatbot chooses a predefined lookup in `chatbot/tools.py`.
3. The lookup rechecks the account and reads only records belonging to that user.
4. SQLite returns the matching records; the chatbot explains them in plain language.
5. A follow-up question performs a fresh lookup. No conversation checkpoints are stored.

Owners can read their service requests, applications to those requests, and reviews
they wrote. Sitters can read assigned bookings, applications they sent, and reviews
they received. Full addresses are returned only for an owner's own services or a
sitter's assigned bookings; application lookups do not include addresses or contacts.
Passwords and verification codes are never selected by these tools.

Booking and application lookups support status and inclusive service-start dates
in Malaysia time. They do not search every day covered by a multi-day booking.
Results contain up to 20 records per page, a matching count, and a next-page offset.
Review averages cover all reviews in the user's scope. The retrieved records are
sent to the configured model to compose the answer, just like the chat question.

Admins retain their separate platform-wide reports:

- “How many pet owners and pet sitters registered this month?” Counts use the
  Kuala Lumpur calendar month and include unverified and suspended accounts.
- “Who has the highest/lowest average rating?” Rankings use all reviews ever
  received by sitters, exclude unrated sitters, and include review counts.
  Ties show up to five names per group with the total number tied.

Tools recheck the account's role and suspension status and open SQLite in
read-only mode. They execute fixed queries and return compact summaries; the model
cannot supply SQL, database paths, or user identities. Each request permits at most
one batch of three personal-data calls or two admin-report calls. The chatbot cannot
modify records. Other personal-data categories and admin report periods are not supported.

Install `requirements.txt` in your Python environment and configure
`OPENAI_API_KEY` (optionally `OPENAI_MODEL`) in `.env`, then restart the app.
Run offline regression checks with `python -m unittest discover -s tests -v`.
The tests use temporary databases and mocked model responses without API charges.

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
8. Use AI chatbot for better guideline

---
