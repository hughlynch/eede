# eede: An Open Source Earth Engine Development Environment

*A vision for modern EE tooling, built by and for the community.*

## The Opportunity

Google Earth Engine has ~500,000 registered developers and powers critical work in climate science, agriculture, forestry, disaster response, and urban planning. The Code Editor — the primary IDE for EE development — was groundbreaking when it launched over a decade ago. But it hasn't kept pace with modern development practices, and the community feels it.

Common frustrations from the EE community:

- **No version control integration.** Scripts live in a proprietary file system with no git support.
- **No debugging.** `print()` is the only debugging tool. No breakpoints, no variable inspection, no step-through.
- **JavaScript only in the IDE.** The Python API is growing fast (especially for ML/AI workflows), but has no equivalent IDE experience — you're on your own with Jupyter or VS Code.
- **No cells or notebooks.** Every script is a monolithic block. No way to run sections independently or iterate on analysis steps.
- **Batch system limitations.** Export tasks are fire-and-forget with poor monitoring, no dependency chains, and no retry logic.
- **No extensibility.** Can't add custom panels, tools, or integrations. The UI is frozen in 2015.
- **Vendor lock-in concerns.** Scripts, assets, and workflows are tightly coupled to Google infrastructure with no portability story.

Meanwhile, the **EE JavaScript API is fully open source** (`@google/earthengine` on npm, `google/earthengine-api` on GitHub) and works perfectly as a standalone browser library. The API does all the heavy lifting — the Code Editor is "just" the IDE around it. This means building a better one is not only possible, it's practical.

## What eede Is

eede (pronounced "Edie") is a modern, open source development environment for Earth Engine. It's not a clone of the Code Editor — it's what comes next.

### Core Principles

1. **Dual-language from day one.** JavaScript and Python side by side, in the same notebook. EE's serialization format means computations defined in either language produce identical server-side execution plans.

2. **Cell-based notebooks.** Like Jupyter, but purpose-built for geospatial. Each cell can be JS or Python. Map layers persist across cells. Results are cached and re-runnable.

3. **Real map rendering.** Not a toy preview — a full Leaflet/Deck.gl map with EE tile layers, drawing tools, inspector, and layer management. The same quality you expect from the Code Editor, but extensible.

4. **Modern editing.** Monaco editor (the engine behind VS Code) with EE-aware autocomplete, inline documentation, and proper syntax highlighting for both languages.

5. **Open and extensible.** Plugin architecture for custom panels, tools, data sources, and export targets. The community can build what they need.

## Architecture

```
+--------------------------------------------------+
|                    eede UI                        |
|  +-------------+  +----------+  +-------------+  |
|  | Monaco       |  | Map      |  | Inspector   |  |
|  | Editor       |  | (Leaflet |  | Panel       |  |
|  | (cells)      |  |  /Deck)  |  |             |  |
|  +-------------+  +----------+  +-------------+  |
|  +-------------+  +----------+  +-------------+  |
|  | Console      |  | Layer    |  | Asset       |  |
|  | Output       |  | Manager  |  | Browser     |  |
|  +-------------+  +----------+  +-------------+  |
+--------------------------------------------------+
         |                |               |
    +---------+     +-----------+   +-----------+
    | Cell    |     | Map       |   | Extension |
    | Runtime |     | Engine    |   | Framework |
    +---------+     +-----------+   +-----------+
         |                |
    +---------+     +-----------+
    | EE JS   |     | EE Tile   |
    | API     |     | Service   |
    | (npm)   |     | (getMapId)|
    +---------+     +-----------+
         |                |
    +---------------------------+
    | Earth Engine Backend      |
    | (unchanged — REST API)    |
    +---------------------------+
```

### Key Technical Decisions

**EE API as a browser library.** The `@google/earthengine` npm package works standalone in any browser. No server-side proxy needed for computation. Authentication via OAuth or service account tokens. This is the same API the Code Editor uses internally — we've verified it works with real tile rendering, `getMapId()`, `evaluate()`, and all standard operations.

**Cell execution model.** Each cell runs in a scoped context with access to shared state (the map, defined variables, imported modules). JS cells execute via the browser's EE API directly. Python cells execute via Pyodide (Python-in-the-browser via WebAssembly) with the `ee` Python package, or optionally via a local Python kernel for heavy workflows.

**Cross-language bridge.** EE's computation model is language-agnostic — both JS and Python APIs serialize to the same intermediate representation sent to Google's servers. A variable defined as `ee.Image('LANDSAT/...')` in a JS cell and referenced in a Python cell (or vice versa) can be bridged by serializing/deserializing the EE computation graph. This is the key insight that makes dual-language practical.

