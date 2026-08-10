# Project Progress & Resume Guide

Last updated: 2026-08-10

---

## Where You Are

Branch: `refactor/repo-restructure` (1 commit ahead of `main`, pushed to remote, clean tree)

The single commit on this branch is documentation only -- `docs/api.md` was created and
`docs/restructuring-plan.md` was fully written out with a 10-task breakdown. No code has
been moved or changed yet.

---

## What Was Done (before the break)

### Completed features (all merged to main)

| Area | What was built |
|------|----------------|
| CLI pipeline | `main.py` -> `core/` -> `utils/` -> `shared/` -- full board-building pipeline |
| FastAPI backend | `web/app.py` with 8 routes including SSE log streaming |
| React frontend | `web/ui/` -- React 19 + TypeScript + Vite 6 + Tailwind CSS v4, 4-step wizard |
| Docker support | `Dockerfile` + `docker-compose.yaml` -- run everything from one command |
| Tests | `tests/test_config_loader.py` + `tests/test_input_loader.py` |
| AI stub | `web/gemini_service.py` -- placeholder that returns dummy strings |
| Docs | `docs/api.md`, `docs/settings-reference.md`, `docs/restructuring-plan.md` |

### What this branch was opened for

The repo evolved from a CLI tool into a full web app, but the folder layout still reflects
the order things were built rather than the architecture that exists now. This branch is
for a structural cleanup -- no new features, no behavior changes.

See `docs/restructuring-plan.md` for the full plan (10 tasks, import path table,
pydantic-settings pattern, impact notes).

---

## Current Folder Layout (OLD -- not restructured yet)

```
trello-board-builder/
+-- web/                   <- FastAPI app + React frontend nested inside
|   +-- app.py
|   +-- schemas.py
|   +-- pipeline_runner.py
|   +-- gemini_service.py  <- AI stub (misleading name, wrong location)
|   +-- templates/
|   +-- ui/                <- React 19 + Vite source
+-- core/                  <- Trello service layer (will move to backend/services/)
+-- utils/                 <- Config + input helpers (will move to backend/utils/)
+-- shared/                <- Logger + exceptions (stays at root, no change needed)
+-- main.py
```

---

## Target Folder Layout (after restructure)

```
trello-board-builder/
+-- frontend/              <- React 19 + TypeScript (moved from web/ui/)
+-- backend/               <- FastAPI app
|   +-- services/          <- Trello logic (moved from core/)
|   +-- utils/             <- Helpers (moved from utils/)
+-- agents/                <- AI integration (stub moved from web/gemini_service.py)
+-- shared/                <- Unchanged
+-- main.py                <- Unchanged (imports updated)
```

---

## The 10-Task Checklist

- [ ] Task 1: Move `web/ui/` -> `frontend/`, update Vite `outDir`
- [ ] Task 2: Create `backend/` package, move `web/app.py`, `schemas.py`, `pipeline_runner.py`, `templates/`
- [ ] Task 3: Move `core/` -> `backend/services/`, update all imports from `core.` to `backend.services.`
- [ ] Task 4: Move `utils/` -> `backend/utils/`, add `pydantic-settings`, create `backend/utils/settings.py`
- [ ] Task 5: Keep `shared/` at root -- no changes needed
- [ ] Task 6: Create `agents/` package, move `web/gemini_service.py` -> `agents/ai_service.py`, rename class, add `agents/settings.py`, add `agents/README.md`
- [ ] Task 7: Update `main.py` imports (`utils.` -> `backend.utils.`, `core.` -> `backend.services.`)
- [ ] Task 8: Update `tests/` imports (`utils.` -> `backend.utils.`)
- [ ] Task 9: Add per-package README files (`backend/README.md`, `frontend/README.md`)
- [ ] Task 10: Update `CLAUDE.md`, `README.md`, `justfile`, `Dockerfile`, `docker-compose.yaml`, `.gitignore`, `docs/`

### Things to watch on Task 10

- `justfile` `serve` recipe: `web.app:app` -> `backend.app:app`
- `justfile` `build-ui` recipe: `cd web/ui` -> `cd frontend`
- `Dockerfile` CMD: `web.app:app` -> `backend.app:app`
- `docker-compose.yaml`: remove `GEMINI_API_KEY`, add Azure OpenAI placeholders
- `.gitignore`: `web/static/` -> `backend/static/`
- `docs/api.md` already documents routes as `/api/ai/` but live code still uses `/api/gemini/` -- the rename happens as part of Task 6
- `pydantic-settings` is not yet in `pyproject.toml` -- `uv add pydantic-settings` is part of Task 4

---

## Known Inconsistencies Right Now

These exist between the plan docs and the live code -- expected, not broken:

| File | Stale reference |
|------|----------------|
| `CLAUDE.md` | Module paths (`web/app.py`, `core/`, `utils/`) -- reflects old layout |
| `README.md` | Commands reference `web/ui/`, `cd web/ui && npm run dev` |
| `Dockerfile` | CMD uses `web.app:app` |
| `docker-compose.yaml` | References `GEMINI_API_KEY` |
| `docs/api.md` | Documents `/api/ai/` routes but live code uses `/api/gemini/` |

---

## How to Run the Website Right Now (with Docker)

The website is fully working in the current layout -- Docker runs it fine before any restructure.

```powershell
# Step 1: build the React frontend (required before Docker image build)
just build-ui

# Step 2: build and start the Docker container
docker compose up --build

# Open in browser
# http://localhost:8000
```

To stop it: `docker compose down` (or Ctrl+C then `docker compose down`).

If you just want to check the backend is alive without rebuilding: `docker compose up`
(skips the image rebuild if nothing changed in Python files or Dockerfile).

### Dev mode (no Docker -- faster iteration)

```powershell
# Terminal 1 -- FastAPI backend with hot reload
just serve

# Terminal 2 -- Vite dev server (proxies /api to :8000)
cd web/ui
npm run dev
```

Open `http://localhost:5173` for the Vite dev server (live reload on React changes).
Open `http://localhost:8000` after `just build-ui` if you want the production build served by FastAPI.

---

## Recommended Next Step

Start with Task 1 (moving `web/ui/` to `frontend/`) -- it is self-contained and easy to
verify. Run `just build-ui` after the move to confirm the build still works, then run
Docker to confirm the full stack still serves correctly before moving on to Task 2.

The full import path reference table is in `docs/restructuring-plan.md`.
