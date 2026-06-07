"""
Manages board-level Trello operations: find or create a board, set up lists,
and create labels. Returns lookup dicts (list_ids, label_ids) for CardBuilder.
"""

from __future__ import annotations

from typing import TYPE_CHECKING

from shared.exceptions import AppException
from shared.logger import logger

if TYPE_CHECKING:
    from core.trello_client import TrelloClient
    from utils.config_loader import Config


class BoardManager:
    """Manages Trello board setup: board creation, lists, and labels.

    Args:
        client: Authenticated TrelloClient instance.
        config: Project config supplying board name, lists, and labels.

    Attributes:
        board_id: Trello ID of the active board after setup() is called.
        list_ids: Mapping of list name to Trello list ID.
        label_ids: Mapping of label name to Trello label ID.
    """

    def __init__(self, client: TrelloClient, config: Config) -> None:
        self._client = client
        self._config = config
        self.board_id: str = ""
        self.list_ids: dict[str, str] = {}
        self.label_ids: dict[str, str] = {}

    def setup(self) -> None:
        """Find or create the board and populate list_ids and label_ids.

        Raises:
            AppException: When the board does not exist and
                create_if_not_exists is false.
        """
        self.board_id = self._get_or_create_board()
        self.list_ids = self._setup_lists()
        self.label_ids = self._setup_labels()
        logger.success("Board setup complete (id={})", self.board_id)

    # --- Board --------------------------------------------------------

    def _get_or_create_board(self) -> str:
        """Find an existing open board by name or create a new one."""
        name = self._config.board_name
        logger.info("Looking for board: {}", name)

        boards = self._client.get("/members/me/boards", fields="name,id,closed")
        existing = {b["name"]: b["id"] for b in boards if not b.get("closed")}

        if name in existing:
            board_id = existing[name]
            logger.info("Found existing board '{}' (id={})", name, board_id)
            return board_id

        if not self._config.create_if_not_exists:
            raise AppException(
                f"Board '{name}' not found and create_if_not_exists is false."
            )

        logger.info("Board not found - creating: {}", name)
        board = self._client.post(
            "/boards/",
            name=name,
            desc=self._config.board_description,
            defaultLists="false",
            **{"prefs_permissionLevel": self._config.board_permission},
        )
        logger.success("Created board '{}' (id={})", name, board["id"])
        return board["id"]

    # --- Lists --------------------------------------------------------

    def _setup_lists(self) -> dict[str, str]:
        """Create any missing lists and return a name-to-id mapping."""
        existing_lists = self._client.get(
            f"/boards/{self.board_id}/lists", fields="name,id"
        )
        existing = {lst["name"]: lst["id"] for lst in existing_lists}

        list_ids: dict[str, str] = {}
        for pos, list_name in enumerate(self._config.lists, start=1):
            if list_name in existing:
                list_ids[list_name] = existing[list_name]
                logger.debug("Reusing existing list: {}", list_name)
            else:
                lst = self._client.post(
                    "/lists",
                    name=list_name,
                    idBoard=self.board_id,
                    pos=pos * 1000,
                )
                list_ids[list_name] = lst["id"]
                logger.debug("Created list: {} (id={})", list_name, lst["id"])

        return list_ids

    # --- Labels -------------------------------------------------------

    def _setup_labels(self) -> dict[str, str]:
        """Create any missing labels and return a name-to-id mapping."""
        existing_labels = self._client.get(
            f"/boards/{self.board_id}/labels", fields="name,id,color"
        )
        existing = {
            lbl["name"]: lbl["id"] for lbl in existing_labels if lbl.get("name")
        }

        label_ids: dict[str, str] = {}
        for label_cfg in self._config.labels:
            name = label_cfg["name"]
            color = label_cfg.get("color", "null")

            if name in existing:
                label_ids[name] = existing[name]
                logger.debug("Reusing existing label: {}", name)
            else:
                lbl = self._client.post(
                    "/labels",
                    name=name,
                    color=color,
                    idBoard=self.board_id,
                )
                label_ids[name] = lbl["id"]
                logger.debug("Created label: {} (id={})", name, lbl["id"])

        return label_ids
