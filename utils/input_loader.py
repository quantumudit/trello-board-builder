"""
Loads cards from a JSON input file and returns normalised card dicts.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import TYPE_CHECKING

from shared.exceptions import AppException
from shared.logger import logger

if TYPE_CHECKING:
    from utils.config_loader import Config


def load_cards(config: Config) -> list[dict]:
    """Load and normalise card definitions from the JSON input file.

    Args:
        config: Project config used to resolve the input file path.

    Returns:
        List of normalised card dicts, excluding comment and rule objects.

    Raises:
        AppException: When the input file is missing or the root is not a JSON array.
    """
    path = Path(config.input_file_path)
    logger.info("Loading cards from {}", path)

    try:
        with path.open(encoding="utf-8") as f:
            raw = json.load(f)
    except FileNotFoundError as e:
        logger.error("Input file not found: {}", path)
        raise AppException(f"Input file not found: {path}", original=e) from e

    if not isinstance(raw, list):
        raise AppException("JSON input must be a top-level array of card objects.")

    cards = [
        _normalise(item)
        for item in raw
        if "_comment" not in item and "_rules" not in item
    ]

    logger.success("Loaded {} cards", len(cards))
    return cards


def _normalise(item: dict) -> dict:
    """Return a normalised card dict with all optional fields defaulted."""
    checklist_raw = item.get("checklist")
    checklist = None
    if checklist_raw and isinstance(checklist_raw, dict):
        checklist = {
            "title": checklist_raw.get("title", "Tasks"),
            "items": checklist_raw.get("items", []),
        }

    return {
        "list_name": item.get("list_name", "").strip(),
        "card_title": item.get("card_title", "").strip(),
        "description": item.get("description", "").strip(),
        "labels": item.get("labels", []),
        "due_date": item.get("due_date") or None,
        "checklist": checklist,
    }
