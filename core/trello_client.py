"""
Thin wrapper around the Trello REST API.
All HTTP calls go through here - nothing else touches requests directly.
Handles auth, rate limiting, and raises on non-2xx responses.
"""

from __future__ import annotations

import time
from typing import TYPE_CHECKING, Any

import requests

from shared.exceptions import AppException
from shared.logger import logger

if TYPE_CHECKING:
    from utils.config_loader import Config


class TrelloClient:
    """Thin HTTP client for the Trello REST API.

    Args:
        config: Project config supplying api_base_url, api_key, token,
            and rate_limit_delay.
    """

    def __init__(self, config: Config) -> None:
        self._base = config.api_base_url
        self._auth = {"key": config.api_key, "token": config.token}
        self._delay = config.rate_limit_delay
        logger.debug("TrelloClient initialised (base={})", self._base)

    def request(self, method: str, path: str, **kwargs: Any) -> Any:
        """Execute an authenticated HTTP request against the Trello API.

        Args:
            method: HTTP verb (GET, POST, PUT, DELETE).
            path: API path relative to the base URL (e.g. /boards/).
            **kwargs: Additional keyword arguments forwarded to requests.request.

        Returns:
            Parsed JSON response body.

        Raises:
            AppException: When the response status is not 2xx.
        """
        params = {**self._auth, **kwargs.pop("params", {})}
        url = f"{self._base}{path}"

        logger.debug("{} {}", method.upper(), path)

        resp = requests.request(method, url, params=params, **kwargs)
        time.sleep(self._delay)

        if not resp.ok:
            logger.error(
                "Trello API error {} - {} {}", resp.status_code, method.upper(), path
            )
            raise AppException(f"Trello API error {resp.status_code}: {resp.text}")

        return resp.json()

    def get(self, path: str, **params: Any) -> Any:
        """Send a GET request to path with params as query string arguments.

        Args:
            path: API path relative to the base URL.
            **params: Query string parameters merged with auth credentials.

        Returns:
            Parsed JSON response body.
        """
        return self.request("GET", path, params=params)

    def post(self, path: str, **params: Any) -> Any:
        """Send a POST request to path with params as query string arguments.

        Args:
            path: API path relative to the base URL.
            **params: Query string parameters merged with auth credentials.

        Returns:
            Parsed JSON response body.
        """
        return self.request("POST", path, params=params)

    def put(self, path: str, **params: Any) -> Any:
        """Send a PUT request to path with params as query string arguments.

        Args:
            path: API path relative to the base URL.
            **params: Query string parameters merged with auth credentials.

        Returns:
            Parsed JSON response body.
        """
        return self.request("PUT", path, params=params)

    def delete(self, path: str, **params: Any) -> Any:
        """Send a DELETE request to path with params as query string arguments.

        Args:
            path: API path relative to the base URL.
            **params: Query string parameters merged with auth credentials.

        Returns:
            Parsed JSON response body.
        """
        return self.request("DELETE", path, params=params)
