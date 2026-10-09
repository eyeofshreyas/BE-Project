# ponytail self-check for messages.py's participant/relationship guards -- a
# caller must not be able to read or send into a conversation they're not
# part of, and a client must not be able to start a conversation with a
# lawyer_id they have no case with.
"""Tests for the messages domain: get-or-create conversation, and the participant guard
on reading/sending within a conversation."""
from unittest.mock import MagicMock, patch

import pytest
from fastapi import HTTPException

from app.middleware import auth
from app.controllers.messages import get_or_create_conversation, get_conversation, send_message
from app.models.messages import ConversationCreate


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
            send_message(1, body="hi", profile=profile)
            assert False, "expected HTTPException"
        except HTTPException as e:
            assert e.status_code == 403


def test_send_message_removes_attachment_when_message_insert_fails():
    """Verifies an uploaded attachment is removed if inserting the message row fails, so
    message send cannot leave an unreferenced storage object behind. Exercises:
    `POST /messages/conversations/{id}/messages` (`messages.send_message()`)."""
    profile = {"role_id": auth.LAWYER, "user_id": 2}
    row = {"id": 42, "client_id": 7, "lawyer_id": 3, "clients": None, "lawyers": None}
    file = MagicMock()
    file.filename = "reply.pdf"
    file.content_type = "application/pdf"
    file.file.read.return_value = b"%PDF-1.4 test"

    fake = MagicMock()
    tables: dict[str, MagicMock] = {}

    def table(name):
        if name in tables:
            return tables[name]
        m = MagicMock()
        if name == "conversations":
            m.select.return_value.eq.return_value.execute.return_value.data = [row]
        elif name == "lawyers":
            m.select.return_value.eq.return_value.execute.return_value.data = [{"lawyer_id": 3}]
        elif name == "messages":
            m.insert.return_value.execute.side_effect = RuntimeError("db insert failed")
        tables[name] = m
        return m

    fake.table.side_effect = table
    storage = fake.storage.from_.return_value

    with patch("app.controllers.messages.supabase", fake):
        with pytest.raises(RuntimeError):
            send_message(42, body="", file=file, profile=profile)

    uploaded_path = storage.upload.call_args.args[0]
    assert uploaded_path.startswith("conversation-42/")
    storage.remove.assert_called_once_with([uploaded_path])


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


def _fake_supabase_for_get_or_create_with_org(client_id=7, cases=None, case_lawyers=None, conversations=None, lawyer_org_id=1, suspended_org_ids=None):
    fake = MagicMock()
    tables: dict[str, MagicMock] = {}
    cases = [{"case_id": 10}] if cases is None else cases
    case_lawyers = [{"lawyer_id": 5}] if case_lawyers is None else case_lawyers
    conversations = [] if conversations is None else conversations
    suspended_org_ids = set() if suspended_org_ids is None else suspended_org_ids

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
            # ponytail: refetch-by-id after insert only ever chains a single .eq(), a
            # different mock attribute path than the double-.eq() lookup above -- both need
            # stubbing since get_or_create_conversation's insert branch hits this one.
            m.select.return_value.eq.return_value.execute.return_value.data = [{"id": 42}]
            m.insert.return_value.execute.return_value.data = [{"id": 42}]
        elif name == "lawyers":
            m.select.return_value.eq.return_value.execute.return_value.data = [{"user_id": 99, "users": {"org_id": lawyer_org_id}}]
        elif name == "org_clients":
            is_suspended = lawyer_org_id in suspended_org_ids
            m.select.return_value.eq.return_value.eq.return_value.execute.return_value.data = [{"is_active": False}] if is_suspended else []
        tables[name] = m
        return m

    fake.table.side_effect = table
    return fake


def test_get_or_create_rejects_suspended_client():
    """Verifies a client suspended by the target lawyer's org can't start a new conversation
    with that lawyer, even though they share a case. Exercises: `POST /messages/conversations`
    (`messages.get_or_create_conversation()`)."""
    profile = {"role_id": auth.CLIENT, "user_id": 1}
    fake = _fake_supabase_for_get_or_create_with_org(lawyer_org_id=1, suspended_org_ids={1})
    with patch("app.controllers.messages.supabase", fake):
        try:
            get_or_create_conversation(ConversationCreate(other_party_id=5), profile)
            assert False, "expected HTTPException"
        except HTTPException as e:
            assert e.status_code == 403


def test_get_or_create_allows_client_not_suspended_by_this_org():
    """Verifies a client suspended by some other org can still message a lawyer whose own
    org hasn't suspended them. Exercises: `POST /messages/conversations`
    (`messages.get_or_create_conversation()`)."""
    profile = {"role_id": auth.CLIENT, "user_id": 1}
    fake = _fake_supabase_for_get_or_create_with_org(lawyer_org_id=1, suspended_org_ids={99})
    with patch("app.controllers.messages.supabase", fake):
        result = get_or_create_conversation(ConversationCreate(other_party_id=5), profile)
        assert result["id"] == 42


