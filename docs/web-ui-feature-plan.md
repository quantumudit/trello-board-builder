# Web UI Feature Plan

> **Status: IMPLEMENTED** -- see `web/` (Python backend) and `web/ui/` (React frontend).
> This document is preserved as a design reference. The actual code is the source of truth.

This document is a complete, self-contained implementation guide.
It contains every decision, code skeleton, and command needed to build the feature
from scratch on a fresh feature branch. No prior context required.

Tracked in: https://github.com/quantumudit/trello-board-builder/issues/1

---

## Goal

Add a browser-based interface so users can:
- Upload a cards JSON file (drag-and-drop or browse)
- Override label colors interactively
- Fill in board name, description, permission, and create-if-not-exists
- Provide Trello API credentials via password fields (never stored)
- Trigger the board build and watch live log output

The existing pipeline modules (`core/`, `utils/`, `shared/`) are NOT modified.
The web layer wraps them.

---

## Decisions Made

| Decision | Choice | Reason |
|----------|--------|--------|
| Backend framework | FastAPI | Pydantic validation built-in, async, native Jinja2/static support |
| Frontend | Jinja2 + Alpine.js + Tailwind CSS (all via CDN) | No Node.js, no npm, no build step, Docker-friendly |
| Label color selector | Trello color swatches (10 fixed colors) | `input[type=color]` gives arbitrary hex; Trello only accepts 10 named colors |
| Job state | In-memory dict per process | Single-user local tool; swap to Redis only if multi-user is ever needed |
| Log streaming | Server-Sent Events (SSE) with loguru custom sink | No WebSocket overhead; SSE is one-directional, which is all we need |
| Credentials | Sent in request body, never written to disk | Security constraint -- no session storage |
| Config override | `WebConfig(Config)` subclass | Shares the same interface consumed by TrelloClient/BoardManager/CardBuilder |
| Cards in build request | Sent as JSON array in request body | Keeps the server stateless; JSON files are small (a few KB) |
| `web/` structure | Flat (no `web/backend/` subdirectory) | Only 3-4 Python files; the templates/ and static/ dirs already separate concerns |

---

## Final File Structure

Files marked `[NEW]` are created by this feature. Files marked `[MODIFIED]` have additions.

```
trello-board-builder/
+-- web/                          [NEW directory]
|   +-- __init__.py               [NEW]
|   +-- app.py                    [NEW]  FastAPI app, all routes
|   +-- pipeline_runner.py        [NEW]  wraps existing pipeline, accepts RunConfig
|   +-- schemas.py                [NEW]  Pydantic models for all request/response types
|   +-- templates/
|   |   +-- index.html            [NEW]  single Jinja2 template, all UI steps
|   +-- static/                   [NEW empty dir]  (reserved for future assets)
+-- Dockerfile                    [NEW]
+-- docker-compose.yaml           [NEW]
+-- pyproject.toml                [MODIFIED]  add fastapi, uvicorn, python-multipart
+-- justfile                      [MODIFIED]  add "serve" recipe
```

No other existing files change.

---

## Tech Stack -- Exact Versions to Add

Run these commands on the feature branch after creating it:

```powershell
uv add "fastapi>=0.115.0"
uv add "uvicorn[standard]>=0.34.0"
uv add "python-multipart>=0.0.20"
uv add "jinja2>=3.1.0"
```

`jinja2` may already be a transitive dep; `uv add` is idempotent, run it anyway.

After adding, `pyproject.toml` dependencies section should include:

```toml
"fastapi>=0.115.0",
"uvicorn[standard]>=0.34.0",
"python-multipart>=0.0.20",
"jinja2>=3.1.0",
```

---

## justfile Addition

Add one recipe at the bottom of `justfile`:

```just
# Start the web UI (hot-reload, dev mode)
serve:
    uv run uvicorn web.app:app --reload --host 0.0.0.0 --port 8000
```

`PYTHONPATH=.` is already exported globally in the justfile, so imports like
`from core.board_manager import BoardManager` resolve correctly inside the web app.

---

## Phase 1 -- Backend Skeleton

Build and test the backend before touching the frontend.

### web/__init__.py

Empty file. Just `touch web/__init__.py`.

---

### web/schemas.py

