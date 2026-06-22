# trello-board-builder

Populate a Trello board from a JSON file. Define your lists, labels, and cards once in config - run the script, board is ready.

---

## Features

- Creates the board, lists, and labels automatically if they don't exist
- Idempotent - running twice won't duplicate lists or labels
- Supports cards with descriptions, labels, due dates, and checklists
- All board structure configured in `config/settings.yaml`; no code changes needed for a new board

---

## Prerequisites

- Python 3.12+
- [uv](https://docs.astral.sh/uv/) - package manager
- [just](https://just.systems/) - task runner
- A Trello account with an API key and token (see below)

---

## Setup

```bash
# 1. Install dependencies
uv sync

# 2. Copy the secrets template and fill it in
cp .env.example .env
```

`.env` should contain:

```
TRELLO_API_KEY=your_api_key_here
TRELLO_TOKEN=your_token_here
```

> See [Getting Trello API Credentials](#getting-trello-api-credentials) below.

---

## Configuration

All board settings live in `config/settings.yaml`:

```yaml
board:
  name: "My Board"
  permission_level: "private"   # private | org | public

lists:
  - "Backlog"
  - "To Do"
  - "In Progress"
  - "Done"

labels:
  - name: "High"
    color: "red"
  - name: "Medium"
    color: "yellow"

input:
  format: "json"
  file_path: "inputs/cards.json"
```

See [`docs/settings-reference.md`](docs/settings-reference.md) for all available fields and more examples.

---

## Preparing Your Cards

Edit `inputs/cards.json`. Each object becomes one Trello card:

```json
[
  {
    "list_name":   "To Do",
    "card_title":  "Set up CI pipeline",
    "description": "Configure GitHub Actions for lint and test.",
    "labels":      ["High"],
    "due_date":    "2025-08-01",
    "checklist": {
      "title": "Steps",
      "items": ["Add workflow file", "Set secrets", "Verify on push"]
    }
  }
]
```

Only `list_name` and `card_title` are required. All other fields are optional.

---

## Running

```bash
just run                                      # default config
just run-config config/my_other_board.yaml    # custom config file
uv run python main.py --env .env.prod         # custom .env file
```

---

## Web UI

A browser-based wizard for building boards without touching the CLI.

### Development mode (two terminals)

```bash
# Terminal 1 -- FastAPI backend with hot reload
just serve

# Terminal 2 -- Vite dev server (proxies /api to :8000)
cd web/ui && npm run dev
```

Open http://localhost:5173. The UI proxies all `/api` calls to the FastAPI server.

### Production mode (single server)

```bash
just build-ui   # compile React -> web/static/ and web/templates/
just serve      # serve everything from http://localhost:8000
```

### Docker

```bash
just build-ui                # build React frontend first (no Node.js in image)
docker compose up --build    # build image and start container
```

Open http://localhost:8000. Credentials are read from the host `.env` via docker-compose.

---

## Testing

```bash
uv run pytest                                        # full suite
uv run pytest tests/test_config_loader.py            # single file
uv run pytest -m "not integration"                   # skip tests that call Trello
```

---

## Code Quality

```bash
just lint      # ruff check
just format    # ruff format
just check     # lint + format together
```

---

## Getting Trello API Credentials

1. Go to [trello.com/power-ups/admin](https://trello.com/power-ups/admin)
2. Click **New Power-Up** -> fill any name -> Create
3. Click the **API Key** tab -> copy your key
4. Click the **Token** link on that page -> Allow -> copy your token
5. Paste both into `.env`

---

## Multiple Boards

Each board gets its own config file and input file:

```bash
cp config/settings.yaml config/my_other_board.yaml
# edit config/my_other_board.yaml -> update board.name, lists, labels, input.file_path
# create the corresponding inputs file

just run-config config/my_other_board.yaml
```

---

## Docs

| File | Contents |
|---|---|
| [`docs/project-architecture.md`](docs/project-architecture.md) | Folder structure, data flow, design principles |
| [`docs/settings-reference.md`](docs/settings-reference.md) | Full field reference + config examples |