def test_get_conversation_rejects_suspended_client():
    """Verifies a client can no longer read an existing conversation with a lawyer whose org
    has since suspended them. Exercises: `GET /messages/conversations/{id}`
    (`messages.get_conversation()`)."""
    profile = {"role_id": auth.CLIENT, "user_id": 1}
    row = {
        "id": 42, "client_id": 7, "lawyer_id": 5,
        "clients": {"users": {"full_name": "Test Client"}},
        "lawyers": {"users": {"full_name": "Adv. Meera Kulkarni"}},
    }
    fake = MagicMock()
    tables: dict[str, MagicMock] = {}

    def table(name):
        if name in tables:
            return tables[name]
        m = MagicMock()
        if name == "clients":
            m.select.return_value.eq.return_value.execute.return_value.data = [{"client_id": 7}]
        elif name == "conversations":
            m.select.return_value.eq.return_value.execute.return_value.data = [row]
        elif name == "lawyers":
            m.select.return_value.eq.return_value.execute.return_value.data = [{"user_id": 99, "users": {"org_id": 1}}]
        elif name == "org_clients":
            m.select.return_value.eq.return_value.eq.return_value.execute.return_value.data = [{"is_active": False}]
        tables[name] = m
        return m

    fake.table.side_effect = table
    with patch("app.controllers.messages.supabase", fake):
        try:
            get_conversation(42, profile)
            assert False, "expected HTTPException"
        except HTTPException as e:
            assert e.status_code == 403


def test_list_conversations_excludes_a_suspended_firms_lawyer():
    """Verifies a conversation with a lawyer whose org has since suspended the client drops
    out of the client's own conversation list. Exercises: `GET /messages/conversations`
    (`messages.list_conversations()`)."""
    from app.controllers.messages import list_conversations

    profile = {"role_id": auth.CLIENT, "user_id": 1}
    kept_row = {
        "id": 1, "client_id": 7, "lawyer_id": 5, "client_last_read_at": None, "lawyer_last_read_at": None,
        "clients": {"users": {"full_name": "Test Client"}}, "lawyers": {"users": {"full_name": "Not Suspended"}},
    }
    dropped_row = {
        "id": 2, "client_id": 7, "lawyer_id": 6, "client_last_read_at": None, "lawyer_last_read_at": None,
        "clients": {"users": {"full_name": "Test Client"}}, "lawyers": {"users": {"full_name": "Suspended Firm Lawyer"}},
    }
    fake = MagicMock()
    tables: dict[str, MagicMock] = {}

    def table(name):
        if name in tables:
            return tables[name]
        m = MagicMock()
        if name == "clients":
            m.select.return_value.eq.return_value.execute.return_value.data = [{"client_id": 7}]
        elif name == "conversations":
            m.select.return_value.eq.return_value.execute.return_value.data = [kept_row, dropped_row]
        elif name == "lawyers":
            def select(*args, **kwargs):
                sel = MagicMock()
                # lawyer_id 5 -> org 1 (not suspended), lawyer_id 6 -> org 2 (suspended) --
                # distinguish by which .eq("lawyer_id", ...) call this is.
                def eq(field, value):
                    e = MagicMock()
                    org_id = 1 if value == 5 else 2
                    e.execute.return_value.data = [{"user_id": 90 + value, "users": {"org_id": org_id}}]
                    return e
                sel.eq.side_effect = eq
                return sel
            m.select.side_effect = select
        elif name == "org_clients":
            def select(*args, **kwargs):
                sel = MagicMock()
                def eq(field, value):
                    e = MagicMock()
                    e.eq.return_value.execute.return_value.data = [{"is_active": False}] if value == 2 else []
                    return e
                sel.eq.side_effect = eq
                return sel
            m.select.side_effect = select
        elif name == "messages":
            m.select.return_value.eq.return_value.order.return_value.limit.return_value.execute.return_value.data = []
            m.select.return_value.eq.return_value.neq.return_value.execute.return_value.count = 0
        tables[name] = m
        return m

    fake.table.side_effect = table
    with patch("app.controllers.messages.supabase", fake):
        result = list_conversations(profile)
    assert [c["id"] for c in result] == [1]


if __name__ == "__main__":
    test_get_or_create_returns_existing_conversation_without_inserting()
    test_get_or_create_rejects_client_with_no_case_with_lawyer()
    test_get_conversation_rejects_non_participant()
    test_send_message_rejects_non_participant()
    test_get_or_create_conversation_lawyer_path()
    test_get_or_create_rejects_suspended_client()
    test_get_or_create_allows_client_not_suspended_by_this_org()
    test_get_conversation_rejects_suspended_client()
    test_list_conversations_excludes_a_suspended_firms_lawyer()
    print("ok")
