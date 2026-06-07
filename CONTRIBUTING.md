# Contributing to trello-board-builder

This is a solo project, but if you find an issue or have suggestions, feel free to open an issue or pull request.

## Setup for Local Development

1. Fork and clone the repo
2. Install dependencies: `uv sync`
3. Copy secrets template: `cp .env.example .env` and fill in your Trello credentials
4. Create a new branch: `git checkout -b fix/your-feature-name`
5. Make your changes
6. Run checks: `just check` (lint + format) and `uv run pytest`
7. Commit with a clear message and open a pull request

## Commit Message Guidelines

This project uses emoji-prefixed commit messages:

```
<emoji> <type>: <short description>
```

Examples:
- `🌱 feat: add support for card attachments`
- `🐛 fix: handle missing list name gracefully`
- `📝 docs: update settings reference with new fields`
- `🧹 chore: bump dependencies`

Thanks for checking out the project!