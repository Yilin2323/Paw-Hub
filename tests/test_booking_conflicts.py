"""Booking checks against disposable SQLite data, never the working database."""
import importlib
import sqlite3
import tempfile
import unittest
from concurrent.futures import ThreadPoolExecutor
from threading import Barrier
from pathlib import Path
from unittest.mock import patch


class BookingConflictTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        import init_db

        cls.temp = tempfile.TemporaryDirectory()
        cls.addClassCleanup(cls.temp.cleanup)
        cls.db_path = str(Path(cls.temp.name) / "bookings.db")
        with patch.object(init_db, "db_name", cls.db_path):
            init_db.init_db()
        # app.py performs migrations on import. Redirect them to our test database.
        connect = sqlite3.connect
        with patch("sqlite3.connect", side_effect=lambda *a, **kw: connect(cls.db_path, **kw)):
            cls.module = importlib.import_module("app")

    def setUp(self):
        self.db_patch = patch.object(self.module, "DATABASE", self.db_path)
        self.db_patch.start()
        self.addCleanup(self.db_patch.stop)
        self.notification = patch.object(self.module, "create_notification").start()
        self.addCleanup(patch.stopall)
        self.conn = self.module.get_db()
        self.addCleanup(self.conn.close)
        self.conn.executescript("DELETE FROM reviews; DELETE FROM applications; DELETE FROM services;")
        self.module.app.config.update(TESTING=True, SECRET_KEY="test-only")
        self.client = self.module.app.test_client()

    def service(self, sid, time="14:00", duration="2 Hours", date="2099-06-15",
                status="pending", sitter=None):
        self.conn.execute("""INSERT INTO services
            (service_id, owner_id, pet_type, service_type, number_of_pets,
             service_date, service_time, duration, location, salary, status, approved_sitter_id)
            VALUES (?, 2, 'Cat', 'Pet Sitting', 1, ?, ?, ?, 'Cheras', 50, ?, ?)""",
            (sid, date, time, duration, status, sitter))
        self.conn.commit()

    def application(self, aid, sid):
        self.conn.execute("""INSERT INTO applications
            (application_id, service_id, sitter_id, applicant_name, applicant_phone,
             experience_years, status) VALUES (?, ?, 3, 'Jason', '0123456789', 2, 'pending')""",
            (aid, sid))
        self.conn.commit()

    def login(self, role):
        with self.client.session_transaction() as session:
            session.clear()
            session.update(user_id=3 if role == "sitter" else 2, role=role)

    def apply(self, sid):
        self.login("sitter")
        return self.client.post(f"/sitter/services/{sid}/apply", data={
            "applicant_name": "Jason", "applicant_phone": "0123456789",
            "applicant_gender": "Male", "experience_years": "2", "applicant_age": "28"})

    def messages(self):
        with self.client.session_transaction() as session:
            return str(session.get("_flashes", []))

    def test_overlapping_confirmed_booking_blocks_submission(self):
        self.service(10, status="ongoing", sitter=3)
        self.service(11, time="15:00")
        self.assertEqual(self.apply(11).status_code, 302)
        self.assertIn("Time conflict", self.messages())
        self.assertEqual(self.conn.execute("SELECT count(*) FROM applications").fetchone()[0], 0)
        self.notification.assert_not_called()

    def test_adjacent_booking_is_allowed(self):
        self.service(10, status="approved", sitter=3)
        self.service(11, time="16:00")
        self.apply(11)
        self.assertIn("Application sent", self.messages())

    def test_pending_applications_and_completed_bookings_do_not_reserve_time(self):
        self.service(10)
        self.application(20, 10)
        self.service(11, status="completed", sitter=3)
        self.service(12)
        self.apply(12)
        self.assertIn("Application sent", self.messages())

    def test_overnight_and_multiday_overlap(self):
        for duration in ("2 Hours", "2 Days"):
            with self.subTest(duration=duration):
                self.conn.execute("DELETE FROM services")
                self.conn.commit()
                self.service(10, time="23:00", duration=duration, status="ongoing", sitter=3)
                self.service(11, time="00:30", date="2099-06-16")
                self.apply(11)
                self.assertIn("Time conflict", self.messages())

    def test_other_sitter_does_not_block(self):
        self.service(10, status="ongoing", sitter=99)
        self.service(11)
        self.apply(11)
        self.assertIn("Application sent", self.messages())

    def test_invalid_duration_is_rejected(self):
        self.service(10, duration="Unknown")
        self.apply(10)
        self.assertIn("invalid booking times", self.messages())

    def test_approval_rechecks_and_preserves_rejected_action_state(self):
        self.service(10)
        self.service(11)
        self.application(20, 10)
        self.application(21, 11)
        self.login("owner")
        self.client.post("/owner/applications/20/approve")
        self.notification.reset_mock()
        self.client.post("/owner/applications/21/approve")
        self.assertIn("Cannot approve this sitter. Time conflict", self.messages())
        self.assertEqual(self.conn.execute("SELECT status FROM applications WHERE application_id=21").fetchone()[0], "pending")
        row = self.conn.execute("SELECT status, approved_sitter_id FROM services WHERE service_id=11").fetchone()
        self.assertEqual(tuple(row), ("pending", None))
        self.notification.assert_not_called()

    def test_repeated_approval_does_not_notify_again(self):
        self.service(10)
        self.application(20, 10)
        self.login("owner")
        self.client.post("/owner/applications/20/approve")
        self.notification.reset_mock()
        self.client.post("/owner/applications/20/approve")
        self.assertIn("no longer available", self.messages())
        self.notification.assert_not_called()

    def test_concurrent_approvals_cannot_double_book(self):
        self.service(10)
        self.service(11)
        self.application(20, 10)
        self.application(21, 11)
        ready = Barrier(2)

        def approve(aid):
            client = self.module.app.test_client()
            with client.session_transaction() as session:
                session.update(user_id=2, role="owner")
            ready.wait(timeout=5)
            return client.post(f"/owner/applications/{aid}/approve").status_code

        with ThreadPoolExecutor(max_workers=2) as pool:
            self.assertEqual(list(pool.map(approve, (20, 21))), [302, 302])
        self.assertEqual(self.conn.execute(
            "SELECT count(*) FROM services WHERE approved_sitter_id=3").fetchone()[0], 1)
        self.assertEqual(self.conn.execute(
            "SELECT count(*) FROM applications WHERE status='pending'").fetchone()[0], 1)

    def test_approval_requires_service_owner(self):
        self.service(10)
        self.application(20, 10)
        self.login("owner")
        with self.client.session_transaction() as session:
            session["user_id"] = 99
        self.client.post("/owner/applications/20/approve")
        self.assertEqual(self.conn.execute(
            "SELECT status FROM applications WHERE application_id=20").fetchone()[0], "pending")
        self.notification.assert_not_called()

    def test_calendar_routes_removed_and_navigation_renders(self):
        self.login("owner")
        self.assertEqual(self.client.get("/owner/schedule").status_code, 404)
        self.assertEqual(self.client.get("/sitter/schedule").status_code, 404)
        response = self.client.get("/owner/applications")
        self.assertEqual(response.status_code, 200)
        self.assertNotIn(b'/owner/schedule', response.data)
        self.login("sitter")
        response = self.client.get("/sitter/services")
        self.assertEqual(response.status_code, 200)
        self.assertNotIn(b'/sitter/schedule', response.data)


if __name__ == "__main__":
    unittest.main()
