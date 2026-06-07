"""
Creates Trello cards and their checklists from normalised card dicts.
Depends on BoardManager having already populated list_ids and label_ids.
"""

from __future__ import annotations

from typing import TYPE_CHECKING

from shared.exceptions import AppException
from shared.logger import logger

if TYPE_CHECKING:
    from core.board_manager import BoardManager
    from core.trello_client import TrelloClient


class CardBuilder:
    """Creates Trello cards and checklists from normalised card dicts.

    Args:
        client: Authenticated TrelloClient instance.
        board_manager: Configured BoardManager with populated list_ids and label_ids.
    """

    def __init__(self, client: TrelloClient, board_manager: BoardManager) -> None:
        self._client = client
        self._bm = board_manager

    def build_all(self, cards: list[dict]) -> None:
        """Create all cards and their checklists on the Trello board.

        Args:
            cards: List of normalised card dicts from input_loader.load_cards.

        Raises:
            AppException: When a card's list_name is not found in
                board_manager.list_ids.
        """
        total = len(cards)
        for i, card in enumerate(cards, start=1):
            logger.info("Creating card {}/{}: {}", i, total, card["card_title"])
            card_id = self._create_card(card)
            if card.get("checklist"):
                self._create_checklist(card_id, card["checklist"])

    # --- Card ---------------------------------------------------------

    def _create_card(self, card: dict) -> str:
        """Create a single Trello card and return its ID."""
        list_name = card["list_name"]
        list_id = self._bm.list_ids.get(list_name)

        if not list_id:
            raise AppException(
                f"List '{list_name}' not found. Check settings.yaml -> lists."
            )

        label_ids = []
        for label_name in card.get("labels", []):
            lid = self._bm.label_ids.get(label_name)
            if lid:
                label_ids.append(lid)
            else:
                logger.warning("Label '{}' not found in config - skipping.", label_name)

        params: dict = {
            "name": card["card_title"],
            "idList": list_id,
            "desc": card.get("description", ""),
        }
        if label_ids:
            params["idLabels"] = ",".join(label_ids)
        if card.get("due_date"):
            params["due"] = f"{card['due_date']}T23:59:00.000Z"

        result = self._client.post("/cards", **params)
        card_id = result["id"]
        logger.debug("Created card '{}' (id={})", card["card_title"], card_id)
        return card_id

    # --- Checklist ----------------------------------------------------

    def _create_checklist(self, card_id: str, checklist: dict) -> None:
        """Create a checklist with its items on the specified card."""
        title = checklist.get("title", "Tasks")
        items = checklist.get("items", [])

        if not items:
            return

        cl = self._client.post("/checklists", idCard=card_id, name=title)
        cl_id = cl["id"]

        for item in items:
            self._client.post(f"/checklists/{cl_id}/checkItems", name=item)

        logger.debug(
            "Created checklist '{}' with {} items on card {}",
            title,
            len(items),
            card_id,
        )
