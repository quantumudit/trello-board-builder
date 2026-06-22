"""
FastAPI application: serves the web UI and exposes the board-builder REST API.
"""

from __future__ import annotations

import asyncio
import json
import os
import uuid
from pathlib import Path
from typing import Any

import yaml
from dotenv import load_dotenv
from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.responses import HTMLResponse, PlainTextResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from starlette.requests import Request

from shared.exceptions import AppException
from shared.logger import logger
from web.gemini_service import GeminiService
from web.pipeline_runner import get_job_queue, get_job_result, start_pipeline
from web.schemas import (
    BuildStarted,
    GeminiBoardRequest,
    GeminiBoardResponse,
    GeminiRefactorRequest,
    GeminiRefactorResponse,
    InferredLabel,
    RunConfig,
    ValidateResponse,
)

load_dotenv()

app = FastAPI(title="Trello Board Builder", version="1.0.0")

_TEMPLATES_DIR = Path(__file__).parent / "templates"
_STATIC_DIR = Path(__file__).parent / "static"
_SETTINGS_YAML = Path("config/settings.yaml")

templates = Jinja2Templates(directory=str(_TEMPLATES_DIR))
if _STATIC_DIR.exists():
    app.mount("/static", StaticFiles(directory=str(_STATIC_DIR)), name="static")

_gemini = GeminiService(os.getenv("GEMINI_API_KEY", ""))


# ---------------------------------------------------------------------------
# UI
# ---------------------------------------------------------------------------


@app.get("/", response_class=HTMLResponse, response_model=None)
async def index(request: Request) -> HTMLResponse | PlainTextResponse:
    """Render the main builder UI.

    Args:
        request: The incoming HTTP request.

    Returns:
        The rendered index.html template, or a plain-text fallback message
        if the React frontend has not been built yet.
    """
    if not (_TEMPLATES_DIR / "index.html").exists():
        return PlainTextResponse(
            "Frontend not built. Run `just build-ui` first.", status_code=200
        )
    return templates.TemplateResponse(request, "index.html")


# ---------------------------------------------------------------------------
# API -- validation
# ---------------------------------------------------------------------------


@app.post("/api/validate-json", response_model=ValidateResponse)
async def validate_json(file: UploadFile = File(...)) -> ValidateResponse:
    """Parse and validate an uploaded cards JSON file.

    Extracts unique label names and list names from the cards, and resolves
    each label's default color from config/settings.yaml.

    Args:
        file: The uploaded .json file (multipart/form-data).

    Returns:
        ValidateResponse with card count, inferred labels, and list names.
    """
    if not file.filename or not file.filename.endswith(".json"):
        return ValidateResponse(
            valid=False,
            card_count=0,
            labels=[],
            lists=[],
            error="Only .json files are accepted.",
        )

    content = await file.read()
    if len(content) > 1_048_576:
        return ValidateResponse(
            valid=False,
            card_count=0,
            labels=[],
            lists=[],
            error="File exceeds the 1 MB size limit.",
        )

    try:
        raw: Any = json.loads(content)
    except json.JSONDecodeError as exc:
        return ValidateResponse(
            valid=False,
            card_count=0,
            labels=[],
            lists=[],
            error=f"Invalid JSON: {exc}",
        )

    if not isinstance(raw, list):
        return ValidateResponse(
            valid=False,
            card_count=0,
            labels=[],
            lists=[],
            error="JSON must be a top-level array of card objects.",
        )

    cards = [
        c
        for c in raw
        if isinstance(c, dict) and "_comment" not in c and "_rules" not in c
    ]

    if not cards:
        return ValidateResponse(
            valid=False,
            card_count=0,
            labels=[],
            lists=[],
            error=(
                "No card objects found (array is empty or contains only "
                "comment entries)."
            ),
        )

    label_names: list[str] = []
    list_names: list[str] = []
    for card in cards:
        for lbl in card.get("labels", []):
            if lbl not in label_names:
                label_names.append(lbl)
        lst = card.get("list_name", "").strip()
        if lst and lst not in list_names:
            list_names.append(lst)

    default_colors = _load_yaml_label_colors()
    inferred = [
        InferredLabel(name=n, default_color=default_colors.get(n, "blue"))
        for n in label_names
    ]

    return ValidateResponse(
        valid=True,
        card_count=len(cards),
        labels=inferred,
        lists=list_names,
    )


