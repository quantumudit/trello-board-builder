"""
Pydantic-settings model for Trello and application secrets.
Provides type-safe, validated env loading as an alternative to os.getenv calls.
"""

from __future__ import annotations

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class BackendSettings(BaseSettings):
    """Validated settings for the backend, loaded from .env.

    All fields default to empty string so the server starts without secrets
    (credentials can be supplied per-request via the web form).
    """

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")

    trello_api_key: str = ""
    trello_token: str = ""


@lru_cache
def get_backend_settings() -> BackendSettings:
    """Return the cached BackendSettings singleton."""
    return BackendSettings()
