import sqlite3

from werkzeug.security import generate_password_hash

db_name = "PawHub.db"

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
        bio TEXT,
        is_suspended INTEGER NOT NULL DEFAULT 0 CHECK (is_suspended IN (0, 1)),
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
        message TEXT NOT NULL,             -- The actual text content
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
    INSERT INTO users (username, role, email, phone_number, password, gender, experience_years, bio)
    VALUES
    ('Admin_Main', 'admin', 'admin@pawhub.com', '0120000000', ?, NULL, NULL, 'System Admin'),
    ('Alice', 'owner', 'alice@email.com', '0121111111', ?, 'Female', NULL, 'Living in PJ, owns 2 cats'),
    ('Jason', 'sitter', 'jason@email.com', '0134444444', ?, 'Male', 2, 'Professional Dog Walker');
    """,
        (pw_admin, pw_owner, pw_sitter),
    )

    # Create a Service (eg . Alice finds a cat sitter)
    cursor.execute("""
    INSERT INTO services (owner_id, pet_type, service_type, number_of_pets, service_date, service_time, duration, location, salary, status)
    VALUES (2, 'Cat', 'Pet Sitting', 2, '2026-04-15', '14:00', '3 Hours', 'Petaling Jaya', 45.0, 'pending');
    """)

    # Create an Application (Jason applies for Alice's job)
    cursor.execute("""
    INSERT INTO applications (service_id, sitter_id, applicant_name, applicant_phone, applicant_gender, experience_years, short_description)
    VALUES (1, 3, 'Jason ', '0134444444', 'Male', 2, 'I love cats and live in PJ.');
    """)

    # Create Test Notifications
    cursor.execute("""
    INSERT INTO notifications (user_id, message, notif_type)
    VALUES 
    (2, 'You have a new applicant: Jason for your Cat Sitting service.', 'info'),
    (3, 'Congratulations! Your application for Cat Sitting has been approved.', 'success'),
    (3, 'Reminder: You have an upcoming Dog Walking service tomorrow at 6:00 PM.', 'warning');
    """)

    conn.commit()
    conn.close()
    print(f"Successfully initialized {db_name} database")

if __name__ == "__main__":
    init_db()
