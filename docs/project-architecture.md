# trello-board-builder - Architecture & Design
### Modular, config-driven Trello board creation from JSON

---

## Folder Structure

```
trello-board-builder/
│
├── main.py                         # Entry point -- wires everything together
├── pyproject.toml                  # Project metadata and dependencies (managed by uv)
├── uv.lock                         # Locked dependency versions
├── justfile                        # Task runner -- run, lint, format, check
├── logger.py                       # Loguru-based console + file logger
├── exceptions.py                   # AppException + catch utilities
├── .env                            # Secrets (never commit) — gitignored
├── .env.example                    # Secrets template — commit this
├── .gitignore
│
├── config/
│   └── settings.yaml               # All board config: name, lists, labels,
│                                   # input path. No secrets here.
│
├── core/                           # Business logic — pure Trello operations
│   ├── __init__.py
│   ├── trello_client.py            # Thin HTTP wrapper (auth, rate limit, errors)
│   ├── board_manager.py            # Board / list / label setup (idempotent)
│   └── card_builder.py             # Card + checklist creation
│
├── utils/                          # Cross-cutting utilities
│   ├── __init__.py
│   ├── config_loader.py            # Loads settings.yaml + .env → Config object
│   └── input_loader.py             # JSON → normalised card dicts
│
├── inputs/
│   └── cards.json                  # Card data — edit this to populate your board
│
├── docs/
│   ├── project-architecture.md     # This file
│   └── settings-reference.md       # Field reference + config examples
│
└── logs/                           # Log output (gitignored)
```

---

## Design Principles

### Single Responsibility
| File | Does exactly one thing |
|---|---|
| `trello_client.py` | HTTP - nothing else |
| `board_manager.py` | Board / list / label setup - nothing else |
| `card_builder.py` | Card + checklist creation - nothing else |
| `config_loader.py` | Config resolution - nothing else |
| `input_loader.py` | JSON parsing + normalisation - nothing else |
| `logger.py` | Logging setup - nothing else |
| `exceptions.py` | Exception utilities - nothing else |
| `main.py` | Wiring - nothing else |

### Idempotency
- `board_manager.py` checks for existing boards, lists, and labels before creating
- Running the script twice will not duplicate lists or labels
- Cards are not deduplicated (Trello has no natural unique key for cards) - design your input to avoid re-runs on a populated board, or add a dedup check by card title

### Separation of Concerns
```
Secrets      →  .env only
Config       →  config/settings.yaml only
Data         →  inputs/cards.json
Logic        →  core/
Utilities    →  utils/
Logging      →  logger.py + exceptions.py
Entry point  →  main.py only
Docs         →  docs/
```

---

## Data Flow

```
.env  ─────────────────────────────────┐
                                       ▼
config/settings.yaml  ──────▶  Config (utils/config_loader.py)
                                       │
                         ┌─────────────┴─────────────┐
                         ▼                           ▼
                   TrelloClient               InputLoader
                (core/trello_client)       (utils/input_loader)
                         │                           │
                         ▼                           │
                   BoardManager  ◀───────────────────┘
                (core/board_manager)    normalised card dicts
                  creates board,
                  lists, labels
                         │
                         ▼
                   CardBuilder
                (core/card_builder)
                  creates cards +
                  checklists

logger.py + exceptions.py  →  imported by all modules directly
```

---

## Config Controls Everything

### Switching to a custom column layout
```yaml
lists:
  - "Backlog"
  - "To Do"
  - "In Progress"
  - "In Review"
  - "Done"
```

### Adding a second board
Duplicate `settings.yaml` -> update `board.name`, `lists`, `labels`, `input.file_path`.

```bash
just run-config config/my_other_board.yaml
```

### Changing board visibility
```yaml
board:
  permission_level: "org"     # private | org | public
```

---

## Input File Schema

Cards are defined in `inputs/cards.json` as a top-level JSON array.
All fields except `list_name` and `card_title` are optional.

```json
[
  {
    "list_name":   "In Progress",
    "card_title":  "Card title here",
    "description": "Optional description.\nSupports line breaks.",
    "labels":      ["High"],
    "due_date":    "2025-08-01",
    "checklist": {
      "title": "Tasks",
      "items": ["Step one", "Step two", "Step three"]
    }
  }
]
```

Objects with a `_comment` or `_rules` key are skipped automatically.
See `settings-reference.md` for the full field reference and more examples.

---

## Running the Project

### Setup

```bash
# Install dependencies (uv manages the virtual environment automatically)
uv sync

# Copy and fill in secrets
cp .env.example .env   # then paste TRELLO_API_KEY and TRELLO_TOKEN
```

### Running

```bash
just run                                      # run with default config
just run-config config/my_other_board.yaml    # run with a custom config
uv run python main.py --env .env.prod         # run with a custom .env
```

### Code Quality

```bash
just lint      # ruff check  — lint the codebase
just format    # ruff format — format the codebase
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

## Extending the Project

### Add a second board
1. Copy `config/settings.yaml` -> `config/my_other_board.yaml`
2. Update `board.name`, `lists`, `labels`, `input.file_path`
3. Create the corresponding input file under `inputs/`
4. Run: `just run-config config/my_other_board.yaml`

### Add card position control
Add a `position` field to each card object in `cards.json`.
Pass it as `pos` in `CardBuilder._create_card()`.

### Add member assignment
Add an `assignee` field to the card schema.
Resolve Trello member IDs via `GET /members/{username}` in `TrelloClient`.
Pass `idMembers` in the card creation params in `CardBuilder._create_card()`.

---

## File Responsibilities at a Glance

```
main.py                      Wire and run
justfile                     Task runner — run, lint, format, check
logger.py                    Loguru console + file logger
exceptions.py                AppException + catch utilities
config/settings.yaml         All configuration (no secrets)
.env                         Secrets only (never commit)
.env.example                 Secrets template (commit this)

core/
  trello_client.py           HTTP layer — auth, rate limit, error handling
  board_manager.py           Board + list + label setup, idempotent
  card_builder.py            Card + checklist creation

utils/
  config_loader.py           Single Config object consumed by everything
  input_loader.py            JSON → normalised card dicts

inputs/
  cards.json                 Card data for the board

docs/
  project-architecture.md   This file
  settings-reference.md     Field reference + config examples

logs/                        Log output (gitignored)
```
