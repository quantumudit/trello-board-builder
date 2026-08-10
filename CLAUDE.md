# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```powershell
# Install dependencies (first time or after pulling)
uv sync

# Run the board builder (default config)
just run

# Run with a custom config file
just run-config config/my_other_board.yaml

# Run with a custom .env file
uv run python main.py --env .env.prod

# Lint and format
just lint      # ruff check only
just format    # ruff format only
just check     # lint + format together

# Run tests
uv run pytest
uv run pytest tests/test_config_loader.py        # single file
uv run pytest -m "not slow"                      # skip slow tests
uv run pytest -m "not integration"               # skip tests that call Trello

# Web UI
just serve        # start FastAPI server on :8000 (hot-reload)
just build-ui     # compile React -> backend/static/ + backend/templates/index.html
```

`PYTHONPATH=.` is set automatically by the justfile. When calling `uv run` directly, set it yourself if needed.

## Architecture

`main.py` is a thin orchestrator - it only wires components together and contains no business logic. The pipeline is linear:

```
Config (yaml + .env)
  -> TrelloClient (HTTP auth + rate limiting)
  -> BoardManager.setup() (board/list/label creation, idempotent)
  -> load_cards() (JSON -> normalised dicts)
  -> CardBuilder.build_all() (card + checklist creation)
```

**`backend/utils/config_loader.py`** - single `Config` object imported by everything. All YAML and .env values go through here. Secrets (TRELLO_API_KEY, TRELLO_TOKEN) are read from environment only - never from the YAML.

**`backend/utils/settings.py`** - `BackendSettings(BaseSettings)` for type-safe Trello secret loading via pydantic-settings.

**`backend/services/trello_client.py`** - the only module that touches `requests`. All Trello REST calls funnel through `TrelloClient.request()`, which injects auth, sleeps for rate limiting, and raises `AppException` on non-2xx.

**`backend/services/board_manager.py`** - idempotent setup: checks for existing boards, lists, and labels before creating. Populates `board_id`, `list_ids`, and `label_ids` on itself after `setup()` is called. CardBuilder reads these attributes directly.

**`backend/services/card_builder.py`** - consumes normalised card dicts from `input_loader`. Resolves list and label names to Trello IDs via BoardManager's lookup dicts.

**`shared/logger.py` / `shared/exceptions.py`** - imported directly by all modules (`from shared.logger import logger`, `from shared.exceptions import AppException`). Do not call `logging.basicConfig()` or configure logging inline anywhere else.

**`backend/app.py`** - FastAPI application. 8 routes: `GET /`, `POST /api/validate-json`, `POST /api/build`, `GET /api/status/{job_id}` (SSE), `POST /api/ai/generate-board`, `POST /api/ai/refactor-description`, `GET /api/config/credentials`. Start with `just serve`.

**`backend/schemas.py`** - all Pydantic v2 models for the API. `RunConfig` includes `lists: list[str]` (spec gap fix - required for `_WebConfig` to pass list names to `BoardManager`).

**`backend/pipeline_runner.py`** - wraps the backend/services/ pipeline in a background thread. Uses `_WebConfig(Config)` subclass to bypass file-based config loading. In-memory `queue.Queue` per job feeds the SSE log stream.

**`agents/ai_service.py`** - no-op stub. Returns placeholder strings. Will be replaced with LangGraph + LiteLLM + Azure OpenAI. Do not invest time improving this file.

**`agents/settings.py`** - `AgentSettings(BaseSettings)` covering Azure OpenAI secrets. Values are empty until the real implementation lands.

**`frontend/`** - React 19 + TypeScript + Vite 6 + Tailwind CSS v4 frontend source. `npm run dev` starts Vite on :5173 (proxies `/api` to :8000). `npm run build` compiles to `backend/static/` (assets) and `backend/templates/index.html`.

## Config and Data Files

- `config/settings.yaml` - all board config (name, lists, labels, input path). No secrets.
- `.env` - secrets only. Copy from `.env.example` and fill in `TRELLO_API_KEY` and `TRELLO_TOKEN`.
- `inputs/cards.json` - card definitions. Top-level JSON array; objects with `_comment` or `_rules` keys are skipped automatically.

## Code Conventions

These rules are enforced by `.claude/rules/` and the ruff hook:

- **ASCII only** in all source files. No em dashes (`-` or `--` instead), no curly quotes, no Unicode arrows (`->` instead of `>`). Exception: `shared/logger.py` icon strings passed to `logger.level()` may use Unicode.
- **`from __future__ import annotations`** at the top of every `.py` file, placed after the module docstring.
- **Module docstrings** - 1 to 3 sentences, single paragraph. No filename headers, no feature lists.
- **Google-style docstrings** on all public classes, functions, and methods. Class docstrings go on the class, not on `__init__`. Private (`_prefixed`) helpers may use a single-line docstring.
- **`pathlib.Path`** for all file I/O. Use `path.open()` not `open(path, ...)`.
- **Logger calls** use `{}` format (loguru style), never f-strings: `logger.info("msg {}", value)`.
- **Exception chaining** - always use `raise AppException(..., original=e) from e` when wrapping a caught exception.
- **Package management** - `uv add <package>` to add dependencies, `uv run python` to execute. Never bare `pip install` or `python`.
- **Tests** live in `tests/` at the project root, one file per source module (`test_config_loader.py`, etc.).
