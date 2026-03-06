import * as vscode from 'vscode';
import { EEState, MapLayer } from '../ee/state';
import { EEAuth } from '../ee/auth';
import {
  SerializedVar,
  extractJSVarNames,
  extractPyVarNames,
  jsDeserializeVars,
  jsSerializeVars,
  pyDeserializeVars,
  pySerializeVars,
} from './variableBridge';
import {
  ChartData,
  chartToHtml,
  chartShimJS,
} from './chartRenderer';

// The notebook controller executes JS and Python cells
// against the Earth Engine API. JS runs via a child
// process with the @google/earthengine npm package.
// Python runs via the configured Python interpreter with
// the ee package.

export class EENotebookController
  implements vscode.Disposable
{
  private readonly _controller: vscode.NotebookController;
  private _executionOrder = 0;
  private _bridgeVars: SerializedVar[] = [];

  constructor(
    private readonly _state: EEState,
    private readonly _auth: EEAuth,
    private readonly _output: vscode.OutputChannel
  ) {
    this._controller =
      vscode.notebooks.createNotebookController(
        'eede-controller',
        'eede-notebook',
        'Earth Engine'
      );

    this._controller.supportedLanguages = [
      'javascript',
      'python',
    ];
    this._controller.supportsExecutionOrder = true;
    this._controller.executeHandler =
      this._executeAll.bind(this);
  }

  dispose() {
    this._controller.dispose();
  }

  private async _executeAll(
    cells: vscode.NotebookCell[],
    _notebook: vscode.NotebookDocument,
    _ctrl: vscode.NotebookController
  ) {
    for (const cell of cells) {
      await this._executeCell(cell);
    }
  }

  private async _executeCell(
    cell: vscode.NotebookCell
  ): Promise<void> {
    const execution =
      this._controller.createNotebookCellExecution(cell);
    execution.executionOrder = ++this._executionOrder;
    execution.start(Date.now());

    const source = cell.document.getText();
    const lang = cell.document.languageId;

    try {
      if (lang === 'javascript') {
        await this._executeJS(source, execution);
      } else if (lang === 'python') {
        await this._executePython(source, execution);
      } else {
        execution.replaceOutput([
          new vscode.NotebookCellOutput([
            vscode.NotebookCellOutputItem.text(
              `Unsupported language: ${lang}`
            ),
          ]),
        ]);
      }
      execution.end(true, Date.now());
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : String(err);
      execution.replaceOutput([
        new vscode.NotebookCellOutput([
          vscode.NotebookCellOutputItem.stderr(msg),
        ]),
      ]);
      execution.end(false, Date.now());
    }
  }

  private async _executeJS(
    source: string,
    execution: vscode.NotebookCellExecution
  ): Promise<void> {
    const { execSync } = await import('child_process');

    // Inject bridged variables + serialize after.
    const varNames = extractJSVarNames(source);
    const preamble =
      jsDeserializeVars(this._bridgeVars);
    const postamble = jsSerializeVars(varNames);
    const script = this._buildJSRunner(
      preamble + '\n' + source + '\n' + postamble
    );

    const result = execSync(
      `node -e ${escapeShell(script)}`,
      {
        encoding: 'utf-8',
        timeout: 60000,
        env: {
          ...process.env,
          EE_TOKEN: this._auth.token || '',
          EE_PROJECT: this._auth.projectId || '',
        },
      }
    );

    const parsed = this._parseRunnerOutput(result);

    // Capture bridged variables.
    if (parsed.bridgeVars) {
      for (const v of parsed.bridgeVars) {
        const idx = this._bridgeVars.findIndex(
          (bv) => bv.name === v.name
        );
        if (idx >= 0) {
          this._bridgeVars[idx] = v;
        } else {
          this._bridgeVars.push(v);
        }
      }
    }

    const outputs: vscode.NotebookCellOutput[] = [];

    if (parsed.prints.length > 0) {
      outputs.push(
        new vscode.NotebookCellOutput([
          vscode.NotebookCellOutputItem.text(
            parsed.prints.join('\n')
          ),
        ])
      );
    }

    for (const layer of parsed.layers) {
      this._state.addLayer(layer);
    }

    if (parsed.center) {
      this._state.setCenter(
        parsed.center.lng,
        parsed.center.lat,
        parsed.center.zoom
      );
    }

    // Render charts as SVG in cell output.
    if (parsed.charts && parsed.charts.length > 0) {
      for (const chart of parsed.charts) {
        const svg = chartToHtml(chart);
        outputs.push(
          new vscode.NotebookCellOutput([
            vscode.NotebookCellOutputItem.text(
              svg,
              'text/html'
            ),
          ])
        );
      }
    }

    if (outputs.length === 0) {
      outputs.push(
        new vscode.NotebookCellOutput([
          vscode.NotebookCellOutputItem.text('(ok)'),
        ])
      );
    }

    execution.replaceOutput(outputs);
  }

  private async _executePython(
    source: string,
    execution: vscode.NotebookCellExecution
  ): Promise<void> {
    const { execSync } = await import('child_process');
    const config =
      vscode.workspace.getConfiguration('eede');
    const pythonPath = config.get<string>(
      'pythonPath',
      'python3'
    );

    // Inject bridged variables + serialize after.
    const varNames = extractPyVarNames(source);
    const preamble =
      pyDeserializeVars(this._bridgeVars);
    const postamble = pySerializeVars(varNames);
    const augmented =
      preamble + '\n' + source + '\n' + postamble;
    const script = this._buildPythonRunner(augmented);

    const result = execSync(
      `${pythonPath} -c ${escapeShell(script)}`,
      {
        encoding: 'utf-8',
        timeout: 60000,
        env: {
          ...process.env,
          EE_TOKEN: this._auth.token || '',
          EE_PROJECT: this._auth.projectId || '',
        },
      }
    );

    const parsed = this._parseRunnerOutput(result);

    // Capture bridged variables.
    if (parsed.bridgeVars) {
      for (const v of parsed.bridgeVars) {
        const idx = this._bridgeVars.findIndex(
          (bv) => bv.name === v.name
        );
        if (idx >= 0) {
          this._bridgeVars[idx] = v;
        } else {
          this._bridgeVars.push(v);
        }
      }
    }

    const outputs: vscode.NotebookCellOutput[] = [];

    if (parsed.prints.length > 0) {
      outputs.push(
        new vscode.NotebookCellOutput([
          vscode.NotebookCellOutputItem.text(
            parsed.prints.join('\n')
          ),
        ])
      );
    }

    for (const layer of parsed.layers) {
      this._state.addLayer(layer);
    }

    if (outputs.length === 0) {
      outputs.push(
        new vscode.NotebookCellOutput([
          vscode.NotebookCellOutputItem.text('(ok)'),
        ])
      );
    }

    execution.replaceOutput(outputs);
  }

  private _buildJSRunner(userCode: string): string {
    return `
const ee = require('@google/earthengine');
const prints = [];
const layers = [];
let mapCenter = null;
let pendingLayers = 0;
${chartShimJS()}

function print(...args) {
  const strs = args.map(a => {
    if (a && typeof a.getInfo === 'function') {
      try { return JSON.stringify(a.getInfo()); }
      catch(e) { return String(a); }
    }
    return typeof a === 'object'
      ? JSON.stringify(a) : String(a);
  });
  prints.push(strs.join(' '));
}

function emitResult() {
  if (pendingLayers > 0) return;
  console.log(JSON.stringify({
    prints, layers, center: mapCenter,
    bridgeVars: typeof __bridge_vars !== 'undefined'
      ? __bridge_vars : [],
    charts: typeof __charts !== 'undefined'
      ? __charts : []
  }));
}

const Map = {
  addLayer: function(eeObj, visParams, name) {
    const idx = layers.length;
    const layer = {
      id: 'layer-' + Date.now() + '-' + idx,
      name: name || 'Layer ' + idx,
      visParams: visParams || {},
      visible: true,
      opacity: 1,
      tileUrl: ''
    };
    layers.push(layer);

    // Get real tile URL via getMapId.
    pendingLayers++;
    try {
      const vizImage = (eeObj.visualize)
        ? eeObj.visualize(visParams || {})
        : eeObj;
      vizImage.getMapId({}, function(mapId) {
        if (mapId && mapId.urlFormat) {
          layer.tileUrl = mapId.urlFormat;
        }
        pendingLayers--;
        emitResult();
      }, function(err) {
        prints.push('Map.addLayer warning: ' + err);
        pendingLayers--;
        emitResult();
      });
    } catch(e) {
      prints.push('Map.addLayer warning: ' + e.message);
      pendingLayers--;
    }
  },
  setCenter: function(lng, lat, zoom) {
    mapCenter = { lng, lat, zoom: zoom || 10 };
  },
  centerObject: function(obj, zoom) {
    mapCenter = { lng: 0, lat: 0, zoom: zoom || 10 };
  }
};

const Export = {
  image: {
    toDrive: function(params) {
      const task = ee.batch.Export.image.toDrive(params);
      task.start();
      prints.push('Export started: ' +
        (params.description || 'image export'));
    },
    toAsset: function(params) {
      const task = ee.batch.Export.image.toAsset(params);
      task.start();
      prints.push('Export started: ' +
        (params.description || 'image to asset'));
    },
    toCloudStorage: function(params) {
      const task =
        ee.batch.Export.image.toCloudStorage(params);
      task.start();
      prints.push('Export started: ' +
        (params.description || 'image to GCS'));
    }
  },
  table: {
    toDrive: function(params) {
      const task = ee.batch.Export.table.toDrive(params);
      task.start();
      prints.push('Export started: ' +
        (params.description || 'table export'));
    },
    toAsset: function(params) {
      const task = ee.batch.Export.table.toAsset(params);
      task.start();
      prints.push('Export started: ' +
        (params.description || 'table to asset'));
    }
  }
};

const token = process.env.EE_TOKEN;
const project = process.env.EE_PROJECT;

ee.data.setAuthToken(null, 'Bearer', token, 3600, [],
  () => {
    if (project) ee.data.setProject(project);
    ee.initialize(null, null, () => {
      try {
        ${userCode}
      } catch(e) {
        prints.push('ERROR: ' + e.message);
      }
      // If no async layers pending, emit now.
      if (pendingLayers === 0) emitResult();
    }, (e) => {
      console.log(JSON.stringify({
        prints: ['EE init error: ' + e],
        layers: [], center: null
      }));
    });
  },
  (e) => {
    console.log(JSON.stringify({
      prints: ['Auth error: ' + e],
      layers: [], center: null
    }));
  }
);
`;
  }

  private _buildPythonRunner(userCode: string): string {
    // Escape user code for embedding in a Python string.
    const escaped = userCode
      .replace(/\\/g, '\\\\')
      .replace(/'/g, "\\'")
      .replace(/\n/g, '\\n');

    return `
import ee, os, json, sys

prints = []
layers = []
map_center = None

_orig_print = print
def print(*args, **kwargs):
    strs = []
    for a in args:
        if hasattr(a, 'getInfo'):
            try: strs.append(json.dumps(a.getInfo()))
            except: strs.append(str(a))
        else:
            strs.append(str(a))
    prints.append(' '.join(strs))

class MapShim:
    @staticmethod
    def addLayer(ee_obj, vis_params=None, name=None, *a):
        tile_url = ''
        try:
            map_id = ee_obj.getMapId(vis_params or {})
            tile_url = map_id.get('tile_fetcher', {}).getUrl() if hasattr(map_id.get('tile_fetcher', None), 'getUrl') else map_id.get('urlFormat', '')
        except Exception as e:
            try:
                map_id = ee.data.getMapId({
                    'image': ee_obj, **(vis_params or {})
                })
                tile_url = map_id.get('urlFormat', '')
            except Exception as e2:
                prints.append(f'Map.addLayer warning: {e2}')
        layers.append({
            'id': f'layer-{len(layers)}',
            'name': name or f'Layer {len(layers)}',
            'visible': True, 'opacity': 1,
            'tileUrl': tile_url,
            'visParams': vis_params or {}
        })
    @staticmethod
    def setCenter(lng, lat, zoom=10):
        global map_center
        map_center = {'lng': lng, 'lat': lat, 'zoom': zoom}
    @staticmethod
    def centerObject(obj, zoom=10):
        global map_center
        map_center = {'lng': 0, 'lat': 0, 'zoom': zoom}

Map = MapShim()

token = os.environ.get('EE_TOKEN', '')
project = os.environ.get('EE_PROJECT', '')

creds = ee.ServiceAccountCredentials(None, None) if not token else None
if token:
    import google.oauth2.credentials
    creds = google.oauth2.credentials.Credentials(token)

try:
    ee.Initialize(credentials=creds, project=project or None)
except Exception as e:
    prints.append(f'EE init error: {e}')

class ExportShim:
    class image:
        @staticmethod
        def toDrive(image, **kwargs):
            task = ee.batch.Export.image.toDrive(image=image, **kwargs)
            task.start()
            prints.append(f"Export started: {kwargs.get('description', 'image export')}")
        @staticmethod
        def toAsset(image, **kwargs):
            task = ee.batch.Export.image.toAsset(image=image, **kwargs)
            task.start()
            prints.append(f"Export started: {kwargs.get('description', 'image to asset')}")
    class table:
        @staticmethod
        def toDrive(collection, **kwargs):
            task = ee.batch.Export.table.toDrive(collection=collection, **kwargs)
            task.start()
            prints.append(f"Export started: {kwargs.get('description', 'table export')}")

Export = ExportShim()

try:
    exec(compile('${escaped}', '<cell>', 'exec'))
except Exception as e:
    prints.append(f'ERROR: {e}')

_orig_print(json.dumps({
    'prints': prints, 'layers': layers,
    'center': map_center,
    'bridgeVars': __bridge_vars if '__bridge_vars' in dir() else []
}))
`;
  }

  private _parseRunnerOutput(raw: string): {
    prints: string[];
    layers: MapLayer[];
    center: {
      lng: number;
      lat: number;
      zoom: number;
    } | null;
    bridgeVars?: SerializedVar[];
    charts?: ChartData[];
  } {
    try {
      // Find the last JSON line in stdout.
      const lines = raw.trim().split('\n');
      for (let i = lines.length - 1; i >= 0; i--) {
        try {
          return JSON.parse(lines[i]);
        } catch {
          continue;
        }
      }
    } catch {
      // Fall through.
    }
    return { prints: [raw], layers: [], center: null };
  }
}

function escapeShell(s: string): string {
  return "'" + s.replace(/'/g, "'\\''") + "'";
}
