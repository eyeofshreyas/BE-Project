# ponytail self-check for messages.py's participant/relationship guards -- a
# caller must not be able to read or send into a conversation they're not
# part of, and a client must not be able to start a conversation with a
# lawyer_id they have no case with.
"""Tests for the messages domain: get-or-create conversation, and the participant guard
on reading/sending within a conversation."""
from unittest.mock import MagicMock, patch

from fastapi import HTTPException

from app.middleware import auth
from app.controllers.messages import get_or_create_conversation, get_conversation, send_message
from app.models.messages import ConversationCreate, MessageCreate


def _fake_supabase_for_get_or_create(client_id=7, cases=None, case_lawyers=None, conversations=None):
    fake = MagicMock()
    tables: dict[str, MagicMock] = {}
    cases = [{"case_id": 10}] if cases is None else cases
    case_lawyers = [{"lawyer_id": 5}] if case_lawyers is None else case_lawyers
    conversations = [] if conversations is None else conversations

    def table(name):
        if name in tables:
            return tables[name]
        m = MagicMock()
        if name == "clients":
            m.select.return_value.eq.return_value.execute.return_value.data = [{"client_id": client_id}]
        elif name == "cases":
            m.select.return_value.eq.return_value.execute.return_value.data = cases
        elif name == "case_lawyers":
            m.select.return_value.in_.return_value.eq.return_value.eq.return_value.execute.return_value.data = case_lawyers
        elif name == "conversations":
            m.select.return_value.eq.return_value.eq.return_value.execute.return_value.data = conversations
            m.insert.return_value.execute.return_value.data = [{"id": 42}]
        tables[name] = m
        return m

    fake.table.side_effect = table
    return fake


def _fake_supabase_for_conversation(row: dict, client_id=7):
    fake = MagicMock()
    tables: dict[str, MagicMock] = {}

    def table(name):
        if name in tables:
            return tables[name]
        m = MagicMock()
        if name == "clients":
            m.select.return_value.eq.return_value.execute.return_value.data = [{"client_id": client_id}]
        elif name == "conversations":
            m.select.return_value.eq.return_value.execute.return_value.data = [row]
        tables[name] = m
        return m

    fake.table.side_effect = table
    return fake


def test_get_or_create_returns_existing_conversation_without_inserting():
    """Verifies calling get-or-create twice for the same client-lawyer pair returns the
    existing row instead of inserting a duplicate. Exercises: `POST /messages/conversations`
    (`messages.get_or_create_conversation()`)."""
    profile = {"role_id": auth.CLIENT, "user_id": 1}
    existing_row = {
        "id": 42, "client_id": 7, "lawyer_id": 5,
        "clients": {"users": {"full_name": "Test Client"}},
        "lawyers": {"users": {"full_name": "Adv. Meera Kulkarni"}},
    }
    fake = _fake_supabase_for_get_or_create(conversations=[existing_row])
    with patch("app.controllers.messages.supabase", fake):
        result = get_or_create_conversation(ConversationCreate(other_party_id=5), profile)
        assert result["id"] == 42
        assert result["other_party_name"] == "Adv. Meera Kulkarni"
        assert not fake.table("conversations").insert.called


def test_get_or_create_rejects_client_with_no_case_with_lawyer():
    """Verifies a client can't start a conversation with a lawyer_id they have no case with;
    raises 403. Exercises: `POST /messages/conversations` (`messages.get_or_create_conversation()`)."""
    profile = {"role_id": auth.CLIENT, "user_id": 1}
    fake = _fake_supabase_for_get_or_create(cases=[])
    with patch("app.controllers.messages.supabase", fake):
        try:
            get_or_create_conversation(ConversationCreate(other_party_id=5), profile)
            assert False, "expected HTTPException"
        except HTTPException as e:
            assert e.status_code == 403


def test_get_conversation_rejects_non_participant():
    """Verifies a client who isn't this conversation's client_id gets 403 reading it.
    Exercises: `GET /messages/conversations/{id}` (`messages.get_conversation()`)."""
    profile = {"role_id": auth.CLIENT, "user_id": 1}
    row = {"id": 1, "client_id": 99, "lawyer_id": 5, "clients": None, "lawyers": None}
    fake = _fake_supabase_for_conversation(row, client_id=7)
    with patch("app.controllers.messages.supabase", fake):
        try:
            get_conversation(1, profile)
            assert False, "expected HTTPException"
        except HTTPException as e:
            assert e.status_code == 403


def test_send_message_rejects_non_participant():
    """Verifies a client who isn't this conversation's client_id gets 403 sending into it.
    Exercises: `POST /messages/conversations/{id}/messages` (`messages.send_message()`)."""
    profile = {"role_id": auth.CLIENT, "user_id": 1}
    row = {"id": 1, "client_id": 99, "lawyer_id": 5, "clients": None, "lawyers": None}
    fake = _fake_supabase_for_conversation(row, client_id=7)
    with patch("app.controllers.messages.supabase", fake):
        try:
            send_message(1, MessageCreate(body="hi"), profile)
            assert False, "expected HTTPException"
        except HTTPException as e:
            assert e.status_code == 403


def _fake_supabase_for_get_or_create_lawyer(lawyer_id=3, cases=None, case_lawyers=None, conversations=None):
    fake = MagicMock()
    tables: dict[str, MagicMock] = {}
    cases = [{"case_id": 10}] if cases is None else cases
    case_lawyers = [{"lawyer_id": 3}] if case_lawyers is None else case_lawyers
    conversations = [] if conversations is None else conversations

    def table(name):
        if name in tables:
            return tables[name]
        m = MagicMock()
        if name == "lawyers":
            m.select.return_value.eq.return_value.execute.return_value.data = [{"lawyer_id": lawyer_id}]
        elif name == "cases":
            m.select.return_value.eq.return_value.execute.return_value.data = cases
        elif name == "case_lawyers":
            m.select.return_value.in_.return_value.eq.return_value.eq.return_value.execute.return_value.data = case_lawyers
        elif name == "conversations":
            m.select.return_value.eq.return_value.eq.return_value.execute.return_value.data = conversations
            m.insert.return_value.execute.return_value.data = [{"id": 42}]
        tables[name] = m
        return m

    fake.table.side_effect = table
    return fake


def test_get_or_create_conversation_lawyer_path():
    """Verifies a lawyer can get-or-create a conversation with a client_id they share an active case with.
    Exercises: `POST /messages/conversations` from a LAWYER-role caller."""
    profile = {"role_id": auth.LAWYER, "user_id": 2}
    existing_row = {
        "id": 42, "client_id": 7, "lawyer_id": 3,
        "clients": {"users": {"full_name": "Test Client"}},
        "lawyers": {"users": {"full_name": "Adv. Test Lawyer"}},
    }
    fake = _fake_supabase_for_get_or_create_lawyer(conversations=[existing_row])
    with patch("app.controllers.messages.supabase", fake):
        result = get_or_create_conversation(ConversationCreate(other_party_id=7), profile)
        assert result["id"] == 42
        assert result["other_party_name"] == "Test Client"
        assert result["other_party_role"] == "client"


if __name__ == "__main__":
    test_get_or_create_returns_existing_conversation_without_inserting()
    test_get_or_create_rejects_client_with_no_case_with_lawyer()
    test_get_conversation_rejects_non_participant()
    test_send_message_rejects_non_participant()
    test_get_or_create_conversation_lawyer_path()
    print("ok")