```python
"""
Pydantic models for all web API request and response payloads.
"""

from __future__ import annotations

from typing import Any

from pydantic import BaseModel, field_validator


_VALID_TRELLO_COLORS = {
    "green", "yellow", "orange", "red", "purple",
    "blue", "sky", "lime", "pink", "black",
}

_VALID_PERMISSIONS = {"private", "org", "public"}


class InferredLabel(BaseModel):
    """A label name extracted from the uploaded JSON with its default Trello color."""

    name: str
    default_color: str  # one of the 10 Trello color names


class ValidateResponse(BaseModel):
    """Response from POST /api/validate-json."""

    valid: bool
    card_count: int
    labels: list[InferredLabel]
    lists: list[str]        # ordered unique list names found in the JSON
    error: str | None = None


class LabelOverride(BaseModel):
    """A label name paired with the user-chosen Trello color."""

    name: str
    color: str

    @field_validator("color")
    @classmethod
    def color_must_be_valid(cls, v: str) -> str:
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
    labels: list[LabelOverride]
    cards: list[dict[str, Any]]  # raw card objects from uploaded JSON

    @field_validator("permission_level")
    @classmethod
    def permission_must_be_valid(cls, v: str) -> str:
        if v not in _VALID_PERMISSIONS:
            raise ValueError(f"permission_level must be one of {_VALID_PERMISSIONS}")
        return v

    @field_validator("board_name")
    @classmethod
    def board_name_not_empty(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("board_name must not be empty")
        return v.strip()

    @field_validator("api_key", "token")
    @classmethod
    def credential_not_empty(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("api_key and token must not be empty")
        return v.strip()


class BuildStarted(BaseModel):
    """Response from POST /api/build when the pipeline starts successfully."""

    job_id: str
    message: str


class JobDoneEvent(BaseModel):
    """Payload of the SSE 'done' event."""

    status: str          # "success" or "error"
    board_url: str | None = None
    message: str | None = None
```

---

### web/pipeline_runner.py

```python
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
# In-memory job registry
# Keyed by job_id (str UUID). Each entry holds a Queue for log lines and
# a result dict populated when the pipeline finishes.
# This is intentionally simple -- single-user local tool only.
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
        Dict with keys "status" ("success" or "error"), and either
        "board_url" or "message".
    """
    return _job_results.get(job_id, {})


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _run(run_config: RunConfig, job_id: str) -> None:
    """Execute the pipeline in a background thread.

    Captures all loguru output into the job queue, then pushes a None
    sentinel when done (signals SSE stream to close).
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

    Bypasses file-based loading for all board/credential properties.
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
        return self._run_config.api_key

    @property
    def token(self) -> str:
        return self._run_config.token

    @property
    def board_name(self) -> str:
        return self._run_config.board_name

    @property
    def board_description(self) -> str:
        return self._run_config.board_description

    @property
    def board_permission(self) -> str:
        return self._run_config.permission_level

    @property
    def create_if_not_exists(self) -> bool:
        return self._run_config.create_if_not_exists

    @property
    def labels(self) -> list[dict[str, str]]:
        return [
            {"name": lbl.name, "color": lbl.color}
            for lbl in self._run_config.labels
        ]

    @property
    def input_file_path(self) -> Path:
        # Not used in the web pipeline (cards are passed in RunConfig.cards)
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
```

---

### web/app.py

```python
"""
FastAPI application: serves the web UI and exposes the board-builder API.
"""

from __future__ import annotations

import asyncio
import json
import uuid
from pathlib import Path
from typing import Any

import yaml
from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.responses import HTMLResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from starlette.requests import Request

from shared.logger import logger
from web.pipeline_runner import get_job_queue, get_job_result, start_pipeline
from web.schemas import (
    BuildStarted,
    InferredLabel,
    RunConfig,
    ValidateResponse,
)

app = FastAPI(title="Trello Board Builder", version="1.0.0")

_TEMPLATES_DIR = Path(__file__).parent / "templates"
_STATIC_DIR = Path(__file__).parent / "static"
_SETTINGS_YAML = Path("config/settings.yaml")

templates = Jinja2Templates(directory=str(_TEMPLATES_DIR))
app.mount("/static", StaticFiles(directory=str(_STATIC_DIR)), name="static")


# ---------------------------------------------------------------------------
# UI
# ---------------------------------------------------------------------------

@app.get("/", response_class=HTMLResponse)
async def index(request: Request) -> HTMLResponse:
    """Render the main builder UI."""
    return templates.TemplateResponse("index.html", {"request": request})


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
    if len(content) > 1_048_576:  # 1 MB cap
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
        c for c in raw
        if isinstance(c, dict) and "_comment" not in c and "_rules" not in c
    ]

    if not cards:
        return ValidateResponse(
            valid=False,
            card_count=0,
            labels=[],
            lists=[],
            error="No card objects found (array is empty or contains only comment entries).",
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

    The stream emits 'message' events for each log line and a 'done' event
    with a JSON payload when the job completes or fails.

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
                # Sentinel -- pipeline finished; send done event and close stream
                result = get_job_result(job_id)
                yield f"event: done\ndata: {json.dumps(result)}\n\n"
                break

            escaped = msg.replace("\n", " ")
            yield f"data: {escaped}\n\n"

    return StreamingResponse(event_stream(), media_type="text/event-stream")


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _load_yaml_label_colors() -> dict[str, str]:
    """Load label name -> Trello color mappings from config/settings.yaml.

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
```

