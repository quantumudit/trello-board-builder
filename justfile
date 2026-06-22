set shell := ["pwsh", "-c"]

# Environment variables applied to all recipes
export PYTHONPATH := "."
export PYTHONIOENCODING := "utf-8"

# Default recipe - shows available commands when you run just with no args
default:
    just --list

# Build the Trello board using default config
run:
    uv run python main.py

# Build with a custom config file: just run-config config/my_other_board.yaml
run-config config:
    uv run python main.py --config {{config}}

# Run all tests
test:
    uv run pytest

# Run a specific test file: just test-file tests/test_config_loader.py
test-file file:
    uv run pytest {{file}}

# Run only unit tests (skip integration and slow)
test-unit:
    uv run pytest -m "not integration and not slow"

# Run linter
lint:
    uv run ruff check .

# Run formatter
format:
    uv run ruff format .

# Run linter and formatter
check: lint format

# Start the FastAPI web server (hot-reload, dev mode)
serve:
    uv run uvicorn web.app:app --reload --host 0.0.0.0 --port 8000

# Build the React frontend and wire output into FastAPI static/templates paths
build-ui:
    cd web/ui && npm install && npm run build
    Move-Item -Force -Path "web/static/index.html" -Destination "web/templates/index.html"
