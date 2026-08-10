# agents/

Planned AI integration layer for the Trello Board Builder.

## Current state

`ai_service.py` is a stub. All methods return placeholder strings.
No external API calls are made. The stub preserves the interface that
`backend/app.py` expects so the rest of the app works without real AI.

## Planned implementation

The real implementation will use:

- **LangGraph** -- agentic orchestration (multi-step reasoning, tool calls)
- **LiteLLM** -- unified LLM client with provider-agnostic interface
- **Azure OpenAI** -- model backend (GPT-4o or equivalent)

## Planned capabilities

- `generate_board(cards, lists)` -- analyse the uploaded cards JSON and
  suggest a board name and description that captures the theme of the work.
- `refactor_description(description)` -- rewrite a user-supplied board
  description to be clearer and more professional.

## Environment variables

Add these to `.env` when the real implementation is wired up:

```
AZURE_OPENAI_API_KEY=your_key_here
AZURE_OPENAI_ENDPOINT=https://your-resource.openai.azure.com/
AZURE_OPENAI_DEPLOYMENT=gpt-4o
AZURE_OPENAI_API_VERSION=2024-02-01
```

These are already declared in `agents/settings.py` via `AgentSettings(BaseSettings)`.
