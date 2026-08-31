# ponytail self-check for list_clients -- a lawyer must only see clients
# from their own actively-assigned cases, not the whole firm's roster.
from unittest.mock import MagicMock, patch

from app.middleware import auth
from app.controllers.clients import list_clients


def _fake_supabase(lawyer_id: int, case_ids: list[int], case_rows: list[dict], client_rows: list[dict], status_rows: list[dict]):
    fake = MagicMock()
    tables: dict[str, MagicMock] = {}

    def table(name):
        if name in tables:
            return tables[name]
        m = MagicMock()
        if name == "lawyers":
            m.select.return_value.eq.return_value.execute.return_value.data = [{"lawyer_id": lawyer_id}]
        elif name == "case_lawyers":
            m.select.return_value.eq.return_value.eq.return_value.execute.return_value.data = [{"case_id": cid} for cid in case_ids]
        elif name == "cases":
            m.select.return_value.in_.return_value.execute.return_value.data = case_rows
        elif name == "clients":
            m.select.return_value.in_.return_value.execute.return_value.data = client_rows
        elif name == "invoices":
            m.select.return_value.in_.return_value.execute.return_value.data = []
        tables[name] = m
        return m

    fake.table.side_effect = table
    return fake


def test_lawyer_with_no_cases_sees_no_clients():
    profile = {"role_id": auth.LAWYER, "user_id": 1}
    fake = _fake_supabase(5, [], [], [], [])
    with patch("app.controllers.clients.supabase", fake):
        assert list_clients(profile) == []


def test_lawyer_sees_only_their_clients_with_active_case_counts():
    profile = {"role_id": auth.LAWYER, "user_id": 1}
    client_row = {
        "client_id": 7, "address": "1 Main St", "preferred_language": "English",
        "users": {"full_name": "Test Client", "email": "c@example.com", "phone": "123"},
    }
    fake = _fake_supabase(
        lawyer_id=5,
        case_ids=[10],
        case_rows=[{"client_id": 7}],
        client_rows=[client_row],
        status_rows=[],
    )
    # second .table("cases") call (status lookup) returns different data than the first --
    # patch its select().in_() chain to a fresh mock keyed by call count.
    call_count = {"n": 0}
    orig_cases_table = fake.table.side_effect

    def table(name):
        if name == "cases":
            call_count["n"] += 1
            m = MagicMock()
            if call_count["n"] == 1:
                m.select.return_value.in_.return_value.execute.return_value.data = [{"client_id": 7}]
            else:
                m.select.return_value.in_.return_value.execute.return_value.data = [
                    {"case_id": 100, "client_id": 7, "status": "Open"},
                    {"case_id": 101, "client_id": 7, "status": "Closed"},
                ]
            return m
        if name == "invoices":
            m = MagicMock()
            m.select.return_value.in_.return_value.execute.return_value.data = [
                {"case_id": 100, "total_amount": 5000, "payment_status": "Pending"},
                {"case_id": 101, "total_amount": 2000, "payment_status": "Paid"},
            ]
            return m
        return orig_cases_table(name)

    fake.table.side_effect = table

    with patch("app.controllers.clients.supabase", fake):
        result = list_clients(profile)
        assert len(result) == 1
        assert result[0]["id"] == 7
        assert result[0]["full_name"] == "Test Client"
        assert result[0]["active_cases"] == 1
        assert result[0]["status"] == "Active"
        assert result[0]["pending_amount"] == 5000


if __name__ == "__main__":
    test_lawyer_with_no_cases_sees_no_clients()
    test_lawyer_sees_only_their_clients_with_active_case_counts()
    print("ok")
