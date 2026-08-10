# frontend/

React 19 + TypeScript + Vite 6 + Tailwind CSS v4 source for the Trello Board Builder web UI.

## Structure

```
frontend/
+-- src/
|   +-- App.tsx              # Root component, step state management
|   +-- api/index.ts         # All fetch calls to the FastAPI backend
|   +-- components/
|   |   +-- StepIndicator.tsx
|   |   +-- Step1Input.tsx   # Upload cards JSON
|   |   +-- Step2Preview.tsx # Preview and edit board layout
|   |   +-- Step3Configure.tsx # Label colours, board settings
|   |   +-- Step4Build.tsx   # Trigger build, stream live logs
|   +-- types.ts             # Shared TypeScript types
|   +-- utils/
|       +-- colors.ts        # Trello colour helpers
|       +-- date.ts          # Date formatting helpers
+-- index.html
+-- package.json
+-- vite.config.ts           # outDir -> ../backend/static, base='/static/' on build
+-- tsconfig.json
```

## Development

```powershell
# Vite dev server with hot reload (proxies /api to FastAPI on :8000)
# Run just serve in another terminal first
npm run dev
```

Open http://localhost:5173.

## Production build

```powershell
# From project root
just build-ui
```

Compiles to `backend/static/` (assets) and moves `index.html` to `backend/templates/`.
FastAPI then serves everything from http://localhost:8000.