**Map rendering.** Leaflet for 2D (proven, lightweight, massive plugin ecosystem) with Deck.gl available for 3D/WebGL visualizations. EE tile layers via `getMapId()` → `L.tileLayer(urlFormat)`. Drawing tools for geometry creation. Inspector click → `ee.Image.sample()` at point.

**Storage.** Notebooks stored as `.eede.json` files (or a Jupyter-compatible `.ipynb` variant) in the local filesystem or synced via git. No proprietary storage system. Full git integration from day one.

## What Makes It Better

### vs. the Code Editor

| Capability | Code Editor | eede |
|-----------|-------------|------|
| Languages | JavaScript only | JavaScript + Python |
| Execution model | Monolithic script | Cell-based notebook |
| Debugging | `print()` only | Breakpoints, variable inspection, step-through |
| Version control | Proprietary "Repo" | Native git |
| Editor | Custom (aging) | Monaco (VS Code engine) |
| Extensibility | None | Plugin architecture |
| Map | Custom (good) | Leaflet/Deck.gl (extensible) |
| Batch/Export | Basic task manager | Dependency chains, retry, monitoring |
| Offline work | Impossible | Edit offline, run when connected |
| Collaboration | Shared scripts | Git branches, PRs, code review |

### vs. Jupyter + EE Python

| Capability | Jupyter + ee | eede |
|-----------|-------------|------|
| Map integration | `geemap` (separate widget) | First-class, always visible |
| EE autocomplete | Generic Python | EE-aware (datasets, methods, bands) |
| JS support | None | Native |
| Asset browser | None | Built-in |
| Inspector | None | Click-to-inspect |
| Batch management | Manual API calls | Integrated UI |
| Migration from Code Editor | Rewrite everything | Copy-paste JS, gradually adopt Python |

### vs. geemap

geemap is excellent and pioneering — it proved there's demand for better EE Python tooling. eede complements it by providing:

- A standalone IDE experience (not a Jupyter extension)
- JavaScript support (critical for the ~80% of EE users still on JS)
- An extensibility framework for community contributions
- A migration path from the Code Editor that doesn't require learning Python first

## The Dual-Language Story

This is eede's most important feature and deserves elaboration.

**The problem:** ~80% of existing EE code is JavaScript (Code Editor scripts). The Python API is growing, especially for ML/AI integration, but most EE knowledge, tutorials, Stack Overflow answers, and shared scripts are in JS. Forcing users to choose one language or rewrite their codebase is a non-starter.

**The solution:** eede notebooks can mix JS and Python cells freely. This works because:

1. **EE computations are language-agnostic.** `ee.Image('LANDSAT/LC08/C02/T1_TOA/LC08_044034_20140318')` in JS and `ee.Image('LANDSAT/LC08/C02/T1_TOA/LC08_044034_20140318')` in Python produce the *identical* server-side computation. The language is just the client-side expression layer.

2. **EE objects can be serialized.** The `ee.Serializer` can convert any EE computation graph to JSON, and `ee.Deserializer` can reconstruct it. This means a variable defined in JS can be passed to Python (and vice versa) by serializing → deserializing the computation graph.

3. **The map is shared.** `Map.addLayer()` in JS and `Map.addLayer()` in Python both add tile layers to the same Leaflet map. The map is a first-class shared resource, not per-cell.

**Migration path:**
- Week 1: Copy your Code Editor scripts directly into eede. They run as-is in JS cells.
- Week 2: Start adding Python cells for new analysis steps. Reference JS-defined variables from Python.
- Month 2: Gradually port utility functions to Python where it makes sense. Use Python for ML integration, pandas for tabular data, matplotlib for custom charts.
- Ongoing: Keep using whichever language is best for each task. No forced migration.

## Batch System

The Code Editor's Export system is one of its weakest points. Tasks are fire-and-forget, there's no dependency management, monitoring is minimal, and failure handling is manual.

eede's batch system would provide:

- **Task graphs.** Define dependencies between exports. "Run this classification after the composite finishes."
- **Retry with backoff.** Automatic retry on transient failures (quota errors, timeouts).
- **Progress monitoring.** Real-time progress bars, estimated completion times, cost tracking.
- **Scheduling.** Run exports on a schedule (daily composites, weekly change detection).
- **Local pre-processing.** Run local Python/JS processing steps as part of the pipeline (e.g., download → process → upload).
- **Templates.** Reusable export configurations. "Export this collection as Cloud-Optimized GeoTIFF to this bucket with these settings."

This doesn't require any changes to EE's backend — it's purely client-side orchestration over the existing Export API, plus local task management.

