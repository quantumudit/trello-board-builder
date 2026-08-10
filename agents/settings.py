"""
Pydantic-settings model for the AI agents package.
Covers Azure OpenAI secrets needed by the LangGraph + LiteLLM integration.
"""

from __future__ import annotations

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class AgentSettings(BaseSettings):
    """Validated settings for the agents package, loaded from .env.

    All fields default to empty string -- values are ignored until the real
    LangGraph + LiteLLM + Azure OpenAI implementation replaces the stub.
    """

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")

    azure_openai_api_key: str = ""
    azure_openai_endpoint: str = ""
    azure_openai_deployment: str = ""
    azure_openai_api_version: str = ""


@lru_cache
def get_agent_settings() -> AgentSettings:
    """Return the cached AgentSettings singleton."""
    return AgentSettings()
