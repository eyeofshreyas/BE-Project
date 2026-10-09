# ponytail self-check for the judgment-vs-case mode routing fix on /ai/summarize --
# only "Court Order" (what the LoRA adapter was actually trained on) should get
# mode="judgment"; every other document_types entry, and pasted text with no
# document_id, must not have the judgment-only adapter forced onto them.
"""Tests for summarize.py's _mode_for() document-type-to-summarizer-mode mapping."""
from app.ml.summarize import _mode_for


def test_court_order_uses_judgment_mode():
    assert _mode_for("Court Order") == "judgment"


def test_other_document_types_use_case_mode():
    for type_name in ["Affidavit", "Contract", "Identity Proof", "Marriage Certificate"]:
        assert _mode_for(type_name) == "case"


def test_no_type_known_defaults_to_judgment():
    """Pasted text with no document_id has no type_name -- keeps the pre-existing default."""
    assert _mode_for(None) == "judgment"


if __name__ == "__main__":
    test_court_order_uses_judgment_mode()
    test_other_document_types_use_case_mode()
    test_no_type_known_defaults_to_judgment()
    print("ok")
