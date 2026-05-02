import os
import sqlite3

from werkzeug.security import generate_password_hash

# Same location as app.py's DATABASE — always beside this file, not the shell cwd.
_DB_DIR = os.path.dirname(os.path.abspath(__file__))
db_name = os.path.join(_DB_DIR, "PawHub.db")


def init_db():
    conn = sqlite3.connect(db_name)
    cursor = conn.cursor()

    # Drop existing tables to reset the database
    cursor.execute("DROP TABLE IF EXISTS reviews;")
    cursor.execute("DROP TABLE IF EXISTS notifications;")
    cursor.execute("DROP TABLE IF EXISTS applications;")
    cursor.execute("DROP TABLE IF EXISTS services;")
    cursor.execute("DROP TABLE IF EXISTS users;")

    # 1. Users Table (Centralized for all roles)
    cursor.execute("""
    CREATE TABLE users (
        user_id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT NOT NULL,
        role TEXT NOT NULL CHECK (role IN ('admin', 'owner', 'sitter')),
        email TEXT NOT NULL UNIQUE,
        phone_number TEXT NOT NULL,
        password TEXT NOT NULL,
        gender TEXT CHECK (gender IN ('Male', 'Female')),
        experience_years INTEGER DEFAULT 0,
        is_suspended INTEGER NOT NULL DEFAULT 0 CHECK (is_suspended IN (0, 1)),
        email_verified INTEGER NOT NULL DEFAULT 0 CHECK (email_verified IN (0, 1)),
        otp_code_hash TEXT,
        otp_expires_at TEXT,
        otp_last_sent_at TEXT,
        pwd_reset_otp_hash TEXT,
        pwd_reset_otp_expires_at TEXT,
        pwd_reset_otp_sent_at TEXT,
        avatar_filename TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    """)

    # 2. Services Table
    cursor.execute("""
    CREATE TABLE services (
        service_id INTEGER PRIMARY KEY AUTOINCREMENT,
        owner_id INTEGER NOT NULL,
        pet_type TEXT NOT NULL CHECK (pet_type IN ('Dog', 'Cat', 'Rabbit', 'Bird')),
        service_type TEXT NOT NULL CHECK (service_type IN ('Pet Sitting', 'Pet Day Care', 'Pet Taxi', 'Pet Training', 'Dog Walking')),
        number_of_pets INTEGER NOT NULL CHECK (number_of_pets > 0),
        service_date TEXT NOT NULL, -- Format: YYYY-MM-DD
        service_time TEXT NOT NULL,
        duration TEXT NOT NULL,
        location TEXT NOT NULL CHECK (location IN ('Petaling Jaya', 'Bukit Bintang', 'Bukit Jalil', 'Puchong', 'Cheras')),
        salary REAL NOT NULL CHECK (salary > 0),
        description TEXT,
        status TEXT NOT NULL CHECK (status IN ('pending', 'approved', 'ongoing', 'completed')) DEFAULT 'pending',
        approved_sitter_id INTEGER,
        booking_reminder_sent INTEGER NOT NULL DEFAULT 0 CHECK (booking_reminder_sent IN (0, 1)),
        service_end_reminder_sent INTEGER NOT NULL DEFAULT 0 CHECK (service_end_reminder_sent IN (0, 1)),
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (owner_id) REFERENCES users(user_id),
        FOREIGN KEY (approved_sitter_id) REFERENCES users(user_id)
    );
    """)

    # 3. Applications Table
    cursor.execute("""
    CREATE TABLE applications (
        application_id INTEGER PRIMARY KEY AUTOINCREMENT,
        service_id INTEGER NOT NULL,
        sitter_id INTEGER NOT NULL,
        applicant_name TEXT NOT NULL,
        applicant_phone TEXT NOT NULL,
        applicant_gender TEXT CHECK (applicant_gender IN ('Male', 'Female')),
        experience_years INTEGER NOT NULL CHECK (experience_years >= 0),
        applicant_age INTEGER CHECK (applicant_age IS NULL OR (applicant_age >= 1 AND applicant_age <= 120)),
        short_description TEXT,
        status TEXT NOT NULL CHECK (status IN ('pending', 'approved', 'rejected')) DEFAULT 'pending',
        applied_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (service_id) REFERENCES services(service_id),
        FOREIGN KEY (sitter_id) REFERENCES users(user_id),
        UNIQUE(service_id, sitter_id) -- Business Rule: One application per sitter per service
    );
    """)

    # 4. Notifications Table
    cursor.execute("""
    CREATE TABLE notifications (
        notification_id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,          -- Recipient of the notification
        title TEXT,                        -- Short headline (e.g. shown in notification list UI)
        message TEXT NOT NULL,             -- Body text
        notif_type TEXT,                   -- 'info', 'success', 'warning'
        is_read INTEGER NOT NULL DEFAULT 0 CHECK (is_read IN (0, 1)),
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(user_id)
    );
    """)

    # 5. Reviews Table
    cursor.execute("""
    CREATE TABLE reviews (
        review_id INTEGER PRIMARY KEY AUTOINCREMENT,
        service_id INTEGER NOT NULL UNIQUE, 
        owner_id INTEGER NOT NULL,
        sitter_id INTEGER NOT NULL,
        rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
        review_comment TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (service_id) REFERENCES services(service_id),
        FOREIGN KEY (owner_id) REFERENCES users(user_id),
        FOREIGN KEY (sitter_id) REFERENCES users(user_id)
    );
    """)
    # --- INSERT TEST DATA ---
    pw_admin = generate_password_hash("AdminPawHub!123")
    pw_owner = generate_password_hash("OwnerPawHub!123")
    pw_sitter = generate_password_hash("SitterPawHub!123")
    cursor.execute(
        """
    INSERT INTO users (username, role, email, phone_number, password, gender, experience_years, email_verified)
    VALUES
    ('Admin_Main', 'admin', 'admin@pawhub.com', '0120000000', ?, NULL, NULL, 1),
    ('Alice', 'owner', 'alice@email.com', '0121111111', ?, 'Female', NULL, 1),
    ('Jason', 'sitter', 'jason@email.com', '0134444444', ?, 'Male', 2, 1);
    """,
        (pw_admin, pw_owner, pw_sitter),
    )

    # Create an Services 
    cursor.execute("""
    INSERT INTO services (
    owner_id, pet_type, service_type, number_of_pets,
    service_date, service_time, duration, location, salary,
    description, status, approved_sitter_id
    )
    VALUES
    (2, 'Cat', 'Pet Sitting', 2, '2026-04-20', '10:00', '3 Hours', 'Petaling Jaya', 50.0, 'Need cat care.', 'pending', NULL),
    (2, 'Dog', 'Dog Walking', 1, '2026-04-18', '18:00', '1 Hour', 'Puchong', 30.0, 'Evening walk.', 'approved', 3),
    (2, 'Cat', 'Pet Day Care', 1, '2026-04-11', '09:00', '6 Hours', 'Bukit Jalil', 80.0, 'Day care.', 'ongoing', 3),
    (2, 'Dog', 'Pet Sitting', 1, '2026-04-05', '12:00', '4 Hours', 'Cheras', 60.0, 'Dog sitting.', 'completed', 3);
""")

    # Create an Applications
    cursor.execute("""
    INSERT INTO applications (
    service_id, sitter_id, applicant_name, applicant_phone,
    applicant_gender, experience_years, applicant_age, short_description, status
    )
    VALUES
    (1, 3, 'Jason', '0134444444', 'Male', 2, 28, 'I love cats and live in PJ.', 'pending'),
    (2, 3, 'Jason', '0134444444', 'Male', 2, 28, 'Available for evening walks.', 'approved'),
    (3, 3, 'Jason', '0134444444', 'Male', 2, 28, 'Can handle day care.', 'approved'),
    (4, 3, 'Jason', '0134444444', 'Male', 2, 28, 'Experienced sitter.', 'approved');
""")
    # Create a Review (Owner reviews the sitter)
    cursor.execute("""
    INSERT INTO reviews (service_id, owner_id, sitter_id, rating, review_comment)
    VALUES (4, 2, 3, 5, 'Very responsible and took great care of my dog!');
    """)

    conn.commit()
    conn.close()
    print(f"Successfully initialized {db_name} database")

if __name__ == "__main__":
    init_db()