---

## Phase 2 -- Frontend

### web/templates/index.html -- structure and Alpine.js state

The template is a single HTML file with Tailwind CSS and Alpine.js loaded from CDN.
All interactivity is driven by one Alpine.js component on `<body>`.

#### CDN imports (in `<head>`)

```html
<script src="https://cdn.tailwindcss.com"></script>
<script defer src="https://cdn.jsdelivr.net/npm/alpinejs@3.x.x/dist/cdn.min.js"></script>
```

Pin Alpine.js to a specific minor version (e.g. `@3.14.1`) to avoid unexpected changes.

#### Alpine.js component state

Attach `x-data="boardBuilder()"` to `<body>` or a wrapper `<div>`.
Define `boardBuilder()` in a `<script>` tag:

```javascript
const TRELLO_COLORS = [
    { name: 'green',  hex: '#61bd4f' },
    { name: 'yellow', hex: '#f2d600' },
    { name: 'orange', hex: '#ff9f1a' },
    { name: 'red',    hex: '#eb5a46' },
    { name: 'purple', hex: '#c377e0' },
    { name: 'blue',   hex: '#0079bf' },
    { name: 'sky',    hex: '#00c2e0' },
    { name: 'lime',   hex: '#51e898' },
    { name: 'pink',   hex: '#ff78cb' },
    { name: 'black',  hex: '#344563' },
];

function boardBuilder() {
    return {
        // -- Step tracking (1: upload, 2: configure, 3: logs) --
        step: 1,

        // -- Step 1: file upload --
        isDragging: false,
        fileName: '',
        uploadError: '',
        rawCards: null,        // array from FileReader, held client-side

        // -- From validate-json response --
        inferredLabels: [],    // [{name, default_color}]
        inferredLists: [],     // [string]
        cardCount: 0,

        // -- Step 2a: label colors --
        // Object: { labelName: trelloColorName }
        labelColors: {},

        // -- Step 2b: board config --
        boardName: '',
        boardDescription: '',
        permissionLevel: 'private',
        createIfNotExists: true,

        // -- Step 2c: credentials --
        apiKey: '',
        trelloToken: '',
        showApiKey: false,
        showToken: false,

        // -- Step 3: build state --
        isBuilding: false,
        jobId: null,
        logLines: [],
        buildStatus: null,     // null | 'success' | 'error'
        boardUrl: null,
        buildError: null,

        // -- Computed helpers --
        get trelloColors() { return TRELLO_COLORS; },
        get canSubmit() {
            return this.rawCards !== null
                && this.boardName.trim() !== ''
                && this.apiKey.trim() !== ''
                && this.trelloToken.trim() !== ''
                && !this.isBuilding;
        },

        // -- Methods --
        handleDrop(event) {
            this.isDragging = false;
            const file = event.dataTransfer.files[0];
            if (file) this.loadFile(file);
        },

        handleBrowse(event) {
            const file = event.target.files[0];
            if (file) this.loadFile(file);
        },

        loadFile(file) {
            if (!file.name.endsWith('.json')) {
                this.uploadError = 'Only .json files are accepted.';
                return;
            }
            this.uploadError = '';
            this.fileName = file.name;
            const reader = new FileReader();
            reader.onload = (e) => {
                try {
                    this.rawCards = JSON.parse(e.target.result);
                    this.validateJson(file);
                } catch (err) {
                    this.uploadError = 'Could not parse JSON: ' + err.message;
                }
            };
            reader.readAsText(file);
        },

        async validateJson(file) {
            const formData = new FormData();
            formData.append('file', file);
            const res = await fetch('/api/validate-json', {
                method: 'POST',
                body: formData,
            });
            const data = await res.json();
            if (!data.valid) {
                this.uploadError = data.error || 'Validation failed.';
                this.rawCards = null;
                return;
            }
            this.cardCount = data.card_count;
            this.inferredLabels = data.labels;
            this.inferredLists = data.lists;
            // Pre-fill label colors from defaults returned by server
            this.labelColors = {};
            data.labels.forEach(lbl => {
                this.labelColors[lbl.name] = lbl.default_color;
            });
            this.step = 2;
        },

        async submitBuild() {
            if (!this.canSubmit) return;
            this.isBuilding = true;
            this.logLines = [];
            this.buildStatus = null;

            const payload = {
                api_key: this.apiKey,
                token: this.trelloToken,
                board_name: this.boardName,
                board_description: this.boardDescription,
                permission_level: this.permissionLevel,
                create_if_not_exists: this.createIfNotExists,
                labels: Object.entries(this.labelColors).map(([name, color]) => ({
                    name, color,
                })),
                cards: this.rawCards.filter(
                    c => !('_comment' in c) && !('_rules' in c)
                ),
            };

            const res = await fetch('/api/build', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });

            if (!res.ok) {
                const err = await res.json();
                this.buildStatus = 'error';
                this.buildError = JSON.stringify(err.detail);
                this.isBuilding = false;
                return;
            }

            const { job_id } = await res.json();
            this.jobId = job_id;
            this.step = 3;
            this.listenForLogs(job_id);
        },

        listenForLogs(jobId) {
            const es = new EventSource(`/api/status/${jobId}`);
            es.onmessage = (event) => {
                this.logLines.push(event.data);
                // Auto-scroll log panel -- call $nextTick to scroll after DOM update
                this.$nextTick(() => {
                    const el = document.getElementById('log-panel');
                    if (el) el.scrollTop = el.scrollHeight;
                });
            };
            es.addEventListener('done', (event) => {
                const result = JSON.parse(event.data);
                this.buildStatus = result.status;
                this.boardUrl = result.board_url || null;
                this.buildError = result.message || null;
                this.isBuilding = false;
                es.close();
            });
            es.onerror = () => {
                this.buildStatus = 'error';
                this.buildError = 'Lost connection to server.';
                this.isBuilding = false;
                es.close();
            };
        },

        resetForm() {
            Object.assign(this, boardBuilder());
        },
    };
}
```