## Extensibility Framework

The Code Editor is a closed box. eede would provide a plugin API for:

- **Custom panels.** Add specialized UI for your workflow (e.g., a field boundary digitizer, a spectral signature viewer, a time series animation player).
- **Data source plugins.** Connect to non-EE data sources (local files, S3, STAC catalogs) and use them alongside EE data.
- **Export targets.** Export to custom destinations (your own tile server, a Postgres/PostGIS database, a STAC catalog).
- **Analysis tools.** Package reusable analysis workflows as plugins (e.g., a fire detection toolkit, a crop classification pipeline).
- **Themes and layouts.** Customize the IDE layout, color scheme, and keyboard shortcuts.

## Community Strategy

eede's success depends on community adoption. The strategy:

1. **Open source from day one.** Apache 2.0. All development in public.
2. **EE community engagement.** Share with the EE developer relations team, GEE community forum, and key community members (e.g., Qiusheng Wu/geemap, Gennadii Donchyts/EE power user community).
3. **Migration tools.** One-click import of Code Editor scripts. Preserve the familiar API surface (`Map.addLayer`, `print()`, `Export`).
4. **Documentation as a feature.** Every EE dataset, every method, every band — searchable, with examples, in the IDE.
5. **Plugin marketplace.** A registry for community-contributed extensions, similar to VS Code's marketplace.

## Effort Estimate

### Phase 1: Core IDE (8-12 weeks)
- Monaco editor with cell execution
- EE JS API integration (authentication, initialization)
- Leaflet map with EE tile layers
- Console output panel
- `Map.addLayer`, `print()`, `Export` mock surface
- Basic asset browser
- File save/load (local filesystem)
- **Deliverable:** A working JS notebook that can run Code Editor scripts

### Phase 2: Python + Dual-Language (6-8 weeks)
- Pyodide integration for in-browser Python
- EE Python API loading in Pyodide
- Cross-language variable bridge (serialize/deserialize)
- Python cell execution with shared map
- **Deliverable:** Mixed JS/Python notebooks

### Phase 3: Developer Experience (4-6 weeks)
- EE-aware autocomplete (datasets, methods, bands)
- Inline documentation
- Variable inspector
- Map inspector (click-to-query)
- Git integration
- **Deliverable:** A genuinely productive development environment

### Phase 4: Batch + Extensions (6-8 weeks)
- Task graph system
- Retry/monitoring
- Plugin API
- Extension loading
- **Deliverable:** A complete alternative to the Code Editor

### Total: ~6-9 months for a full-featured v1

This is ambitious but realistic. The hardest parts (EE API integration, tile rendering, authentication) are already proven — we've built working prototypes of all three. The remaining work is "just" IDE development, which is well-understood engineering.

## What We've Already Proven

Through the geeni project's browser verification work, we've confirmed:

1. **EE JS API works standalone in a browser.** Loaded from npm, initialized with a gcloud token, runs all standard operations.
2. **Real tile rendering works.** `getMapId()` returns tile URLs that render correctly on Leaflet. We've verified this with 100+ different EE computations.
3. **The full Code Editor API surface can be mocked.** `Map.addLayer`, `Map.centerObject`, `Export.image.toDrive`, `ui.Chart`, `print()` — all implementable outside the Code Editor.
4. **99/103 golden test fixtures pass** in our browser harness, covering NDVI, composites, classification, time series, feature collections, reducers, and more.
5. **Authentication is straightforward.** `gcloud auth print-access-token` provides OAuth tokens. Service account keys work for automated scenarios.

The question is not "can this be built?" — it's "should this be built, and will the community adopt it?"

## The Strategic Case

**For Google:** An active open source EE IDE community means more EE adoption, more compute on Google Cloud, and less maintenance burden on the Code Editor team. Google doesn't monetize the Code Editor — they monetize the compute. A better IDE drives more compute.

**For the community:** Modern tooling, version control, dual-language support, debugging, extensibility. The ability to build the features they've been requesting for years.

**For science:** Reproducible workflows (notebooks in git), better collaboration (PRs instead of shared scripts), and lower barriers to entry (Python support for the ML/AI crowd).

## Getting Involved

This is a community project. We need:

- **EE power users** to validate the design and prioritize features
- **Frontend developers** to build the IDE (React/TypeScript, Monaco, Leaflet)
- **Python/Pyodide experts** for the dual-language bridge
- **DevRel/documentation** people to make it approachable
- **Testers** with diverse EE workflows to stress-test compatibility

If you're interested, open a discussion on this repo or reach out directly.

---

*eede is not affiliated with or endorsed by Google. Earth Engine is a trademark of Google LLC.*
