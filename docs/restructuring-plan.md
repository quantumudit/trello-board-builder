# Repo Restructuring Plan

## Current State Analysis

TypeScript accounts for 74.6% of the codebase; Python is 24.2%.
The project has evolved from a CLI pipeline tool into a full web application.
The current folder structure reflects the order things were built, not the
architecture that exists today.

**Problems with the current layout:**

- `web/` conflates two unrelated concerns -- it is simultaneously the Python
  FastAPI backend and the parent of the entire React frontend (`web/ui/`).
  These are different stacks and should be peers, not nested.

- `core/` contains the Trello service layer but sits at the project root as
  if it is still the primary concern. It is now a dependency of the FastAPI
  backend, not a first-class citizen.

- `shared/` and `utils/` are an arbitrary split. Logger and exceptions ended
  up in `shared/`; config and input parsing in `utils/`. There is no real
  boundary between them -- everything in both packages is imported identically
  across the codebase. The fix is not to merge them but to clarify what each
  one owns: `shared/` stays as cross-cutting infrastructure (logger,
  exceptions) and `utils/` becomes backend-specific helpers
  (config_loader, input_loader) living inside `backend/`.

- `web/gemini_service.py` is a stub for Azure OpenAI sitting inside the web
  package with a misleading name. There is no dedicated home for AI work.

- Secrets are loaded via scattered `os.getenv()` calls. A `pydantic-settings`
  `BaseSettings` model per package gives type-safe, validated env loading and
  removes the need for manual `.env` parsing.

---

## Proposed Folder Structure

```
trello-board-builder/
|
+-- frontend/                        # React 19 + TypeScript (moved from web/ui/)
|   +-- src/
|   |   +-- App.tsx
|   |   +-- api/
|   |   +-- components/
|   |   +-- types.ts
|   |   +-- utils/
|   +-- index.html
|   +-- package.json
|   +-- tsconfig.json
|   +-- vite.config.ts
|
+-- backend/                         # FastAPI Python application
|   +-- __init__.py
|   +-- app.py                       # FastAPI app + route wiring
|   +-- schemas.py                   # Pydantic v2 models
|   +-- pipeline_runner.py           # Background thread runner
|   +-- templates/                   # Jinja2-served index.html (build output)
|   +-- static/                      # Compiled React assets (gitignored)
|   |
|   +-- services/                    # Trello business logic (was core/)
|   |   +-- __init__.py
|   |   +-- trello_client.py
|   |   +-- board_manager.py
|   |   +-- card_builder.py
|   |
|   +-- utils/                       # Backend-specific helpers only
|       +-- __init__.py
|       +-- config_loader.py         # reads config/settings.yaml
|       +-- input_loader.py          # parses inputs/cards.json
|       +-- settings.py              # pydantic-settings for Trello + app secrets
|
+-- agents/                          # AI agentic integration
|   +-- __init__.py
|   +-- ai_service.py                # stub (was web/gemini_service.py, renamed)
|   +-- settings.py                  # pydantic-settings for Azure OpenAI secrets
|   +-- README.md                    # LangGraph + LiteLLM + Azure OpenAI plan
|
+-- shared/                          # Cross-cutting infrastructure (stays at root)
|   +-- __init__.py
|   +-- logger.py                    # imported by backend/, agents/, tests/, main.py
|   +-- exceptions.py                # same
|
+-- tests/                           # Unchanged
+-- config/                          # Unchanged
+-- inputs/                          # Unchanged
+-- docs/
|   +-- api.md                       # API reference (all endpoints, schemas, examples)
|   +-- settings-reference.md        # config/settings.yaml field reference
|   +-- restructuring-plan.md        # this file
+-- main.py                          # CLI entry point (thin wrapper, stays at root)
+-- Dockerfile
+-- docker-compose.yaml
+-- justfile
```

---

## Dependency Flow

Nothing imports upward. `shared/` is a leaf with no internal dependencies.

```
shared/  <--  backend/   <--  main.py
              agents/    <--  backend/app.py  (future AI integration)
```

---

## Task Breakdown

### 1. Move React frontend

- Move `web/ui/` -> `frontend/`
- Update `frontend/vite.config.ts`: change `outDir` from `../static` to
  `../backend/static`
- Update `justfile` `build-ui` recipe: `cd frontend` and move `index.html`
  to `backend/templates/`

### 2. Restructure Python backend

- Create `backend/` package with `__init__.py`
- Move `web/app.py` -> `backend/app.py`
- Move `web/schemas.py` -> `backend/schemas.py`
- Move `web/pipeline_runner.py` -> `backend/pipeline_runner.py`
- Move `web/templates/` -> `backend/templates/`
- Delete empty `web/` package
- Update `justfile` `serve` recipe: `uvicorn backend.app:app`
- Update `Dockerfile` copy paths

### 3. Promote `core/` to `backend/services/`

- Move `core/trello_client.py` -> `backend/services/trello_client.py`
- Move `core/board_manager.py` -> `backend/services/board_manager.py`
- Move `core/card_builder.py` -> `backend/services/card_builder.py`
- Delete empty `core/` package
- Update all imports: `from core.` -> `from backend.services.`

### 4. Move `utils/` into `backend/utils/` and add pydantic-settings

- Move `utils/config_loader.py` -> `backend/utils/config_loader.py`
- Move `utils/input_loader.py` -> `backend/utils/input_loader.py`
- Delete empty `utils/` package
- Update all imports: `from utils.` -> `from backend.utils.`
- Create `backend/utils/settings.py` with a `BackendSettings(BaseSettings)` model
  covering `TRELLO_API_KEY` and `TRELLO_TOKEN`
