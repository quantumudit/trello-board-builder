"""
Tests for utils/input_loader.py -- card loading and normalisation logic.
"""

from __future__ import annotations

import json
from pathlib import Path
from unittest.mock import MagicMock

import pytest

from shared.exceptions import AppException
from utils.input_loader import _normalise, load_cards


def _make_config(path: Path) -> MagicMock:
    cfg = MagicMock()
    cfg.input_file_path = path
    return cfg


class TestNormalise:
    def test_full_card(self) -> None:
        item = {
            "list_name": "To Do",
            "card_title": "Write tests",
            "description": "Add unit tests.",
            "labels": ["High"],
            "due_date": "2025-08-01",
            "checklist": {"title": "Steps", "items": ["Step 1", "Step 2"]},
        }
        result = _normalise(item)
        assert result["list_name"] == "To Do"
        assert result["card_title"] == "Write tests"
        assert result["description"] == "Add unit tests."
        assert result["labels"] == ["High"]
        assert result["due_date"] == "2025-08-01"
        assert result["checklist"] == {"title": "Steps", "items": ["Step 1", "Step 2"]}

    def test_minimal_card_defaults_optional_fields(self) -> None:
        result = _normalise({"list_name": "Backlog", "card_title": "Do something"})
        assert result["description"] == ""
        assert result["labels"] == []
        assert result["due_date"] is None
        assert result["checklist"] is None

    def test_strips_whitespace_from_list_name_and_title(self) -> None:
        result = _normalise({"list_name": "  To Do  ", "card_title": "  A task  "})
        assert result["list_name"] == "To Do"
        assert result["card_title"] == "A task"

    def test_null_checklist_becomes_none(self) -> None:
        result = _normalise(
            {"list_name": "Done", "card_title": "Task", "checklist": None}
        )
        assert result["checklist"] is None

    def test_checklist_defaults_title_when_absent(self) -> None:
        result = _normalise(
            {
                "list_name": "To Do",
                "card_title": "Task",
                "checklist": {"items": ["a", "b"]},
            }
        )
        assert result["checklist"]["title"] == "Tasks"
        assert result["checklist"]["items"] == ["a", "b"]

    def test_null_due_date_becomes_none(self) -> None:
        result = _normalise(
            {"list_name": "To Do", "card_title": "Task", "due_date": None}
        )
        assert result["due_date"] is None


class TestLoadCards:
    def test_loads_cards_and_skips_comment_and_rules(self, tmp_path: Path) -> None:
        data = [
            {"_comment": "ignore me"},
            {"_rules": {"list_name": "required"}},
            {"list_name": "Backlog", "card_title": "Real card"},
        ]
        path = tmp_path / "cards.json"
        path.write_text(json.dumps(data), encoding="utf-8")
        cards = load_cards(_make_config(path))
        assert len(cards) == 1
        assert cards[0]["card_title"] == "Real card"

    def test_raises_when_file_not_found(self, tmp_path: Path) -> None:
        with pytest.raises(AppException) as exc_info:
            load_cards(_make_config(tmp_path / "missing.json"))
        assert "Input file not found" in exc_info.value.args[0]

    def test_raises_when_root_is_not_array(self, tmp_path: Path) -> None:
        path = tmp_path / "cards.json"
        path.write_text(json.dumps({"list_name": "To Do"}), encoding="utf-8")
        with pytest.raises(AppException, match="top-level array"):
            load_cards(_make_config(path))

    def test_empty_array_returns_empty_list(self, tmp_path: Path) -> None:
        path = tmp_path / "cards.json"
        path.write_text("[]", encoding="utf-8")
        assert load_cards(_make_config(path)) == []

    def test_all_skipped_returns_empty_list(self, tmp_path: Path) -> None:
        data = [{"_comment": "skip"}, {"_rules": {}}]
        path = tmp_path / "cards.json"
        path.write_text(json.dumps(data), encoding="utf-8")
        assert load_cards(_make_config(path)) == []
