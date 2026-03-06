import * as vscode from 'vscode';
import { EEState, MapLayer } from '../ee/state';
import { EEAuth } from '../ee/auth';

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

    // Build a Node.js script that runs the cell with
    // the EE API and a Map/print shim.
    const script = this._buildJSRunner(source);

    const result = execSync(`node -e ${escapeShell(script)}`, {
      encoding: 'utf-8',
      timeout: 60000,
      env: {
        ...process.env,
        EE_TOKEN: this._auth.token || '',
        EE_PROJECT: this._auth.projectId || '',
      },
    });

    const parsed = this._parseRunnerOutput(result);

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

    // Build a Python script with EE init and Map shim.
    const script = this._buildPythonRunner(source);

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

const Map = {
  addLayer: function(eeObj, visParams, name) {
    layers.push({
      id: 'layer-' + Date.now() + '-' + layers.length,
      name: name || 'Layer ' + layers.length,
      visParams: visParams || {},
      eeObject: 'serialized',
      visible: true,
      opacity: 1,
      tileUrl: ''
    });
  },
  setCenter: function(lng, lat, zoom) {
    mapCenter = { lng, lat, zoom: zoom || 10 };
  },
  centerObject: function(obj, zoom) {
    mapCenter = { lng: 0, lat: 0, zoom: zoom || 10 };
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
      console.log(JSON.stringify({
        prints, layers, center: mapCenter
      }));
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
        layers.append({
            'id': f'layer-{len(layers)}',
            'name': name or f'Layer {len(layers)}',
            'visible': True, 'opacity': 1,
            'tileUrl': '', 'visParams': vis_params or {}
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

try:
    exec(compile('${escaped}', '<cell>', 'exec'))
except Exception as e:
    prints.append(f'ERROR: {e}')

_orig_print(json.dumps({
    'prints': prints, 'layers': layers,
    'center': map_center
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