# ---------------------------------------------------------------------------
# API -- build
# ---------------------------------------------------------------------------


@app.post("/api/build", response_model=BuildStarted)
async def build_board(run_config: RunConfig) -> BuildStarted:
    """Start the board-building pipeline in a background thread.

    Args:
        run_config: Full build configuration from the web form.

    Returns:
        BuildStarted with a job_id to poll via /api/status/{job_id}.
    """
    job_id = str(uuid.uuid4())
    logger.info("Build job {} started for board '{}'", job_id, run_config.board_name)
    start_pipeline(run_config, job_id)
    return BuildStarted(job_id=job_id, message="Build started.")


# ---------------------------------------------------------------------------
# API -- SSE log stream
# ---------------------------------------------------------------------------


@app.get("/api/status/{job_id}")
async def stream_status(job_id: str) -> StreamingResponse:
    """Stream live log output for a running build job via Server-Sent Events.

    Emits message events for each log line and a done event with a JSON
    payload when the job completes or fails.

    Args:
        job_id: The job identifier returned by /api/build.

    Returns:
        A text/event-stream response.
    """
    log_q = get_job_queue(job_id)
    if log_q is None:
        raise HTTPException(status_code=404, detail=f"Job '{job_id}' not found.")

    async def event_stream():
        while True:
            try:
                msg = log_q.get_nowait()
            except Exception:
                await asyncio.sleep(0.1)
                yield ": heartbeat\n\n"
                continue

            if msg is None:
                result = get_job_result(job_id)
                yield f"event: done\ndata: {json.dumps(result)}\n\n"
                break

            escaped = msg.replace("\n", " ")
            yield f"data: {escaped}\n\n"

    return StreamingResponse(event_stream(), media_type="text/event-stream")


# ---------------------------------------------------------------------------
# API -- Gemini AI
# ---------------------------------------------------------------------------


@app.post("/api/gemini/generate-board", response_model=GeminiBoardResponse)
async def gemini_generate_board(req: GeminiBoardRequest) -> GeminiBoardResponse:
    """Generate a board name and description using Gemini AI.

    Args:
        req: Cards array and list names to base the generation on.

    Returns:
        GeminiBoardResponse with board_name and board_description.
    """
    try:
        result = _gemini.generate_board(req.cards, req.lists)
        return GeminiBoardResponse(**result)
    except AppException as exc:
        status = 503 if exc.args[0] == "GEMINI_API_KEY not configured" else 500
        raise HTTPException(status_code=status, detail=exc.args[0]) from exc


@app.post("/api/gemini/refactor-description", response_model=GeminiRefactorResponse)
async def gemini_refactor_description(
    req: GeminiRefactorRequest,
) -> GeminiRefactorResponse:
    """Refactor a board description using Gemini AI.

    Args:
        req: The description string to refactor.

    Returns:
        GeminiRefactorResponse with the refactored description.
    """
    try:
        refactored = _gemini.refactor_description(req.description)
        return GeminiRefactorResponse(refactored=refactored)
    except AppException as exc:
        status = 503 if exc.args[0] == "GEMINI_API_KEY not configured" else 500
        raise HTTPException(status_code=status, detail=exc.args[0]) from exc


@app.get("/api/config/credentials")
async def get_credentials() -> dict[str, str]:
    """Return Trello credentials from the server environment.

    Reads TRELLO_API_KEY and TRELLO_TOKEN from the process environment.
    Only safe for local or self-hosted deployments -- never expose this
    endpoint on a public server.

    Returns:
        Dict with apiKey and token keys matching the frontend's expected shape.
    """
    return {
        "apiKey": os.getenv("TRELLO_API_KEY", ""),
        "token": os.getenv("TRELLO_TOKEN", ""),
    }


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------


def _load_yaml_label_colors() -> dict[str, str]:
    """Load label name to Trello color mappings from config/settings.yaml.

    Returns:
        Dict mapping label name to Trello color name.
        Returns empty dict if the file does not exist or has no labels section.
    """
    if not _SETTINGS_YAML.exists():
        return {}
    try:
        with _SETTINGS_YAML.open(encoding="utf-8") as f:
            data: dict[str, Any] = yaml.safe_load(f) or {}
        return {
            lbl["name"]: lbl.get("color", "blue")
            for lbl in data.get("labels", [])
            if "name" in lbl
        }
    except Exception:
        return {}
