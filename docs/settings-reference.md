# settings.yaml - Field Reference & Examples

All board configuration lives in `config/settings.yaml`. Secrets (API key, token) stay in `.env` - never here.

---

## Field Reference

### `trello`

| Field | Type | Description |
|---|---|---|
| `api_base_url` | string | Trello REST API base. Rarely needs changing. |
| `rate_limit_delay_seconds` | float | Pause between API calls. `0.15` is safe; lower if needed. |

### `board`

| Field | Type | Description |
|---|---|---|
| `name` | string | Board title shown in Trello. |
| `description` | string | Board description (optional but useful). |
| `permission_level` | string | `private`, `org`, or `public` |
| `create_if_not_exists` | bool | `true` creates the board if missing. `false` raises `BoardNotFoundError`. |
| `default_lists` | bool | Set to `false` to prevent Trello auto-creating To Do / Doing / Done. |

### `lists`

Ordered list of column names. Left to right order on the board matches top-to-bottom order here.

### `labels`

List of `name` / `color` pairs. Available Trello colors:

`green` · `yellow` · `orange` · `red` · `purple` · `blue` · `sky` · `lime` · `pink` · `black` · `no_color`

### `input`

| Field | Type | Description |
|---|---|---|
| `format` | string | Always `json`. |
| `file_path` | string | Path to the input JSON file, relative to project root. |

---

## Example Configurations

### Standard kanban board

```yaml
board:
  name: "Product Backlog"
  description: "Sprint planning board."
  permission_level: "org"

lists:
  - "Backlog"
  - "To Do"
  - "In Progress"
  - "In Review"
  - "Done"

labels:
  - name: "Bug"
    color: "red"
  - name: "Feature"
    color: "blue"
  - name: "Chore"
    color: "yellow"
```

### Week-based study tracker

```yaml
board:
  name: "DSA Prep — 4 Weeks"
  description: "Arrays & Hashing → Two Pointers → Sliding Window → Stack."

lists:
  - "Week 1 · Jun 7–13 · Arrays & Hashing"
  - "Week 2 · Jun 14–20 · Two Pointers"
  - "Week 3 · Jun 21–27 · Sliding Window"
  - "Week 4 · Jun 28–Jul 4 · Stack & Monotonic Stack"

labels:
  - name: "Easy"
    color: "green"
  - name: "Medium"
    color: "yellow"
  - name: "Hard"
    color: "red"
```

### Multi-board setup

Duplicate `settings.yaml` and point each config at its own input file:

```bash
uv run python main.py --config config/board_a.yaml
uv run python main.py --config config/board_b.yaml
```

---

## Input File Format

Cards are defined as a JSON array in `inputs/cards.json`. All fields except `list_name` and `card_title` are optional.

```json
[
  {
    "list_name":   "In Progress",
    "card_title":  "Set up CI pipeline",
    "description": "Configure GitHub Actions for lint + test.",
    "labels":      ["Feature"],
    "due_date":    "2025-08-01",
    "checklist": {
      "title": "Steps",
      "items": ["Add workflow file", "Set secrets", "Verify on push"]
    }
  }
]
```

Objects with a `_comment` or `_rules` key are skipped automatically - useful for inline schema notes at the top of the file:

```json
[
  { "_comment": "list_name must match a list defined in settings.yaml" },
  {
    "list_name": "Backlog",
    "card_title": "First card"
  }
]
```