- Replace all `os.getenv("TRELLO_API_KEY", ...)` calls in `backend/` with
  the new settings model
- Add `pydantic-settings` to `pyproject.toml` via `uv add pydantic-settings`

### 5. Keep `shared/` at the root -- no rename, no move

- `shared/logger.py` and `shared/exceptions.py` stay where they are
- Both `backend/` and `agents/` continue to import from `shared/` as today
- No import changes needed for anything that already uses `shared/`

### 6. Create `agents/` module

- Create `agents/` package with `__init__.py`
- Move `web/gemini_service.py` -> `agents/ai_service.py`
- Rename class `GeminiService` -> `AIService`; remove all Gemini references
- Update import in `backend/app.py`
- Create `agents/settings.py` with an `AgentSettings(BaseSettings)` model
  covering Azure OpenAI secrets (`AZURE_OPENAI_API_KEY`, `AZURE_OPENAI_ENDPOINT`,
  `AZURE_OPENAI_DEPLOYMENT`, etc.) -- values can be empty strings until the
  real implementation lands
- Add `agents/README.md` describing the planned LangGraph + LiteLLM +
  Azure OpenAI integration
- Add Azure OpenAI env var placeholders to `.env.example`

### 7. Update `main.py` CLI entry point

- Update imports: `from utils.` -> `from backend.utils.`
- Update imports: `from core.` -> `from backend.services.`
- `from shared.` imports are unchanged

### 8. Update tests

- Update imports in `tests/`: `from utils.` -> `from backend.utils.`
- `from shared.` imports are unchanged

### 9. Add per-package README files

Each top-level package gets its own `README.md` covering what the package
does, how to run it, and what env vars or config it needs.

- Create `backend/README.md`
  - Purpose: FastAPI web server wrapping the Trello pipeline
  - How to run: `just serve` (production), `uvicorn backend.app:app --reload` (dev)
  - Env vars: `TRELLO_API_KEY`, `TRELLO_TOKEN` (via `backend/utils/settings.py`)
  - Package structure: brief description of `app.py`, `schemas.py`,
    `pipeline_runner.py`, `services/`, `utils/`

- Create `frontend/README.md`
  - Purpose: React 19 + TypeScript web UI
  - How to run: `npm run dev` (Vite dev server on :5173, proxies `/api` to :8000)
  - How to build: `just build-ui` (compiles to `backend/static/`)
  - Tech stack: React 19, TypeScript, Vite 6, Tailwind CSS v4

- `agents/README.md` (already planned in task 6)
  - Purpose: AI agentic integration placeholder
  - Planned stack: LangGraph + LiteLLM + Azure OpenAI
  - Env vars: `AZURE_OPENAI_API_KEY`, `AZURE_OPENAI_ENDPOINT`,
    `AZURE_OPENAI_DEPLOYMENT` (via `agents/settings.py`)

### 10. Update docs and config

- Write `docs/project-architecture.md` -- new folder structure diagram and
  module path references reflecting the restructured layout
- Update `docs/api.md` -- rename `/api/gemini/` routes to `/api/ai/`
- Update `CLAUDE.md` -- Architecture section (all module paths)
- Update `README.md` -- commands and paths that reference `web/ui/` or `web/`
- Update `.gitignore` -- `web/static/` -> `backend/static/`
- Verify `pyproject.toml` -- no hardcoded paths that need updating

---

## Import Path Changes (reference)

| Old import | New import |
|---|---|
| `from core.trello_client import TrelloClient` | `from backend.services.trello_client import TrelloClient` |
| `from core.board_manager import BoardManager` | `from backend.services.board_manager import BoardManager` |
| `from core.card_builder import CardBuilder` | `from backend.services.card_builder import CardBuilder` |
| `from utils.config_loader import Config` | `from backend.utils.config_loader import Config` |
| `from utils.input_loader import load_cards` | `from backend.utils.input_loader import load_cards` |
| `from web.gemini_service import GeminiService` | `from agents.ai_service import AIService` |
| `from web.pipeline_runner import ...` | `from backend.pipeline_runner import ...` |
| `from web.schemas import ...` | `from backend.schemas import ...` |
| `from shared.logger import logger` | unchanged |
| `from shared.exceptions import AppException` | unchanged |

---

## pydantic-settings Pattern (reference)

```python
# backend/utils/settings.py
from pydantic_settings import BaseSettings, SettingsConfigDict

class BackendSettings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")

    trello_api_key: str = ""
    trello_token: str = ""

# agents/settings.py
from pydantic_settings import BaseSettings, SettingsConfigDict

class AgentSettings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")

    azure_openai_api_key: str = ""
    azure_openai_endpoint: str = ""
    azure_openai_deployment: str = ""
```

Both use `@lru_cache` for a singleton instance and slot into FastAPI's
dependency injection via `Depends(get_settings)`.

---

## Impact Notes

- `PYTHONPATH=.` (set in justfile) continues to work -- all imports remain
  relative to the project root.
- The CLI (`main.py`) and the web server (`backend/app.py`) remain separate
  entry points; only their internal import paths change.
- `shared/` import paths are completely unchanged -- zero churn for anything
  already using logger or exceptions.
- No changes to business logic, API contracts, or frontend behaviour.
- Docker image stays Python-only; only copy paths in `Dockerfile` change.
