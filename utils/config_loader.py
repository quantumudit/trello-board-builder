"""
Loads config/settings.yaml and .env into a structured Config object.
All other modules import from here - single source of truth for config.
"""

from __future__ import annotations

import os
from pathlib import Path
from typing import Any

import yaml
from dotenv import load_dotenv

from shared.exceptions import AppException
from shared.logger import logger


class Config:
    """Loads and exposes project configuration from a YAML file and a .env secrets file.

    Args:
        yaml_path: Path to the YAML config file. Defaults to config/settings.yaml.
        env_path: Path to the .env secrets file. Defaults to .env.
    """

    def __init__(
        self,
        yaml_path: str = "config/settings.yaml",
        env_path: str = ".env",
    ) -> None:
        self._yaml_path = Path(yaml_path)
        self._env_path = Path(env_path)
        self._data: dict[str, Any] = {}
        self._load()

    def _load(self) -> None:
        """Load config from the YAML file and secrets from the .env file."""
        load_dotenv(dotenv_path=self._env_path)

        if not self._yaml_path.exists():
            raise AppException(f"Config file not found: {self._yaml_path}")

        with self._yaml_path.open(encoding="utf-8") as f:
            self._data = yaml.safe_load(f) or {}

        logger.debug("Config loaded from {}", self._yaml_path)

    # --- Trello API -----------------------------------------------

    @property
    def api_key(self) -> str:
        """Return the Trello API key from the TRELLO_API_KEY environment variable.

        Raises:
            AppException: When TRELLO_API_KEY is not set in .env.
        """
        val = os.getenv("TRELLO_API_KEY", "")
        if not val:
            raise AppException("TRELLO_API_KEY not set in .env")
        return val

    @property
    def token(self) -> str:
        """Return the Trello token from the TRELLO_TOKEN environment variable.

        Raises:
            AppException: When TRELLO_TOKEN is not set in .env.
        """
        val = os.getenv("TRELLO_TOKEN", "")
        if not val:
            raise AppException("TRELLO_TOKEN not set in .env")
        return val

    @property
    def api_base_url(self) -> str:
        """Return the Trello REST API base URL."""
        return self._data.get("trello", {}).get(
            "api_base_url", "https://api.trello.com/1"
        )

    @property
    def rate_limit_delay(self) -> float:
        """Return the delay in seconds inserted between consecutive API calls."""
        return float(self._data.get("trello", {}).get("rate_limit_delay_seconds", 0.15))

    # --- Board ----------------------------------------------------

    @property
    def board_name(self) -> str:
        """Return the board title shown in Trello."""
        return self._data["board"]["name"]

    @property
    def board_description(self) -> str:
        """Return the board description, or an empty string if not set."""
        return self._data["board"].get("description", "")

    @property
    def board_permission(self) -> str:
        """Return the board permission level (private, org, or public)."""
        return self._data["board"].get("permission_level", "private")

    @property
    def create_if_not_exists(self) -> bool:
        """Return whether to create the board when it does not already exist."""
        return bool(self._data["board"].get("create_if_not_exists", True))

    # --- Lists / Labels -------------------------------------------

    @property
    def lists(self) -> list[str]:
        """Return the ordered list of column names to create on the board."""
        return self._data.get("lists", [])

    @property
    def labels(self) -> list[dict[str, str]]:
        """Return the list of label config dicts, each with name and color keys."""
        return self._data.get("labels", [])

    # --- Input ----------------------------------------------------

    @property
    def input_file_path(self) -> Path:
        """Return the path to the JSON input file containing card definitions."""
        return Path(self._data["input"]["file_path"])

    def raw(self) -> dict[str, Any]:
        """Return the raw parsed YAML data as a plain dict."""
        return self._data
