# API Reference

Base URL (local): `http://localhost:8000`

Interactive docs (requires server running):
- Swagger UI: `http://localhost:8000/docs`
- ReDoc: `http://localhost:8000/redoc`
- OpenAPI JSON: `http://localhost:8000/openapi.json`

---

## Endpoints

### POST /api/validate-json

Validates an uploaded cards JSON file and extracts metadata.

**Request** -- `multipart/form-data`

| Field | Type | Required | Description |
|---|---|---|---|
| `file` | file | yes | A `.json` file, max 1 MB |

**Response 200** -- `application/json`

```json
{
  "valid": true,
  "card_count": 8,
  "labels": [
    { "name": "Easy", "default_color": "green" },
    { "name": "Hard", "default_color": "red" }
  ],
  "lists": ["Week 1", "Week 2", "Week 3"],
  "error": null
}
```

| Field | Type | Description |
|---|---|---|
| `valid` | bool | `false` if parsing failed |
| `card_count` | int | Number of non-comment card objects |
| `labels` | array | Unique label names + colors from `config/settings.yaml` |
| `lists` | array | Unique list names in order of first appearance |
| `error` | string or null | Human-readable error message when `valid` is `false` |

**Validation errors returned as `valid: false` (not 4xx):**
- File is not `.json`
- File exceeds 1 MB
- Content is not valid JSON
- Top-level JSON is not an array
- No card objects found after filtering comment entries

**curl example:**
```bash
curl -X POST http://localhost:8000/api/validate-json \
  -F "file=@inputs/cards.json"
```

---

### POST /api/build

Starts the board-building pipeline in a background thread.

**Request** -- `application/json`

```json
{
  "api_key": "your_trello_api_key",
  "token": "your_trello_token",
  "board_name": "My Project Board",
  "board_description": "Sprint planning board.",
  "permission_level": "private",
  "create_if_not_exists": true,
  "lists": ["Backlog", "In Progress", "Done"],
  "labels": [
    { "name": "Easy", "color": "green" },
    { "name": "Hard", "color": "red" }
  ],
  "cards": [
    {
      "list_name": "Backlog",
      "card_title": "Set up CI pipeline",
      "description": "Configure GitHub Actions.",
      "labels": ["Easy"],
      "due_date": "2025-08-01",
      "checklist": {
        "title": "Steps",
        "items": ["Add workflow", "Set secrets"]
      }
    }
  ]
}
```

| Field | Type | Required | Validation |
|---|---|---|---|
| `api_key` | string | yes | Non-empty |
| `token` | string | yes | Non-empty |
| `board_name` | string | yes | Non-empty |
| `board_description` | string | no | Defaults to `""` |
| `permission_level` | string | no | `private` / `org` / `public`. Defaults to `private` |
| `create_if_not_exists` | bool | no | Defaults to `true` |
| `lists` | array of strings | yes | |
| `labels` | array of objects | yes | Each `color` must be a valid Trello color (see below) |
| `cards` | array of objects | yes | Each card must have `list_name` and `card_title` |

**Valid Trello colors:**
`green` `yellow` `orange` `red` `purple` `blue` `sky` `lime` `pink` `black`

**Response 200** -- `application/json`

```json
{
  "job_id": "a3f1c2d4-...",
  "message": "Build started."
}
```

Use `job_id` to stream logs via `GET /api/status/{job_id}`.

**Response 422** -- Pydantic validation error (malformed request body).

**curl example:**
```bash
curl -X POST http://localhost:8000/api/build \
  -H "Content-Type: application/json" \
  -d '{"api_key":"x","token":"y","board_name":"Test","lists":["A"],"labels":[],"cards":[]}'
```

---

### GET /api/status/{job_id}

Streams live log output for a running build via Server-Sent Events (SSE).

**Path parameter:** `job_id` -- UUID returned by `POST /api/build`

**Response 200** -- `text/event-stream`

Each log line is emitted as a `message` event:
```
data: 10:42:01 | INFO    | Creating board "My Project Board"

data: 10:42:02 | INFO    | Creating list "Backlog"
```

A heartbeat comment is sent every 100ms while waiting for the next log line:
```
: heartbeat
```

When the job finishes a `done` event is emitted with a JSON payload:
```
event: done
data: {"status": "success", "board_url": "https://trello.com/b/abc123/my-board", "message": null}
```

On failure:
```
event: done
data: {"status": "error", "board_url": null, "message": "AppException: ..."}
```

| `done` field | Type | Description |
|---|---|---|
| `status` | string | `success` or `error` |
| `board_url` | string or null | Trello board URL on success |
| `message` | string or null | Error message on failure |

**Response 404** -- `job_id` not found.

**curl example:**
```bash
curl -N http://localhost:8000/api/status/a3f1c2d4-...
```

---

### POST /api/ai/generate-board

Generates a suggested board name and description based on the uploaded cards and lists.

> **Note:** This endpoint is currently a stub. It returns placeholder text and makes
> no external API calls. The real implementation (LangGraph + LiteLLM + Azure OpenAI)
> is tracked in `agents/`.

**Request** -- `application/json`

```json
{
  "cards": [{ "card_title": "...", "list_name": "..." }],
  "lists": ["Backlog", "In Progress", "Done"]
}
```

**Response 200** -- `application/json`

```json
{
  "board_name": "Project Board",
  "board_description": "AI-generated board details coming soon."
}
```

**Response 503** -- AI service not configured (missing API key).

**Response 500** -- AI service error.

---

### POST /api/ai/refactor-description

Rewrites a board description for clarity and conciseness.

> **Note:** Stub endpoint -- returns the original description unchanged until the
> real AI backend is implemented.

**Request** -- `application/json`

```json
{
  "description": "This board is for tracking all of the work items..."
}
```

**Response 200** -- `application/json`

```json
{
  "refactored": "This board is for tracking all of the work items..."
}
```

**Response 503** -- AI service not configured.

**Response 500** -- AI service error.

---

### GET /api/config/credentials

Returns Trello credentials loaded from the server environment.

> **Warning:** Only safe for local or self-hosted deployments. Never expose this
> endpoint on a public-facing server.

**Response 200** -- `application/json`

```json
{
  "apiKey": "your_trello_api_key",
  "token": "your_trello_token"
}
```

Values are empty strings if the corresponding environment variables are not set.

**curl example:**
```bash
curl http://localhost:8000/api/config/credentials
```

---

## Common HTTP Status Codes

| Code | Meaning |
|---|---|
| 200 | Success |
| 404 | Job ID not found (`/api/status/{job_id}`) |
| 422 | Request body failed Pydantic validation |
| 500 | Unexpected server error |
| 503 | AI service not configured |

---

## Notes

- All `POST` endpoints that accept JSON require `Content-Type: application/json`.
- `POST /api/validate-json` uses `multipart/form-data`, not JSON.
- Card objects in `inputs/cards.json` with a `_comment` or `_rules` key are
  silently skipped by the validator and never included in `card_count`.
- The AI routes will be renamed from `/api/gemini/` to `/api/ai/` as part of
  the repo restructuring (tracked in `docs/restructuring-plan.md`).
