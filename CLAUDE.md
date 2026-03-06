# CLAUDE.md

## What This Is

**eede** (`hughlynch/eede`): A VS Code extension providing a modern
development environment for Google Earth Engine. Dual-language
notebooks (JS + Python), Leaflet map panel, asset browser, task
manager, inspector, and EE-aware autocomplete.

Deploy target: `eede.abwp.ai` (code-server on Cloud Run).

## Build and Test Commands

```bash
# Install dependencies
npm install

# Compile TypeScript
npm run compile

# Run standalone unit tests
npm test

# Watch mode (auto-recompile)
npm run watch

# Package as .vsix
npm run package

# Deploy to Cloud Run
./deploy/deploy.sh [PROJECT_ID] [REGION]
```

## Architecture

```
src/
  extension.ts              Entry point
  ee/
    auth.ts                 gcloud + OAuth + service account auth
    oauth.ts                Browser OAuth flow for code-server
    state.ts                Shared session state (layers, vars, center)
    catalog.ts              EE dataset catalog (STAC API)
    inspect.ts              Point-query via EE REST API
  notebook/
    eeNotebookController.ts Cell execution (JS/Python subprocesses)
    eeNotebookSerializer.ts .eede file format (JSON, version 1)
    variableBridge.ts       Cross-language variable bridge
    chartRenderer.ts        SVG chart rendering for ui.Chart shim
    diagnostics.ts          Error diagnostics for cells
  map/
    mapPanel.ts             Leaflet webview (tiles, drawing, layers)
  inspector/
    inspectorPanel.ts       Click-to-query webview
  views/
    assetBrowser.ts         EE asset tree (REST API)
    taskManager.ts          EE task tree (REST API, cancel)
    layerManager.ts         Map layer tree (synced with state)
  completion/
    eeCompletionProvider.ts ee.* methods, datasets, bands
  statusBar.ts              Auth/project status indicator
deploy/
  Dockerfile.cloudrun       code-server + eede for Cloud Run
  cloudbuild.yaml           CI/CD config
  deploy.sh                 Manual deploy script
```

## Key Patterns

### Cell Execution
JS and Python cells run in child processes with EE API + shims
(Map, print, Export, ui.Chart). Output is JSON on stdout:
`{ prints, layers, center, bridgeVars, charts }`.

### Cross-Language Bridge
EE objects serialize to language-agnostic JSON via
`ee.Serializer`/`ee.Deserializer`. Variables captured after each
cell, injected before the next, regardless of language.

### Map State
`EEState` is the single source of truth for layers, variables,
and map center. Event emitters sync map panel, layer tree, and
inspector. State persists in the .eede file.

## Development Conventions

- TypeScript strict mode
- Compiles to `out/` via `tsc`
- No external runtime dependencies beyond `@google/earthengine`
- Webview panels use vanilla HTML/JS (no framework)
- Tests: mocha with TDD UI, standalone (no extension host)
- 80-column line width

## Reading Order

1. This file
2. `spec/design-journal.md` — decisions and session history
3. `VISION.md` — original design vision
4. `src/extension.ts` — entry point and wiring
