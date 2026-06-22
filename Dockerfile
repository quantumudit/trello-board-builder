# Run `just build-ui` before building this image (no Node.js in image).
# The built frontend must exist at web/static/assets/ and web/templates/index.html
# before running `docker compose up --build`.

FROM python:3.12-slim

WORKDIR /app

# Install uv
COPY --from=ghcr.io/astral-sh/uv:latest /uv /uvx /usr/local/bin/

# Install dependencies (cached layer -- only rebuilds when pyproject.toml or uv.lock changes)
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev

# Copy application source
COPY . .

EXPOSE 8000

CMD ["uv", "run", "uvicorn", "web.app:app", "--host", "0.0.0.0", "--port", "8000"]
