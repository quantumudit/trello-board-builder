# AI Integration Plan

## What this doc covers

Replacing the stub in `agents/ai_service.py` with a real implementation backed by
LangGraph, LiteLLM, and Azure OpenAI. The API contract, route paths, and Pydantic
schemas are already in place and do not change. Only `agents/ai_service.py` changes.

---

## Current state

`agents/ai_service.py` contains `AIService` -- a stub class with two methods that
return hardcoded placeholder strings. The routes `POST /api/ai/generate-board` and
`POST /api/ai/refactor-description` in `backend/app.py` call this class directly.
No external API calls are made today.

```
backend/app.py  ->  agents/ai_service.py (stub)
                          |
                          +-- generate_board()         returns "Project Board"
                          +-- refactor_description()   returns input unchanged
```

---

## Target state

```
backend/app.py  ->  agents/ai_service.py (real)
                          |
                          +-- generate_board()    -> LangGraph graph -> LiteLLM -> Azure OpenAI
                          +-- refactor_description() -> LangGraph graph -> LiteLLM -> Azure OpenAI
```

---

## Tech stack

| Library | Role |
|---------|------|
| `langgraph` | Graph-based workflow orchestration. Each AI capability is a small graph: state in, nodes that call the LLM, state out. Gives structured control flow and makes future multi-step reasoning easy to add. |
| `litellm` | Provider-agnostic LLM client. Wraps Azure OpenAI (and any other provider) behind a single `litellm.completion()` call. Means swapping providers later requires only a config change. |
| `azure-openai` (via litellm) | Actual model backend. GPT-4o or equivalent, deployed on Azure. |

---

## What does NOT change

- `backend/app.py` -- route handlers stay identical
- `backend/schemas.py` -- `AIBoardRequest`, `AIBoardResponse`, `AIRefactorRequest`, `AIRefactorResponse` stay identical
- `agents/settings.py` -- `AgentSettings` already covers all required env vars
- `.env.example` -- Azure OpenAI vars already documented
- Frontend -- no changes needed; it already handles both success and error responses

---

## Environment variables (already in `.env.example`)

```
AZURE_OPENAI_API_KEY=your_azure_openai_key_here
AZURE_OPENAI_ENDPOINT=https://your-resource.openai.azure.com/
AZURE_OPENAI_DEPLOYMENT=gpt-4o
AZURE_OPENAI_API_VERSION=2024-02-01
```

---

## Task breakdown

### Task 1 -- Add dependencies

```powershell
uv add langgraph litellm
```

No other package changes needed -- LiteLLM bundles the Azure OpenAI client.

### Task 2 -- Build the `generate_board` graph

**Input:** `cards: list[dict]`, `lists: list[str]`
**Output:** `dict` with keys `board_name` and `board_description`

Workflow:
1. Summarise the cards into a compact text representation (titles + list names only --
   keep the prompt short, descriptions and checklists add noise).
2. Call the LLM with a prompt that asks for a board name (max 6 words) and a 1-2
   sentence description that captures the theme of the work.
3. Parse the response into `board_name` and `board_description` keys.

LangGraph graph shape:

```
__start__  ->  summarise_cards  ->  call_llm  ->  parse_response  ->  __end__
```

State schema (TypedDict):
```python
class GenerateBoardState(TypedDict):
    cards: list[dict]
    lists: list[str]
    card_summary: str       # populated by summarise_cards node
    raw_response: str       # populated by call_llm node
    board_name: str         # populated by parse_response node
    board_description: str  # populated by parse_response node
```

### Task 3 -- Build the `refactor_description` graph

**Input:** `description: str`
**Output:** `str` (refactored description)

Workflow:
1. Call the LLM with a prompt that asks it to rewrite the description to be clearer,
   more professional, and concise (1-3 sentences).
2. Return the response text directly.

LangGraph graph shape:

```
__start__  ->  call_llm  ->  __end__
```

State schema (TypedDict):
```python
class RefactorState(TypedDict):
    description: str
    refactored: str   # populated by call_llm node
```

### Task 4 -- Rewrite `AIService` to run the graphs

Replace the stub class body. The `__init__` method instantiates both compiled graphs
and the `AgentSettings` singleton. Each public method invokes the corresponding graph
and returns its output.

Error handling:
- Missing credentials (`AgentSettings` fields empty) -> raise `AppException` with
  message `"AI service not configured"` (the route handler already maps this to HTTP 503).
- LiteLLM / Azure errors -> catch and re-raise as `AppException` (route handler maps to HTTP 500).

### Task 5 -- Add `agents/prompts.py`

Keep all prompt strings in one file, not inline in the graph nodes. Easier to iterate
on prompt wording without touching graph logic.

```
agents/
+-- ai_service.py     # AIService class -- instantiates and runs graphs
+-- graphs.py         # compiled LangGraph graphs (generate_board_graph, refactor_graph)
+-- nodes.py          # individual node functions called by the graphs
+-- prompts.py        # prompt template strings
+-- settings.py       # AgentSettings (already exists)
+-- README.md         # (already exists)
```

### Task 6 -- Add tests

Test file: `tests/test_ai_service.py`

Coverage needed:
- `generate_board` returns dict with `board_name` and `board_description` keys when
  LLM call is mocked.
- `refactor_description` returns a non-empty string when LLM call is mocked.
- Both methods raise `AppException` when `AgentSettings` credentials are empty.
- LiteLLM errors are wrapped into `AppException`.

Mock strategy: patch `litellm.completion` -- do not make real API calls in unit tests.
Integration tests (marked `@pytest.mark.integration`) can call the real API when
credentials are available.

### Task 7 -- Update `agents/README.md`

Replace the "Current state: stub" section with the real implementation description,
graph diagrams, and instructions for running with real credentials.

---

## Proposed file layout after implementation

```
agents/
+-- __init__.py
+-- ai_service.py     # AIService -- thin orchestrator, runs graphs
+-- graphs.py         # two compiled StateGraph instances
+-- nodes.py          # node functions (summarise_cards, call_llm, parse_response)
+-- prompts.py        # prompt template strings
+-- settings.py       # AgentSettings (no changes needed)
+-- README.md         # updated post-implementation
```

---

## Prompt design notes

### generate_board prompt

```
You are helping a user set up a Trello board.

Here are the cards they plan to create, grouped by list:

{card_summary}

Suggest:
1. A board name (maximum 6 words, title case, no punctuation)
2. A board description (1 to 2 sentences, plain English, captures the theme of the work)

Respond in this exact format:
NAME: <board name>
DESCRIPTION: <board description>
```

Parse by splitting on `NAME:` and `DESCRIPTION:` lines. If parsing fails, fall back to
`"Project Board"` / `"A Trello board."` rather than raising an error.

### refactor_description prompt

```
Rewrite the following board description to be clear, professional, and concise
(1 to 3 sentences). Return only the rewritten text -- no preamble, no explanation.

Original: {description}
```

---

## LiteLLM call pattern for Azure OpenAI

```python
import litellm

response = litellm.completion(
    model="azure/<deployment_name>",
    messages=[{"role": "user", "content": prompt}],
    api_key=settings.azure_openai_api_key,
    api_base=settings.azure_openai_endpoint,
    api_version=settings.azure_openai_api_version,
    max_tokens=256,
    temperature=0.4,
)
content = response.choices[0].message.content or ""
```

The `model` string format `"azure/<deployment>"` is how LiteLLM routes to Azure OpenAI.

---

## Branch name

`feat/ai-integration`
