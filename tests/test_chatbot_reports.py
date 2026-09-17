"""Offline checks: temporary SQLite fixtures and mocked model responses."""

import importlib
import json
import os
import sqlite3
import tempfile
import unittest
from contextlib import closing, contextmanager
from datetime import datetime
from pathlib import Path
from unittest.mock import Mock, patch

from langchain_core.messages import AIMessage, HumanMessage
from langchain_core.utils.function_calling import convert_to_openai_tool
from langgraph.graph import END, START, MessagesState, StateGraph
from langgraph.prebuilt import ToolNode

from chatbot.tools import (
    ADMIN_TOOLS, ChatContext, KL_TZ, admin_database, current_month_window,
)


class SQLiteFixture:
    @contextmanager
    def writable_db(self):
        with closing(sqlite3.connect(self.database)) as conn:
            with conn:
                yield conn

    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.database = str(Path(self.temp.name) / "reports.db")
        with self.writable_db() as conn:
            conn.executescript("""
                CREATE TABLE users (
                    user_id INTEGER PRIMARY KEY, username TEXT, role TEXT,
                    is_suspended INTEGER DEFAULT 0, created_at TEXT
                );
                CREATE TABLE reviews (sitter_id INTEGER, rating INTEGER, created_at TEXT);
                INSERT INTO users VALUES
                    (1, 'Admin', 'admin', 0, '2026-09-02 00:00:00'),
                    (2, 'Owner', 'owner', 0, '2026-08-31 16:00:00'),
                    (3, 'Sitter A', 'sitter', 0, '2026-09-30 15:59:59'),
                    (4, 'Sitter B', 'sitter', 0, '2026-09-30 16:00:00'),
                    (5, 'Sitter C', 'sitter', 0, '2026-08-31 15:59:59'),
                    (6, 'Unrated', 'sitter', 0, '2026-09-03 00:00:00'),
                    (7, 'Suspended Owner', 'owner', 1, '2026-09-04 00:00:00');
                INSERT INTO reviews VALUES
                    (3, 5, '2025-01-01'), (3, 3, '2026-09-01'),
                    (4, 4, '2026-09-01'), (5, 1, '2026-09-01');
            """)
        builder = StateGraph(MessagesState, context_schema=ChatContext)
        builder.add_node("tools", ToolNode(ADMIN_TOOLS, handle_tool_errors="Unavailable"))
        builder.add_edge(START, "tools")
        builder.add_edge("tools", END)
        self.tool_graph = builder.compile()

    def run_tool(self, name, user_id=1):
        result = self.tool_graph.invoke(
            {"messages": [AIMessage(content="", tool_calls=[
                {"name": name, "args": {}, "id": "call_1", "type": "tool_call"},
            ])]},
            context=ChatContext(user_id=user_id, database=self.database),
        )
        return result["messages"][-1]


class AdminReportsTests(SQLiteFixture, unittest.TestCase):
    def test_month_boundaries_and_roles(self):
        with patch("chatbot.tools.datetime") as clock:
            clock.now.return_value = datetime(2026, 9, 17, tzinfo=KL_TZ)
            report = json.loads(self.run_tool("get_monthly_registrations").content)
        self.assertEqual(report, {
            "month": "2026-09", "timezone": "Asia/Kuala_Lumpur", "owner": 2, "sitter": 2,
        })

    def test_december_rollover(self):
        with patch("chatbot.tools.datetime") as clock:
            clock.now.return_value = datetime(2026, 12, 31, tzinfo=KL_TZ)
            self.assertEqual(current_month_window(), (
                "2026-12", "2026-11-30 16:00:00", "2026-12-31 16:00:00",
            ))

    def test_all_time_ratings_ties_and_unrated_exclusion(self):
        report = json.loads(self.run_tool("get_sitter_rating_extremes").content)
        self.assertEqual(report["highest"]["average_rating"], 4)
        self.assertEqual(report["highest"]["total_tied"], 2)
        self.assertEqual(report["highest"]["sitters"], [
            {"user_id": 3, "username": "Sitter A", "review_count": 2},
            {"user_id": 4, "username": "Sitter B", "review_count": 1},
        ])
        self.assertEqual(report["lowest"]["average_rating"], 1)
        self.assertEqual(report["lowest"]["sitters"][0]["user_id"], 5)
        self.assertNotIn("Unrated", json.dumps(report))

    def test_empty_reports(self):
        with self.writable_db() as conn:
            conn.execute("DELETE FROM reviews")
            conn.execute("DELETE FROM users WHERE role != 'admin'")
        ratings = json.loads(self.run_tool("get_sitter_rating_extremes").content)
        self.assertEqual(ratings["highest"], {"average_rating": None, "total_tied": 0, "sitters": []})
        counts = json.loads(self.run_tool("get_monthly_registrations").content)
        self.assertEqual((counts["owner"], counts["sitter"]), (0, 0))

    def test_tied_names_are_bounded_and_total_is_preserved(self):
        with self.writable_db() as conn:
            conn.execute("DELETE FROM reviews")
            for user_id in range(10, 18):
                conn.execute("INSERT INTO users VALUES (?, ?, 'sitter', 0, NULL)", (user_id, f"Sitter {user_id}"))
                conn.execute("INSERT INTO reviews VALUES (?, 5, '2020-01-01')", (user_id,))
        ratings = json.loads(self.run_tool("get_sitter_rating_extremes").content)
        self.assertEqual(ratings["highest"], ratings["lowest"])
        self.assertEqual(ratings["highest"]["total_tied"], 8)
        self.assertEqual(len(ratings["highest"]["sitters"]), 5)

    def test_non_admin_and_missing_users_cannot_query(self):
        for user_id in (2, 3, 999):
            for tool in ADMIN_TOOLS:
                with self.subTest(user_id=user_id, tool=tool.name):
                    message = self.run_tool(tool.name, user_id)
                    self.assertEqual(message.status, "error")
                    self.assertEqual(message.content, "Unavailable")

    def test_suspended_admin_cannot_query(self):
        with self.writable_db() as conn:
            conn.execute("UPDATE users SET is_suspended = 1 WHERE user_id = 1")
        self.assertEqual(self.run_tool("get_sitter_rating_extremes").status, "error")

    def test_sqlite_rejects_writes(self):
        with admin_database(ChatContext(1, self.database)) as conn:
            with self.assertRaises(sqlite3.OperationalError):
                conn.execute("DELETE FROM users")

    def test_model_cannot_supply_identity_database_or_sql(self):
        for tool in ADMIN_TOOLS:
            schema = convert_to_openai_tool(tool)["function"]["parameters"]
            self.assertEqual(schema["properties"], {})


