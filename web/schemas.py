"""
Pydantic models for all web API request and response payloads.
"""

from __future__ import annotations

from typing import Any

from pydantic import BaseModel, field_validator

_VALID_TRELLO_COLORS = {
    "green",
    "yellow",
    "orange",
    "red",
    "purple",
    "blue",
    "sky",
    "lime",
    "pink",
    "black",
}

_VALID_PERMISSIONS = {"private", "org", "public"}


class InferredLabel(BaseModel):
    """A label name extracted from the uploaded JSON with its default Trello color."""

    name: str
    default_color: str


class ValidateResponse(BaseModel):
    """Response from POST /api/validate-json."""

    valid: bool
    card_count: int
    labels: list[InferredLabel]
    lists: list[str]
    error: str | None = None


class LabelOverride(BaseModel):
    """A label name paired with the user-chosen Trello color."""

    name: str
    color: str

    @field_validator("color")
    @classmethod
    def color_must_be_valid(cls, v: str) -> str:
        """Validate that the color is one of the 10 supported Trello color names.

        Args:
            v: The color value to validate.

        Returns:
            The validated color string.

        Raises:
            ValueError: When the color is not a valid Trello color.
        """
        if v not in _VALID_TRELLO_COLORS:
            raise ValueError(
                f"'{v}' is not a valid Trello color. "
                f"Choose from: {sorted(_VALID_TRELLO_COLORS)}"
            )
        return v


class RunConfig(BaseModel):
    """Full configuration submitted by the user to trigger a board build."""

    api_key: str
    token: str
    board_name: str
    board_description: str = ""
    permission_level: str = "private"
    create_if_not_exists: bool = True
    lists: list[str]
    labels: list[LabelOverride]
    cards: list[dict[str, Any]]

    @field_validator("permission_level")
    @classmethod
    def permission_must_be_valid(cls, v: str) -> str:
        """Validate the board permission level.

        Args:
            v: The permission level string.

        Returns:
            The validated permission level.

        Raises:
            ValueError: When the value is not private, org, or public.
        """
        if v not in _VALID_PERMISSIONS:
            raise ValueError(f"permission_level must be one of {_VALID_PERMISSIONS}")
        return v

    @field_validator("board_name")
    @classmethod
    def board_name_not_empty(cls, v: str) -> str:
        """Validate that board_name is not blank.

        Args:
            v: The board name string.

        Returns:
            The stripped board name.

        Raises:
            ValueError: When the board name is empty or whitespace-only.
        """
        if not v.strip():
            raise ValueError("board_name must not be empty")
        return v.strip()

    @field_validator("api_key", "token")
    @classmethod
    def credential_not_empty(cls, v: str) -> str:
        """Validate that API credentials are not blank.

        Args:
            v: The credential string.

        Returns:
            The stripped credential value.

        Raises:
            ValueError: When the credential is empty or whitespace-only.
        """
        if not v.strip():
            raise ValueError("api_key and token must not be empty")
        return v.strip()


class BuildStarted(BaseModel):
    """Response from POST /api/build when the pipeline starts successfully."""

    job_id: str
    message: str


class JobDoneEvent(BaseModel):
    """Payload of the SSE 'done' event."""

    status: str
    board_url: str | None = None
    message: str | None = None


class GeminiBoardRequest(BaseModel):
    """Request body for POST /api/gemini/generate-board."""

    cards: list[dict[str, Any]]
    lists: list[str]


class GeminiBoardResponse(BaseModel):
    """Response from POST /api/gemini/generate-board."""

    board_name: str
    board_description: str


class GeminiRefactorRequest(BaseModel):
    """Request body for POST /api/gemini/refactor-description."""

    description: str


class GeminiRefactorResponse(BaseModel):
    """Response from POST /api/gemini/refactor-description."""

    refactored: str
