"""
Gemini AI service for generating board details and refactoring descriptions.
Wraps the google-genai SDK with project-standard error handling.
"""

from __future__ import annotations

import json
import re

from google import genai

from shared.exceptions import AppException
from shared.logger import logger

_MODEL = "gemini-2.0-flash"

_GENERATE_PROMPT = """\
You are a project manager expert. I have the following board columns: [{lists}].
Here are some of the cards that will go onto this board:
{cards_summary}

Based on this information, suggest a fitting, professional Trello Board Name \
(short, concise) and a Trello Board Description (1-2 sentences summarizing the \
goals and workflow of the board).

Return your response in standard JSON format. The JSON block should contain \
exactly two keys: "board_name" and "board_description". Do not add any markdown \
block wrapping around it (like ```json). Just output raw JSON content.\
"""

_REFACTOR_PROMPT = """\
Refactor the following Trello board description to make it professional, engaging, \
and clear. Format it nicely with bullet points or brief sections if appropriate, \
but keep it concise:

"{description}"\
"""


class GeminiService:
    """Wraps the Gemini AI model for board name generation and description refactoring.

    If api_key is empty at construction time, all methods raise AppException
    with a "GEMINI_API_KEY not configured" message instead of calling the SDK.

    Args:
        api_key: Gemini API key read from the environment.
    """

    def __init__(self, api_key: str) -> None:
        self._ready = bool(api_key.strip())
        self._client = genai.Client(api_key=api_key) if self._ready else None

    def generate_board(self, cards: list[dict], lists: list[str]) -> dict[str, str]:
        """Generate a board name and description based on the card and list content.

        Only the first 20 cards are included in the prompt to keep it concise.

        Args:
            cards: Raw card dicts from the uploaded JSON.
            lists: Column names for the board.

        Returns:
            Dict with board_name and board_description keys.

        Raises:
            AppException: When the API key is absent or the SDK call fails.
        """
        self._check_ready()

        cards_summary = "\n".join(
            f"- Name: {c.get('card_title', '')}, List: {c.get('list_name', '')}"
            for c in cards[:20]
        )
        prompt = _GENERATE_PROMPT.format(
            lists=", ".join(lists),
            cards_summary=cards_summary,
        )

        try:
            response = self._client.models.generate_content(
                model=_MODEL, contents=prompt
            )
            json_text = (response.text or "{}").strip()
            if "```" in json_text:
                json_text = re.sub(r"```json|```", "", json_text).strip()
            parsed = json.loads(json_text)
            return {
                "board_name": parsed.get("board_name", "Development Sprint Board"),
                "board_description": parsed.get(
                    "board_description", "Optimized project delivery workspace."
                ),
            }
        except Exception as exc:
            logger.error("Gemini generate_board failed: {}", exc)
            raise AppException(
                f"Gemini board generation failed: {exc}", original=exc
            ) from exc

    def refactor_description(self, description: str) -> str:
        """Refactor a board description to be more professional and engaging.

        Args:
            description: The original description text to refactor.

        Returns:
            The refactored description string.

        Raises:
            AppException: When the API key is absent or the SDK call fails.
        """
        self._check_ready()

        prompt = _REFACTOR_PROMPT.format(description=description)

        try:
            response = self._client.models.generate_content(
                model=_MODEL, contents=prompt
            )
            return (response.text or description).strip()
        except Exception as exc:
            logger.error("Gemini refactor_description failed: {}", exc)
            raise AppException(
                f"Gemini description refactor failed: {exc}", original=exc
            ) from exc

    def _check_ready(self) -> None:
        """Raise AppException if no API key was provided at construction time."""
        if not self._ready:
            raise AppException("GEMINI_API_KEY not configured")