#### HTML layout (key sections, Tailwind classes are illustrative)

```html
<!-- Step indicator: 3 numbered circles at the top -->
<!-- Step 1: Upload JSON -->
<div x-show="step === 1">
  <!-- Drag-and-drop zone -->
  <div
    @dragover.prevent="isDragging = true"
    @dragleave="isDragging = false"
    @drop.prevent="handleDrop($event)"
    :class="isDragging ? 'border-blue-500 bg-blue-50' : 'border-gray-300'"
    class="border-2 border-dashed rounded-lg p-12 text-center cursor-pointer"
    @click="$refs.fileInput.click()"
  >
    <p x-show="!fileName">Drag and drop your cards.json here, or click to browse</p>
    <p x-show="fileName" x-text="fileName"></p>
  </div>
  <input type="file" x-ref="fileInput" accept=".json" class="hidden" @change="handleBrowse($event)" />
  <p x-show="uploadError" x-text="uploadError" class="text-red-600 mt-2"></p>
</div>

<!-- Step 2: Configure -->
<div x-show="step === 2">

  <!-- Inferred lists (read-only pill list) -->
  <div>
    <h3>Lists (inferred from JSON)</h3>
    <template x-for="lst in inferredLists" :key="lst">
      <span x-text="lst" class="inline-block bg-gray-100 rounded px-2 py-1 mr-1 mb-1 text-sm"></span>
    </template>
  </div>

  <!-- Label color swatches -->
  <div x-show="inferredLabels.length > 0">
    <h3>Label Colors</h3>
    <template x-for="lbl in inferredLabels" :key="lbl.name">
      <div class="flex items-center gap-3 mb-3">
        <span x-text="lbl.name" class="w-24 font-medium"></span>
        <template x-for="c in trelloColors" :key="c.name">
          <button
            type="button"
            :style="'background-color: ' + c.hex"
            :class="labelColors[lbl.name] === c.name
                      ? 'ring-2 ring-offset-2 ring-gray-800'
                      : ''"
            class="w-7 h-7 rounded-full transition-all"
            :title="c.name"
            @click="labelColors[lbl.name] = c.name"
          ></button>
        </template>
      </div>
    </template>
  </div>

  <!-- Board config form -->
  <div>
    <h3>Board Settings</h3>
    <input x-model="boardName" type="text" placeholder="Board name" />
    <textarea x-model="boardDescription" placeholder="Description (optional)"></textarea>
    <select x-model="permissionLevel">
      <option value="private">Private</option>
      <option value="org">Organization</option>
      <option value="public">Public</option>
    </select>
    <label>
      <input x-model="createIfNotExists" type="checkbox" />
      Create board if it does not exist
    </label>
  </div>

  <!-- Trello credentials -->
  <div>
    <h3>Trello Credentials</h3>
    <p>Get your key and token from
      <a href="https://trello.com/app-key" target="_blank">trello.com/app-key</a>
    </p>
    <div class="relative">
      <input
        x-model="apiKey"
        :type="showApiKey ? 'text' : 'password'"
        placeholder="Trello API Key"
      />
      <button type="button" @click="showApiKey = !showApiKey">show/hide</button>
    </div>
    <div class="relative">
      <input
        x-model="trelloToken"
        :type="showToken ? 'text' : 'password'"
        placeholder="Trello Token"
      />
      <button type="button" @click="showToken = !showToken">show/hide</button>
    </div>
  </div>

  <!-- Card summary + submit -->
  <p x-text="cardCount + ' cards ready to build'"></p>
  <button
    @click="submitBuild()"
    :disabled="!canSubmit"
    class="..."
  >
    Build Board
  </button>
</div>

<!-- Step 3: Live logs -->
<div x-show="step === 3">
  <div id="log-panel" class="font-mono text-sm bg-gray-900 text-green-400 p-4 h-64 overflow-y-auto">
    <template x-for="(line, i) in logLines" :key="i">
      <div x-text="line"></div>
    </template>
    <div x-show="isBuilding" class="animate-pulse">...</div>
  </div>

  <!-- Success banner -->
  <div x-show="buildStatus === 'success'">
    <p>Board created successfully!</p>
    <a :href="boardUrl" target="_blank" x-text="boardUrl"></a>
    <button @click="resetForm()">Build another board</button>
  </div>

  <!-- Error banner -->
  <div x-show="buildStatus === 'error'">
    <p>Build failed:</p>
    <pre x-text="buildError"></pre>
    <button @click="step = 2">Go back and try again</button>
  </div>
</div>
```

