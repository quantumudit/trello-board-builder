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

# Run linter
lint:
    uv run ruff check .

# Run formatter
format:
    uv run ruff format .

# Run linter and formatter
check: lint format