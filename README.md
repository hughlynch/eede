# eede

**An open source Earth Engine development environment — as a VS Code extension.**

Pronounced "Edie." See [VISION.md](VISION.md) for the full design document.

## What is this?

eede is a VS Code extension that provides a modern development environment for Google Earth Engine. It gives the ~500,000 EE developers a migration path from the aging Code Editor, with dual-language notebooks, real map rendering, an asset browser, and task management — all inside the editor they already use.

## Status

**Early prototype.** The extension scaffolding compiles and provides:

- Custom notebook controller (`.eede` files) with JS and Python cell execution
- Leaflet map panel with EE tile layer support
- Inspector panel for click-to-query
- Asset browser tree view (EE REST API)
- Task manager tree view with cancel support
- Layer manager synchronized with notebook cells
- EE-aware autocomplete for `ee.*` methods, datasets, and bands
- `gcloud` and service account authentication

## Quick Start

```bash
# Install dependencies
cd eede && npm install

# Compile
npm run compile

# Launch in VS Code Extension Development Host
# (press F5 in VS Code with this folder open)
```

Then open `examples/hello-earth-engine.eede` to try the notebook.

## Extension Features

| Feature | Description |
|---------|-------------|
| **Notebooks** | `.eede` files with JS and Python cells, shared map state |
| **Map Panel** | Leaflet map with EE tile layers, layer control, coordinates |
| **Inspector** | Click-to-query pixel values across layers |
| **Assets** | Browse your EE assets (images, collections, tables, folders) |
| **Tasks** | Monitor and cancel running EE export tasks |
| **Autocomplete** | `ee.Image.`, `ee.Reducer.`, dataset IDs, band names |

## Project Structure

```
src/
  extension.ts              Entry point (activate/deactivate)
  ee/
    auth.ts                 gcloud + service account auth
    state.ts                Shared session state (layers, variables, map center)
  notebook/
    eeNotebookController.ts Cell execution (JS via Node, Python via interpreter)
    eeNotebookSerializer.ts .eede file format (JSON)
  map/
    mapPanel.ts             Leaflet webview panel
  inspector/
    inspectorPanel.ts       Point query webview panel
  views/
    assetBrowser.ts         EE asset tree view
    taskManager.ts          EE task tree view
    layerManager.ts         Map layer tree view
  completion/
    eeCompletionProvider.ts EE-aware autocomplete
examples/
  hello-earth-engine.eede   Sample notebook
```

## Configuration

| Setting | Description | Default |
|---------|-------------|---------|
| `eede.projectId` | Google Cloud project ID | (auto-detect from gcloud) |
| `eede.pythonPath` | Python interpreter path | `python3` |
| `eede.authMethod` | `gcloud` or `service-account` | `gcloud` |
| `eede.serviceAccountKeyPath` | SA key JSON path | |

## Quick links

- [Vision & Architecture](VISION.md) — Full design document
- [Discussion](https://github.com/hugh-lynch/eede/discussions) — Community feedback

## License

Apache 2.0
