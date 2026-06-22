"""
Stub AI service for board name generation and description refactoring.
This module will be replaced with a LangGraph + LiteLLM + Azure OpenAI
implementation in a future session. All methods return placeholder responses.
"""

from __future__ import annotations

from shared.logger import logger


class GeminiService:
    """Stub AI service that returns placeholder responses without calling any API.

    The real implementation will use LangGraph + LiteLLM + Azure OpenAI.
    Constructor accepts api_key to preserve the existing call signature in app.py.

    Args:
        api_key: Ignored -- no external API is called in this stub.
    """

    def __init__(self, api_key: str) -> None:
        pass

    def generate_board(self, cards: list[dict], lists: list[str]) -> dict[str, str]:
        """Return a placeholder board name and description.

        Args:
            cards: Raw card dicts from the uploaded JSON (unused in stub).
            lists: Column names for the board (unused in stub).

        Returns:
            Dict with placeholder board_name and board_description.
        """
        logger.info("AI generate-board called (stub -- real AI backend pending)")
        return {
            "board_name": "Project Board",
            "board_description": (
                "AI-generated board details coming soon. "
                "Edit the name and description above."
            ),
        }

    def refactor_description(self, description: str) -> str:
        """Return the description unchanged as a stub response.

        Args:
            description: The original description text.

        Returns:
            The original description unchanged.
        """
        logger.info("AI refactor-description called (stub -- real AI backend pending)")
        return description
