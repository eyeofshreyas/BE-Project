"""Tests for adding judges via the reference-data endpoint."""
from unittest.mock import MagicMock, patch

import pytest
from fastapi import HTTPException

from app.middleware import auth
from app.controllers import reference
from app.models.reference import JudgeCreate


def _fake_supabase(clash_data, full_row=None, inserted_row=None):
    fake = MagicMock()
    table = fake.table.return_value
    sel_eq = table.select.return_value.eq.return_value
    sel_eq.eq.return_value.execute.return_value.data = clash_data  # duplicate check (2 eq's)
    sel_eq.execute.return_value.data = [full_row] if full_row else []  # reload after insert (1 eq)
    table.insert.return_value.execute.return_value.data = [inserted_row] if inserted_row else []
    return fake


def test_create_judge_rejects_duplicate_at_same_court():
    """Verifies a judge with the same name at the same court is refused with 409.
    Exercises: `POST /reference/judges` (`reference.create_judge()`)."""
    with patch("app.controllers.reference.supabase", _fake_supabase([{"judge_id": 5}])):
        with pytest.raises(HTTPException) as exc:
            reference.create_judge(
                JudgeCreate(judge_name="Justice A. Rangarajan", court_id=1),
                profile={"user_id": 1, "role_id": auth.LAWYER},
            )
        assert exc.value.status_code == 409


def test_create_judge_inserts_and_returns_shaped_row():
    """Verifies a new judge is inserted and returned joined with its court name.
    Exercises: `POST /reference/judges` (`reference.create_judge()`)."""
    full_row = {
        "judge_id": 9, "judge_name": "Justice S. Iyer", "designation": "Judge",
        "court_id": 2, "courts": {"court_name": "High Court of Karnataka"},
    }
    with patch("app.controllers.reference.supabase", _fake_supabase([], full_row, {"judge_id": 9})):
        result = reference.create_judge(
            JudgeCreate(judge_name="Justice S. Iyer", court_id=2, designation="Judge"),
            profile={"user_id": 1, "role_id": auth.LAWYER},
        )
    assert result == {
        "judge_id": 9, "judge_name": "Justice S. Iyer", "designation": "Judge",
        "court_id": 2, "court_name": "High Court of Karnataka",
    }


if __name__ == "__main__":
    test_create_judge_rejects_duplicate_at_same_court()
    test_create_judge_inserts_and_returns_shaped_row()
    print("ok")
