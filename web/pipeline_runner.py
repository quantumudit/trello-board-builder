"""
Wraps the existing board-building pipeline for use by the web layer.
Accepts a RunConfig instead of reading from YAML and .env files.
"""

from __future__ import annotations

import queue
import threading
from pathlib import Path
from typing import TYPE_CHECKING, Any

import yaml

from core.board_manager import BoardManager
from core.card_builder import CardBuilder
from core.trello_client import TrelloClient
from shared.logger import logger
from utils.config_loader import Config

if TYPE_CHECKING:
    from web.schemas import RunConfig

# ---------------------------------------------------------------------------
# In-memory job registry.
# Keyed by job_id (str UUID). Each entry holds a Queue for log lines and
# a result dict populated when the pipeline finishes.
# Intentionally simple -- single-user local tool only.
# ---------------------------------------------------------------------------
_job_queues: dict[str, queue.Queue[str | None]] = {}
_job_results: dict[str, dict[str, Any]] = {}


def start_pipeline(run_config: RunConfig, job_id: str) -> None:
    """Spin up a background thread that runs the pipeline for the given job_id.

    Args:
        run_config: Validated build configuration from the web form.
        job_id: Unique ID assigned to this build job.
    """
    _job_queues[job_id] = queue.Queue()
    _job_results[job_id] = {}

    thread = threading.Thread(
        target=_run,
        args=(run_config, job_id),
        daemon=True,
    )
    thread.start()


def get_job_queue(job_id: str) -> queue.Queue[str | None] | None:
    """Return the log queue for a job, or None if the job does not exist.

    Args:
        job_id: The job identifier returned by start_pipeline.

    Returns:
        The Queue for this job, or None.
    """
    return _job_queues.get(job_id)


def get_job_result(job_id: str) -> dict[str, Any]:
    """Return the final result dict for a completed job.

    Args:
        job_id: The job identifier.

    Returns:
        Dict with keys status ("success" or "error"), and either
        board_url or message.
    """
    return _job_results.get(job_id, {})


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------


def _run(run_config: RunConfig, job_id: str) -> None:
    """Execute the pipeline in a background thread.

    Captures all loguru output into the job queue, then pushes a None
    sentinel when done to signal the SSE stream to close.
    """
    log_q = _job_queues[job_id]

    def _queue_sink(message: Any) -> None:
        log_q.put(str(message).rstrip())

    sink_id = logger.add(_queue_sink, format="{time:HH:mm:ss} | {level:<7} | {message}")

    try:
        config = _WebConfig(run_config)
        cards = [_normalise(card) for card in run_config.cards]

        client = TrelloClient(config)
        board_manager = BoardManager(client, config)
        board_manager.setup()

        card_builder = CardBuilder(client, board_manager)
        card_builder.build_all(cards)

        board_url = f"https://trello.com/b/{board_manager.board_id}"
        logger.success("Board ready: {}", board_url)
        _job_results[job_id] = {"status": "success", "board_url": board_url}

    except Exception as exc:
        logger.error("Pipeline failed: {}", exc)
        _job_results[job_id] = {"status": "error", "message": str(exc)}

    finally:
        logger.remove(sink_id)
        log_q.put(None)  # sentinel: stream is done


class _WebConfig(Config):
    """Config subclass that reads board settings from a RunConfig instead of files.

    Bypasses file-based loading for all board and credential properties.
    Still reads config/settings.yaml for api_base_url and rate_limit_delay.

    Args:
        run_config: The validated build configuration from the web form.
    """

    def __init__(self, run_config: RunConfig) -> None:
        self._run_config = run_config
        self._data: dict[str, Any] = {}
        yaml_path = Path("config/settings.yaml")
        if yaml_path.exists():
            with yaml_path.open(encoding="utf-8") as f:
                self._data = yaml.safe_load(f) or {}

    @property
    def api_key(self) -> str:
        """Return the Trello API key from the run config."""
        return self._run_config.api_key

    @property
    def token(self) -> str:
        """Return the Trello token from the run config."""
        return self._run_config.token

    @property
    def board_name(self) -> str:
        """Return the board name from the run config."""
        return self._run_config.board_name

    @property
    def board_description(self) -> str:
        """Return the board description from the run config."""
        return self._run_config.board_description

    @property
    def board_permission(self) -> str:
        """Return the board permission level from the run config."""
        return self._run_config.permission_level

    @property
    def create_if_not_exists(self) -> bool:
        """Return whether to create the board when it does not exist."""
        return self._run_config.create_if_not_exists

    @property
    def lists(self) -> list[str]:
        """Return the ordered list names from the run config."""
        return self._run_config.lists

    @property
    def labels(self) -> list[dict[str, str]]:
        """Return the label overrides from the run config as config-compatible dicts."""
        return [
            {"name": lbl.name, "color": lbl.color} for lbl in self._run_config.labels
        ]

    @property
    def input_file_path(self) -> Path:
        """Return a placeholder path -- cards are passed directly in run_config."""
        return Path("inputs/cards.json")


def _normalise(item: dict[str, Any]) -> dict[str, Any]:
    """Return a normalised card dict with all optional fields defaulted.

    Mirrors utils/input_loader._normalise to avoid coupling on a private import.

    Args:
        item: Raw card dict from the uploaded JSON.

    Returns:
        Normalised card dict ready for CardBuilder.
    """
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
