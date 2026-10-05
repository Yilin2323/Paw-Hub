"""Personal-data access checks using temporary databases and mocked models."""
import importlib
import json
import os
import sqlite3
import tempfile
import unittest
from pathlib import Path
from unittest.mock import Mock, patch

from langchain_core.messages import AIMessage, HumanMessage
from langchain_core.utils.function_calling import convert_to_openai_tool
from langgraph.graph import END, START, MessagesState, StateGraph
from langgraph.prebuilt import ToolNode

from chatbot.tools import PERSONAL_TOOLS, ChatContext, account_database


class PersonalDataTests(unittest.TestCase):
    def setUp(self):
        temp = tempfile.TemporaryDirectory()
        self.addCleanup(temp.cleanup)
        self.database = str(Path(temp.name) / 'personal.db')
        conn = sqlite3.connect(self.database)
        self.addCleanup(conn.close)
        self.conn = conn
        conn.executescript('''
            CREATE TABLE users (user_id INTEGER PRIMARY KEY, username TEXT,
                role TEXT, is_suspended INTEGER DEFAULT 0);
            INSERT INTO users VALUES
                (1, 'Owner A', 'owner', 0), (2, 'Owner B', 'owner', 0),
                (3, 'Sitter A', 'sitter', 0), (4, 'Sitter B', 'sitter', 0),
                (5, 'Admin', 'admin', 0), (6, 'Suspended', 'owner', 1),
                (7, 'Empty owner', 'owner', 0);
            CREATE TABLE services (
                service_id INTEGER PRIMARY KEY, owner_id INTEGER, approved_sitter_id INTEGER,
                service_type TEXT DEFAULT 'Pet Sitting', pet_type TEXT DEFAULT 'Cat',
                number_of_pets INTEGER DEFAULT 1, service_date TEXT, service_time TEXT DEFAULT '10:00',
                duration TEXT DEFAULT '1 Hour', location TEXT DEFAULT 'Cheras',
                salary REAL DEFAULT 50, status TEXT, full_address TEXT);
            INSERT INTO services (service_id, owner_id, approved_sitter_id, service_date, status, full_address)
            VALUES (10, 1, 3, '2026-10-05', 'ongoing', 'Address A'),
                   (11, 2, 4, '2026-10-11', 'approved', 'Private address B'),
                   (12, 1, NULL, '2026-10-12', 'pending', 'Unassigned private address'),
                   (13, 1, 3, '2026-10-04', 'completed', 'Past address A');
            CREATE TABLE applications (application_id INTEGER PRIMARY KEY, service_id INTEGER,
                sitter_id INTEGER, applicant_name TEXT, status TEXT, applied_at TEXT);
            INSERT INTO applications VALUES
                (20, 10, 3, 'Sitter A', 'approved', '2026-10-01'),
                (21, 11, 4, 'Sitter B', 'approved', '2026-10-02'),
                (22, 12, 3, 'Sitter A', 'pending', '2026-10-03'),
                (23, 12, 4, 'Sitter B', 'rejected', '2026-10-04'),
                (24, 13, 3, 'Sitter A', 'approved', '2026-10-01');
            CREATE TABLE reviews (review_id INTEGER PRIMARY KEY, service_id INTEGER,
                owner_id INTEGER, sitter_id INTEGER, rating INTEGER, review_comment TEXT, created_at TEXT);
            INSERT INTO reviews VALUES
                (30, 13, 1, 3, 5, 'Great sitter', '2026-10-04'),
                (31, 11, 2, 4, 2, 'Other private review', '2026-10-03');
        ''')
        builder = StateGraph(MessagesState, context_schema=ChatContext)
        builder.add_node('tools', ToolNode(PERSONAL_TOOLS, handle_tool_errors='Unavailable'))
        builder.add_edge(START, 'tools')
        builder.add_edge('tools', END)
        self.graph = builder.compile()

    def run_tool(self, name, user_id=1, **args):
        result = self.graph.invoke({'messages': [AIMessage(content='', tool_calls=[
            {'name': name, 'args': args, 'id': 'test-call', 'type': 'tool_call'}
        ])]}, context=ChatContext(user_id, self.database))
        return result['messages'][-1]

    def report(self, name, user_id=1, **args):
        message = self.run_tool(name, user_id, **args)
        self.assertEqual(message.status, 'success', message.content)
        return json.loads(message.content)

    def test_bookings_are_scoped_to_owner_or_assigned_sitter(self):
        for uid, expected in [(1, {10, 12, 13}), (2, {11}), (3, {10, 13}), (4, {11})]:
            result = self.report('get_my_bookings', uid)
            self.assertEqual({r['service_id'] for r in result['records']}, expected)
        result = self.report('get_my_bookings', 3)
        self.assertNotIn('Private address B', json.dumps(result))
        self.assertNotIn('Unassigned private address', json.dumps(result))

    def test_application_scope_and_status_are_separate_from_booking_status(self):
        for uid, expected in [(1, {20, 22, 23, 24}), (2, {21}), (3, {20, 22, 24}), (4, {21, 23})]:
            result = self.report('get_my_applications', uid)
            self.assertEqual({r['application_id'] for r in result['records']}, expected)
            self.assertNotIn('full_address', json.dumps(result))
        result = self.report('get_my_applications', 3, status='approved')
        self.assertEqual(result['total_matching'], 2)
        self.assertIn('completed', {r['service_status'] for r in result['records']})

    def test_reviews_are_written_or_received_not_platform_wide(self):
        for uid in (1, 3):
            result = self.report('get_my_reviews', uid)
            self.assertEqual(result['average_rating'], 5)
            self.assertEqual(result['total_matching'], 1)
            self.assertEqual(result['records'][0]['review_id'], 30)
        self.assertEqual(self.report('get_my_reviews', 1)['scope'], 'reviews_i_wrote')
        self.assertEqual(self.report('get_my_reviews', 3)['scope'], 'reviews_i_received')

    def test_inclusive_dates_and_status(self):
        result = self.report('get_my_bookings', 1, date_from='2026-10-05', date_to='2026-10-12')
        self.assertEqual({r['service_id'] for r in result['records']}, {10, 12})
        result = self.report('get_my_bookings', 1, status='ongoing', date_from='2026-10-05', date_to='2026-10-05')
        self.assertEqual(result['total_matching'], 1)
        result = self.report('get_my_applications', 3, status='pending', date_from='2026-10-12', date_to='2026-10-12')
        self.assertEqual(result['records'][0]['application_id'], 22)

    def test_invalid_filters_do_not_run_arbitrary_sql(self):
        for args in [dict(date_from="2026-10-05' OR 1=1 --"), dict(status='bogus'),
                     dict(date_from='2026-10-12', date_to='2026-10-01'), dict(offset=-1)]:
            self.assertEqual(self.run_tool('get_my_bookings', **args).status, 'error')
        self.assertEqual(self.conn.execute('SELECT COUNT(*) FROM users').fetchone()[0], 7)

    def test_missing_suspended_admin_and_missing_context_are_denied(self):
        for uid in (5, 6, 999):
            for tool in PERSONAL_TOOLS:
                self.assertEqual(self.run_tool(tool.name, uid).status, 'error')
        with self.assertRaises(PermissionError):
            with account_database(None, {'owner'}):
                pass
        self.conn.execute('UPDATE users SET is_suspended = 1 WHERE user_id = 3')
        self.conn.commit()
        self.assertEqual(self.run_tool('get_my_bookings', 3).status, 'error')

    def test_empty_results(self):
        for tool in PERSONAL_TOOLS:
            result = self.report(tool.name, 7)
            self.assertEqual(result['total_matching'], 0)
            self.assertEqual(result['records'], [])
            self.assertIsNone(result['next_offset'])
        self.assertIsNone(self.report('get_my_reviews', 7)['average_rating'])

    def test_pagination_and_full_review_average(self):
        for i in range(40, 65):
            self.conn.execute('INSERT INTO reviews VALUES (?, 13, 1, 3, 1, ?, ?)',
                              (i, 'x' * 2500, '2026-10-05'))
        self.conn.commit()
        first = self.report('get_my_reviews')
        second = self.report('get_my_reviews', offset=first['next_offset'])
        self.assertEqual(first['total_matching'], 26)
        self.assertEqual(len(first['records']), 20)
        self.assertEqual(len(second['records']), 6)
        self.assertIsNone(second['next_offset'])
        self.assertEqual(first['average_rating'], round(30 / 26, 2))
        self.assertLessEqual(len(first['records'][0]['review_comment']), 2000)
        self.assertFalse({r['review_id'] for r in first['records']} & {r['review_id'] for r in second['records']})

    def test_read_only_and_identity_not_in_model_schema(self):
        with account_database(ChatContext(1, self.database), {'owner'}) as (conn, role):
            with self.assertRaises(sqlite3.OperationalError):
                conn.execute('DELETE FROM services')
        for tool in PERSONAL_TOOLS:
            props = convert_to_openai_tool(tool)['function']['parameters']['properties']
            self.assertFalse({'runtime', 'user_id', 'database', 'sql', 'role'} & props.keys())

    def test_personal_tools_run_through_full_chat_graph(self):
        with patch.dict(os.environ, {'OPENAI_API_KEY': 'test-not-real'}):
            chat = importlib.import_module('chatbot.graph')
        for role, uid in [('pet_owner', 1), ('pet_sitter', 3)]:
            model = Mock()
            model.bind_tools.return_value.invoke.return_value = AIMessage(content='', tool_calls=[
                {'name': tool.name, 'args': {}, 'id': str(i), 'type': 'tool_call'}
                for i, tool in enumerate(PERSONAL_TOOLS)
            ])
            model.invoke.return_value = AIMessage(content='Your records')
            with patch.object(chat, 'llm', model), patch.object(chat, 'router') as router:
                router.invoke.return_value = chat.WorkflowSelection(workflow_ids=[])
                result = chat.graph.invoke({'role': role, 'workflows': [], 'tools_used': False,
                    'messages': [HumanMessage(content='Show my bookings, applications and reviews')]},
                    context=ChatContext(uid, self.database))
            reports = [m for m in result['messages'] if m.type == 'tool']
            self.assertEqual(len(reports), 3)
            self.assertTrue(all(m.status == 'success' for m in reports))
            model.bind_tools.assert_called_once_with(PERSONAL_TOOLS)
            model.invoke.assert_called_once()
            self.assertNotIn('Other private review', str([m.content for m in reports]))

    def test_general_help_can_skip_database_and_tool_failures_are_safe(self):
        with patch.dict(os.environ, {'OPENAI_API_KEY': 'test-not-real'}):
            chat = importlib.import_module('chatbot.graph')
        model = Mock()
        model.bind_tools.return_value.invoke.return_value = AIMessage(content='Open Schedule.')
        with patch.object(chat, 'llm', model), patch.object(chat, 'router') as router:
            router.invoke.return_value = chat.WorkflowSelection(workflow_ids=[])
            result = chat.graph.invoke({'role': 'pet_owner', 'workflows': [], 'tools_used': False,
                'messages': [HumanMessage(content='How do I view Schedule?')]},
                context=ChatContext(1, self.database))
        self.assertFalse(any(m.type == 'tool' for m in result['messages']))
        model.invoke.assert_not_called()
        self.conn.execute('DROP TABLE services')
        self.conn.commit()
        message = self.run_tool('get_my_bookings')
        self.assertEqual(message.status, 'error')
        self.assertEqual(message.content, 'Unavailable')

    def test_tool_guard_blocks_unknown_excessive_and_repeated_calls(self):
        with patch.dict(os.environ, {'OPENAI_API_KEY': 'test-not-real'}):
            chat = importlib.import_module('chatbot.graph')
        for names, used in [(['get_my_bookings'] * 4, False),
                            (['execute_sql'], False), (['get_my_reviews'], True),
                            (['get_monthly_registrations'], False)]:
            state = {'role': 'pet_owner', 'tools_used': used, 'messages': [
                AIMessage(content='', tool_calls=[
                    {'name': name, 'args': {}, 'id': str(i), 'type': 'tool_call'}
                    for i, name in enumerate(names)
                ])]}
            with patch.object(chat.tool_node, 'invoke') as invoke:
                result = chat.run_database_tools(state)
            invoke.assert_not_called()
            self.assertTrue(result['tools_used'])
            self.assertTrue(all(m.status == 'error' for m in result['messages']))

    def test_role_changes_are_rechecked_for_each_lookup(self):
        self.assertEqual(self.run_tool('get_my_bookings', 3).status, 'success')
        self.conn.execute("UPDATE users SET role = 'admin' WHERE user_id = 3")
        self.conn.commit()
        self.assertEqual(self.run_tool('get_my_bookings', 3).status, 'error')


if __name__ == '__main__':
    unittest.main()