---

## Phase 3 -- Docker

### Dockerfile

```dockerfile
FROM python:3.12-slim

WORKDIR /app

# Install uv
COPY --from=ghcr.io/astral-sh/uv:latest /uv /uvx /usr/local/bin/

# Install dependencies (cached layer -- only rebuilds when pyproject.toml or uv.lock changes)
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev

# Copy application source
COPY . .

EXPOSE 8000

CMD ["uv", "run", "uvicorn", "web.app:app", "--host", "0.0.0.0", "--port", "8000"]
```

### docker-compose.yaml

```yaml
services:
  trello-builder:
    build: .
    ports:
      - "8000:8000"
    environment:
      - PYTHONPATH=/app
    restart: unless-stopped
```

No volumes are mounted. Credentials are passed through the UI form.
The default `config/settings.yaml` bundled in the image sets fallback colors and
api_base_url -- the user overrides board name, labels, and credentials via the UI.

To run:

```powershell
docker compose up --build
```

Then open `http://localhost:8000` in a browser.

---

## API Contract (Complete)

### POST /api/validate-json

Request: `multipart/form-data` with a single field `file` (the .json file).

Response (`ValidateResponse`):
```json
{
  "valid": true,
  "card_count": 7,
  "labels": [
    { "name": "Low",    "default_color": "green" },
    { "name": "Medium", "default_color": "yellow" },
    { "name": "High",   "default_color": "red" }
  ],
  "lists": ["Backlog", "To Do", "In Progress", "In Review", "Done"],
  "error": null
}
```

