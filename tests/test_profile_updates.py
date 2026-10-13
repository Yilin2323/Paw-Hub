"""Profile edits must not interpret an autofilled current password as a change."""
import importlib
import sqlite3
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from werkzeug.security import check_password_hash


class ProfileUpdateTests(unittest.TestCase):
    def setUp(self):
        import init_db

        temp = tempfile.TemporaryDirectory()
        self.addCleanup(temp.cleanup)
        database = str(Path(temp.name) / "profile.db")
        with patch.object(init_db, "db_name", database):
            init_db.init_db()
        connect = sqlite3.connect
        # Import-time migrations must never touch the real database.
        with patch("sqlite3.connect", side_effect=lambda *args, **kwargs: connect(database, **kwargs)):
            self.module = importlib.import_module("app")
        db_patch = patch.object(self.module, "DATABASE", database)
        db_patch.start()
        self.addCleanup(db_patch.stop)
        self.module.app.config.update(TESTING=True, SECRET_KEY="test-only")
        self.client = self.module.app.test_client()
        with self.client.session_transaction() as session:
            session.update(user_id=2, role="owner", display_name="Alice")
        self.conn = self.module.get_db()
        self.addCleanup(self.conn.close)
        self.original_hash = self.user()[1]

    def user(self):
        return self.conn.execute("SELECT username, password FROM users WHERE user_id=2").fetchone()

    def save(self, **password_fields):
        return self.client.post("/profile", data={
            "username": "Alice Updated", "email": "alice@email.com",
            "phone": "0121111111", "gender": "Female", **password_fields,
        }, follow_redirects=True)

    def test_username_edit_with_empty_password_fields(self):
        response = self.save()
        self.assertEqual(response.status_code, 200)
        self.assertEqual(tuple(self.user()), ("Alice Updated", self.original_hash))
        self.assertNotIn(b"To change your password", response.data)
        with self.client.session_transaction() as session:
            self.assertEqual(session["display_name"], "Alice Updated")

    def test_autofilled_current_password_does_not_block_profile_edit(self):
        response = self.save(password_current="an-autofilled-password")
        self.assertEqual(tuple(self.user()), ("Alice Updated", self.original_hash))
        self.assertNotIn(b"To change your password", response.data)

    def test_incomplete_or_invalid_password_change_still_rejected(self):
        cases = [
            {"password_new": "NewPassword!123"},
            {"password_confirm": "NewPassword!123"},
            {"password_current": "wrong", "password_new": "NewPassword!123", "password_confirm": "NewPassword!123"},
            {"password_current": "OwnerPawHub!123", "password_new": "NewPassword!123", "password_confirm": "Mismatch!123"},
            {"password_current": "OwnerPawHub!123", "password_new": "weak", "password_confirm": "weak"},
        ]
        for fields in cases:
            with self.subTest(fields=list(fields)):
                self.save(**fields)
                self.assertEqual(tuple(self.user()), ("Alice", self.original_hash))

    def test_valid_password_change_succeeds(self):
        self.save(password_current="OwnerPawHub!123", password_new="NewPassword!123",
                  password_confirm="NewPassword!123")
        username, password_hash = self.user()
        self.assertEqual(username, "Alice Updated")
        self.assertTrue(check_password_hash(password_hash, "NewPassword!123"))
        self.assertFalse(check_password_hash(password_hash, "OwnerPawHub!123"))


if __name__ == "__main__":
    unittest.main()