class ChatIntegrationTests(SQLiteFixture, unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        # No model requests or real database migrations are performed in tests.
        with patch.dict(os.environ, {"OPENAI_API_KEY": "test-not-a-real-key"}):
            cls.chat = importlib.import_module("chatbot.graph")
        real_connect = sqlite3.connect
        with patch("sqlite3.connect", side_effect=lambda *a, **kw: real_connect(":memory:")):
            cls.web = importlib.import_module("app")

    def run_chat(self, role, user_id):
        model = Mock()
        model.bind_tools.return_value.invoke.return_value = AIMessage(content="", tool_calls=[
            {"name": tool.name, "args": {}, "id": f"call_{i}", "type": "tool_call"}
            for i, tool in enumerate(ADMIN_TOOLS)
        ])
        model.invoke.return_value = AIMessage(content="Answer")
        with patch.object(self.chat, "llm", model), patch.object(self.chat, "router") as router:
            router.invoke.return_value = self.chat.WorkflowSelection(workflow_ids=[])
            result = self.chat.graph.invoke(
                {"role": role, "workflows": [], "tools_used": False,
                 "messages": [HumanMessage(content="Registrations this month and highest/lowest rating?")]},
                context=ChatContext(user_id, self.database),
            )
        return result, model

    def test_admin_tool_round_uses_real_runtime_and_stops(self):
        result, model = self.run_chat("admin", 1)
        reports = [msg for msg in result["messages"] if msg.type == "tool"]
        self.assertEqual(len(reports), 2)
        self.assertTrue(all(msg.status == "success" for msg in reports))
        self.assertEqual(json.loads(reports[1].content)["highest"]["average_rating"], 4)
        self.assertEqual(model.bind_tools.call_count, 1)
        self.assertEqual(model.invoke.call_count, 1)
        self.assertEqual(result["messages"][-1].content, "Answer")

    def test_normal_help_does_not_offer_tools(self):
        for role, user_id in (("pet_owner", 2), ("pet_sitter", 3)):
            result, model = self.run_chat(role, user_id)
            model.bind_tools.assert_not_called()
            self.assertFalse(any(msg.type == "tool" for msg in result["messages"]))

    def test_forged_graph_role_still_cannot_read_database(self):
        result, _ = self.run_chat("admin", 2)
        self.assertTrue(all(msg.status == "error" for msg in result["messages"] if msg.type == "tool"))

    def post_chat(self, user_id, session_role):
        client = self.web.app.test_client()
        with client.session_transaction() as session:
            session["user_id"] = user_id
            session["role"] = session_role
        with patch.object(self.web, "DATABASE", self.database), patch.dict(os.environ, {"OPENAI_API_KEY": "test"}), patch.object(self.chat.graph, "invoke") as invoke:
            invoke.return_value = {"messages": [AIMessage(content="Answer")]}
            response = client.post("/chatbot/message", json={
                "role": "admin", "user_id": 1,
                "messages": [{"role": "user", "text": "Show registrations"}],
            })
        return response, invoke

    def test_route_ignores_payload_identity_and_stale_admin_session(self):
        response, invoke = self.post_chat(2, "admin")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(invoke.call_args.args[0]["role"], "pet_owner")
        self.assertEqual(invoke.call_args.kwargs["context"].user_id, 2)

    def test_route_passes_admin_context(self):
        response, invoke = self.post_chat(1, "admin")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(invoke.call_args.args[0]["role"], "admin")
        self.assertEqual(invoke.call_args.kwargs["context"], ChatContext(1, self.database))

    def test_route_rejects_suspended_and_missing_accounts(self):
        for user_id in (7, 999):
            response, invoke = self.post_chat(user_id, "admin")
            self.assertEqual(response.status_code, 403)
            invoke.assert_not_called()


if __name__ == "__main__":
    unittest.main()