On failure:
```json
{ "valid": false, "card_count": 0, "labels": [], "lists": [], "error": "..." }
```

---

### POST /api/build

Request body (JSON):
```json
{
  "api_key": "abc123",
  "token": "xyz789",
  "board_name": "My Project",
  "board_description": "Optional description",
  "permission_level": "private",
  "create_if_not_exists": true,
  "labels": [
    { "name": "Low",    "color": "green"  },
    { "name": "Medium", "color": "yellow" },
    { "name": "High",   "color": "red"    }
  ],
  "cards": [
    {
      "list_name": "Backlog",
      "card_title": "Define project scope",
      "description": "...",
      "labels": ["Low"],
      "due_date": null,
      "checklist": { "title": "Tasks", "items": ["..."] }
    }
  ]
}
```

Response:
```json
{ "job_id": "a1b2c3d4-...", "message": "Build started." }
```

---

### GET /api/status/{job_id}

SSE stream. Events:

- `message` (default): one log line, e.g. `data: 12:34:56 | SUCCESS | Board ready: ...\n\n`
- `done`: fired once when the pipeline finishes

```
event: done
data: {"status": "success", "board_url": "https://trello.com/b/XXXXXXXX"}

event: done
data: {"status": "error", "message": "TRELLO_API_KEY not set in .env"}
```

Heartbeat comments (`: heartbeat`) are sent every ~100 ms while idle to keep the
connection alive through proxies.

---

## Trello Color Reference

These are the only valid values for `LabelOverride.color`.

| Name   | Hex     |
|--------|---------|
| green  | #61bd4f |
| yellow | #f2d600 |
| orange | #ff9f1a |
| red    | #eb5a46 |
| purple | #c377e0 |
| blue   | #0079bf |
| sky    | #00c2e0 |
| lime   | #51e898 |
| pink   | #ff78cb |
| black  | #344563 |

The hex values in `TRELLO_COLORS` in `index.html` must match this table exactly.

---

## Test Checklist

After each phase, verify the following before moving on.

### Phase 1 gate

- [ ] `just serve` starts without errors
- [ ] `GET /` returns 200 (even with a blank template)
- [ ] `POST /api/validate-json` with `inputs/cards.json` returns `valid: true`,
      correct card count (7), correct label names, correct list names
- [ ] `POST /api/validate-json` with a non-JSON file returns `valid: false`
- [ ] `POST /api/build` with a valid `RunConfig` (real credentials) returns a `job_id`
- [ ] `GET /api/status/{job_id}` streams log lines and ends with a `done` event
- [ ] `GET /api/status/nonexistent` returns 404
- [ ] `uv run pytest` still passes (existing tests unaffected)

### Phase 2 gate

- [ ] File drag-and-drop populates `fileName` and advances to step 2
- [ ] A non-JSON file shows an error and does not advance
- [ ] A malformed JSON file shows the parse error
- [ ] Label swatches show the correct default colors from settings.yaml
- [ ] Clicking a swatch updates the selected color (ring appears)
- [ ] Lists show as read-only pills
- [ ] "Build Board" is disabled until board name and credentials are filled
- [ ] Submitting a valid form advances to step 3 and logs appear
- [ ] Success banner shows the board URL as a clickable link
- [ ] Error banner shows the error message and offers a "Go back" button
- [ ] "Build another board" resets the form to step 1

### Phase 3 gate

- [ ] `docker compose up --build` starts without errors
- [ ] `http://localhost:8000` loads the UI
- [ ] A full end-to-end board build works through the Docker container

---

## Code Style Reminders for This Feature

All rules from `CLAUDE.md` and `.claude/rules/` apply. Key ones for this feature:

- Every `.py` file: module docstring first, then `from __future__ import annotations`
- Google-style docstrings on all public classes, functions, and methods
- `pathlib.Path` for all file I/O (see `_WebConfig.__init__` above)
- Logger calls: `logger.info("msg {}", value)` -- never f-strings in logger calls
- Exception chaining: `raise AppException("...", original=e) from e`
- ASCII only in all files (no em dashes, curly quotes, Unicode arrows)
- Exception to ASCII rule: `shared/logger.py` icon strings only

HTML file is exempt from Python style rules but must still follow the ASCII-only rule.

---

## Branch Name

```
feat/web-ui
```

Commit prefix for all commits on this branch: `🌱 feat:`
