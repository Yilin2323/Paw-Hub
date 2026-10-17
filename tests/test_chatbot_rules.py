"""Guided help must remain deterministic, reachable, and database-free."""
import ast
from pathlib import Path
import sqlite3
import unittest
from unittest.mock import patch

from chatbot.rules import reply_to


class ChatbotRulesTests(unittest.TestCase):
    def test_every_branch_is_reachable_without_database(self):
        seen, pending = set(), ["menu"]
        with patch.object(sqlite3, "connect", side_effect=AssertionError("No database allowed")):
            while pending:
                node = pending.pop()
                if node in seen:
                    continue
                seen.add(node)
                response = reply_to(node)
                self.assertEqual(response["node"], node)
                self.assertTrue(response["reply"])
                self.assertTrue(response["title"])
                self.assertTrue(response["options"])
                self.assertEqual(response, reply_to(node))
                for option in response["options"]:
                    self.assertTrue(option["label"])
                    pending.append(option["value"])
        tree = ast.parse(Path("chatbot/rules.py").read_text())
        branches = {n.comparators[0].value for n in ast.walk(tree)
                    if isinstance(n, ast.Compare) and isinstance(n.left, ast.Name)
                    and n.left.id == "option" and isinstance(n.comparators[0], ast.Constant)}
        self.assertEqual(seen, branches)

    def test_unknown_and_removed_commands_return_menu(self):
        for value in ("/bookings", "/applications", "/reviews", "/registrations", "/ratings", "made-up"):
            response = reply_to(value)
            self.assertEqual(response["node"], "menu")
            self.assertEqual(response["options"], reply_to("menu")["options"])

    def test_owner_sitter_and_problem_paths(self):
        for path in (("menu", "journey", "owner_start", "owner_post", "owner_choose", "owner_finish"),
                     ("menu", "journey", "sitter_start", "find_jobs", "apply_steps", "after_apply"),
                     ("menu", "apply", "problems", "conflict")):
            for source, target in zip(path, path[1:]):
                self.assertIn(target, [c["value"] for c in reply_to(source)["options"]])
        self.assertIn("Pending applications may overlap", reply_to("conflict")["reply"])


if __name__ == "__main__":
    unittest.main()
