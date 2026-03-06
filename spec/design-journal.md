# eede Design Journal

## Overview

Design rationale, decisions, and session history for eede —
the Earth Engine Development Environment VS Code extension.

Last Updated: 2026-03-06
Sessions: 2 (5 milestones)

---

## Session 1 — 2026-03-06: VS Code Extension Scaffold

### Context

eede started as a vision for a standalone web IDE for Earth Engine.
Community feedback from teammates highlighted VS Code as the ideal
target: it provides Monaco, git, debugging, Python/JS support, and
the extension marketplace for free. The architecture pivoted to a
VS Code extension.

### Decisions Made

1. **VS Code extension, not standalone app.** Rationale: inherit
   IDE chrome (editor, git, debug, terminal), focus on EE-specific
   value (map, inspector, notebooks, assets). Roughly halves the
   dev effort vs building a full IDE shell.

2. **Custom notebook type (.eede).** Uses VS Code's Notebook API
   with a custom serializer (JSON format) and controller. Each
   cell is JS or Python. Chose custom format over .ipynb to avoid
   Jupyter compat baggage early — can add .ipynb export later.

3. **Cell execution via child processes.** JS cells run in a
   Node.js subprocess with `@google/earthengine`. Python cells
   run via the configured Python interpreter. Chose subprocesses
   over in-process execution for isolation and simplicity.

4. **Map as a webview panel.** Leaflet in a VS Code webview with
   `retainContextWhenHidden: true` so map state persists. Layer
   state synchronized via EEState event emitter.

5. **Three auth methods.** gcloud CLI (default, for local dev),
   OAuth (for web-hosted code-server), service account (for
   automation). OAuth uses a local HTTP callback server.

6. **code-server for web hosting.** The extension works unmodified
   in code-server. Dockerfile pre-installs Node, Python, gcloud,
   earthengine-api, and the extension. Target: ee.abwp.ai.

7. **Cross-language bridge via EE serialization.** EE objects
   serialize to language-agnostic JSON. The variable bridge
   captures ee.* variables after each cell and injects them
   before the next cell, regardless of language.

### What Was Built

- 13 TypeScript source files, clean compilation
- package.json with full VS Code extension manifest
- Notebook controller + serializer
- Map webview (Leaflet + OSM basemap + layer control)
- Inspector webview
- Asset browser (EE REST API)
- Task manager (EE REST API, cancel support)
- Layer manager (synced with EEState)
- EE-aware autocomplete (types, methods, datasets)
- Auth (gcloud + OAuth + service account)
- Export shims (JS + Python)
- Inspector point-query module
- Cross-language variable bridge
- Dockerfile + docker-compose for code-server
- Example notebook

### Commits

1. `e800aa4` — Scaffold VS Code extension (11 files)
2. `8cee269` — OAuth + Dockerfile for web hosting
3. `870de89` — Real tile URL generation in cell runners
4. `56133be` — Inspector + Export shims
5. `0b7e222` — Cross-language variable bridge

### Milestone 2 — Wiring + Tests

Completed iterations 6-9:
- Variable bridge integrated into cell execution flow
- Map clicks routed to inspector via eede.inspectPoint command
- Map drawing tools (Leaflet.Draw: point, polygon, rectangle)
- Drawn geometries copied as EE code + stored in state
- Status bar showing auth state and project ID
- 6 unit tests for variable bridge (mocha, standalone)
- Serializer + completion tests (need extension host)

### Commits (continued)

6. `673fc4f` — Variable bridge wired + map-inspector routing
7. `d07fe42` — Status bar
8. `790da4e` — Map drawing tools
9. `3f93c47` — Unit tests

### Milestone 3 — Full Feature Set + Deploy Config

Completed iterations 10-14:
- Dynamic EE catalog search (STAC API, 1h cache, 20 fallbacks)
- Cloud Run deployment (Dockerfile, cloudbuild.yaml, deploy.sh)
- Error diagnostics (line mapping, severity, EE error codes)
- Persistent cell state (bridge vars + map center in .eede file)
- SVG chart renderer (ui.Chart shim, line/scatter/bar/histogram)
- CLAUDE.md project conventions

### Commits (continued)

10. `a0a7f15` — Dynamic catalog search for autocomplete
11. `4fc0839` — Cloud Run deployment config
12. `7a58bac` — Error diagnostics + persistent state
13. `ab6324a` — CLAUDE.md

### Stats

- 21 TypeScript source files
- ~3,400 lines of code
- 6 unit tests passing
- 16 commits total
- Clean compilation, zero warnings

### Milestone 4 — Polish + Performance

Completed iterations 15-16:
- Code Editor script importer (split on separators, gaps,
  comment-to-markdown conversion, 5 new tests)
- Keyboard shortcuts (Ctrl+Shift+M/I/N)
- Async cell execution (spawn + temp files, no more execSync)
- Parser extracted to standalone module for testing
- 11 total tests, all passing

### Commits (continued)

14. `5525b25` — Code Editor importer + keybindings
15. `5415ca0` — Async cell execution

### Milestone 5 — Polish + UX

Completed iterations 17-20:
- Notebook cell toolbar: toggle language (JS↔Python) and
  clear output buttons in cell title bar
- Dark/light theme: map basemap auto-switches between OSM
  (light) and CartoDB dark_all (dark), MutationObserver for
  live theme changes, all chrome uses VS Code CSS variables
- Layer caching: tile URLs + bridge vars + map center persisted
  in .eede metadata, restored on notebook reopen without
  re-execution
- Multi-geometry: "Copy All as FeatureCollection" toolbar
  appears when 2+ geometries drawn, generates ee code

### Commits (continued)

16. `506da17` — Cell toolbar + dark/light theme
17. `d10e309` — Layer caching in notebook metadata
18. `c02b2fd` — Multi-geometry FeatureCollection export

### Stats

- 25 TypeScript source files
- ~3,630 lines of code
- 11 unit tests passing
- 24 commits total
- Clean compilation, zero warnings

### Next Steps

### Milestone 6 — Deploy + Geeni Integration

- Deployed to eede.abwp.ai via Cloud Build + Cloud Run
- Entrypoint proxy: Node.js sits in front of code-server,
  handles ?code=<base64>&lang=<js|python> to create notebooks
  from external links
- Geeni chat: "Open in eede" button on EE code blocks,
  links to eede.abwp.ai with base64-encoded code
- Geeni gateway: eede.abwp.ai added to CORS origins

### Commits (continued)

19. `80d9f4d` — Entrypoint proxy for geeni→eede handoff
20. (geeni) `234dd74` — Open in eede button + CORS

### Next Steps

1. **Domain mapping.** `eede.abwp.ai` → Cloud Run service.

2. **Geeni as eede sidebar.** Embed geeni chat as a VS Code
   webview panel for inline EE expert assistance.

3. **Extension test harness.** @vscode/test-electron for
   tests that need the extension host.

4. **Cell interruption.** Cancel running cell execution via
   kill signal to child process.

5. **Marketplace publishing.** Package and publish to VS Code
   marketplace as preview.
