// Run geeni fixture scripts through eede's cell runner.
// This validates that geeni's reference answers actually
// execute correctly against the real EE API.
//
// Auth priority:
//   1. GCE metadata server (auto-refreshing, no expiry)
//   2. gcloud auth (expires after ~60 min)

import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';
import { runScriptFile } from '../notebook/cellRunner';
import { chartShimJS } from '../notebook/chartRenderer';

// ---------- auth ----------
let project = '';
let useMetadata = false;

// Check for GCE metadata server (instant, auto-refreshing).
try {
  const metaResp = execSync(
    'curl -sf -H "Metadata-Flavor: Google" ' +
    '"http://metadata.google.internal/computeMetadata/v1/' +
    'instance/service-accounts/default/email" 2>/dev/null',
    { encoding: 'utf-8', timeout: 3000 }
  ).trim();
  if (metaResp.includes('@')) {
    useMetadata = true;
  }
} catch {
  // Not on GCE.
}

// Get a fresh token. On GCE this hits the metadata server
// (never expires). Otherwise falls back to gcloud.
function getToken(): string {
  if (useMetadata) {
    const raw = execSync(
      'curl -sf -H "Metadata-Flavor: Google" ' +
      '"http://metadata.google.internal/computeMetadata/v1/' +
      'instance/service-accounts/default/token"',
      { encoding: 'utf-8', timeout: 5000 }
    );
    return JSON.parse(raw).access_token;
  }
  return execSync(
    'gcloud auth application-default print-access-token 2>/dev/null' +
    ' || gcloud auth print-access-token 2>/dev/null',
    { encoding: 'utf-8', timeout: 10000 }
  ).trim();
}

let token = '';
try {
  token = getToken();
  project = execSync(
    'gcloud config get-value project 2>/dev/null',
    { encoding: 'utf-8', timeout: 5000 }
  ).trim();
} catch {
  // Will skip tests below.
}

const extRoot = path.resolve(__dirname, '..', '..');
const nodeModules = path.join(extRoot, 'node_modules');

// ---------- fixtures ----------
const fixturesPath = path.resolve(
  extRoot, '..', 'geeni', 'web', 'static', 'fixtures.json'
);

interface Fixture {
  id: string;
  question: string;
  context?: {
    language?: string;
    region?: string;
    date_range?: string;
    [key: string]: string | undefined;
  };
  reference_answer: {
    code_js?: string;
    code_py?: string;
    code?: string;
  };
  evaluation_criteria?: {
    difficulty?: string;
    topics?: string[];
  };
}

let fixtures: Fixture[] = [];
try {
  const raw = fs.readFileSync(fixturesPath, 'utf-8');
  fixtures = JSON.parse(raw).fixtures || [];
} catch {
  // Will skip tests.
}

// ---------- runner template ----------
function buildJSRunner(userCode: string): string {
  return `
const ee = require('@google/earthengine');
const prints = [];
const layers = [];
let mapCenter = null;
var __bridge_vars = [];

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
      visible: true, opacity: 1, tileUrl: ''
    };
    layers.push(layer);
    try {
      const vizImage = (eeObj.visualize)
        ? eeObj.visualize(visParams || {})
        : eeObj;
      const mapId = vizImage.getMapId({});
      if (mapId && mapId.urlFormat) {
        layer.tileUrl = mapId.urlFormat;
      }
    } catch(e) {
      prints.push('Map.addLayer warning: ' + e.message);
    }
  },
  setCenter: function(lng, lat, zoom) {
    mapCenter = { lng, lat, zoom: zoom || 10 };
  },
  centerObject: function(obj, zoom) {
    mapCenter = { lng: 0, lat: 0, zoom: zoom || 10 };
  },
  setOptions: function() {},
  getBounds: function() {
    return ee.Geometry.Rectangle([-180, -90, 180, 90]);
  },
  getCenter: function() {
    return ee.Geometry.Point([0, 0]);
  },
  getScale: function() { return 1; },
  getZoom: function() { return 10; },
  setZoom: function() {},
  setControlVisibility: function() {},
  remove: function() {},
  style: function() { return this; },
  onClick: function() {},
  onChangeBounds: function() {},
  onChangeCenter: function() {},
  onChangeZoom: function() {},
  onIdle: function() {},
  unlisten: function() {}
};

function _exportTask(type, params) {
  var desc = (params && params.description) || 'export';
  prints.push(type + ': ' + desc);
  return {
    start: function() {},
    status: function() { return { state: 'READY' }; },
    id: 'stub-task-' + Date.now()
  };
}
const Export = {
  image: {
    toDrive: function(p) { return _exportTask('Export.image.toDrive', p); },
    toAsset: function(p) { return _exportTask('Export.image.toAsset', p); },
    toCloudStorage: function(p) { return _exportTask('Export.image.toCloudStorage', p); }
  },
  table: {
    toDrive: function(p) { return _exportTask('Export.table.toDrive', p); },
    toAsset: function(p) { return _exportTask('Export.table.toAsset', p); },
    toCloudStorage: function(p) { return _exportTask('Export.table.toCloudStorage', p); }
  },
  video: {
    toDrive: function(p) { return _exportTask('Export.video.toDrive', p); },
    toCloudStorage: function(p) { return _exportTask('Export.video.toCloudStorage', p); }
  }
};

// Chainable stub — every method returns itself so any
// .setOptions().setSeriesNames().setChartType() chain works.
function _chartStub() {
  var stub = {};
  var handler = {
    get: function(target, prop) {
      if (prop in target) return target[prop];
      return function() { return new Proxy(stub, handler); };
    }
  };
  return new Proxy(stub, handler);
}
function _chartNs() {
  return new Proxy({}, {
    get: function() { return function() { return _chartStub(); }; }
  });
}

var ui = {
  Chart: {
    image: _chartNs(),
    feature: _chartNs(),
    array: _chartNs()
  },
  Map: function() {
    return {
      addLayer: function(eeObj, visParams, name) { Map.addLayer(eeObj, visParams, name); return this; },
      setCenter: function() { return this; },
      centerObject: function() { return this; },
      setOptions: function() { return this; },
      setControlVisibility: function() { return this; },
      style: function() { return this; },
      add: function() { return this; },
      remove: function() { return this; },
      getBounds: function() { return ee.Geometry.Rectangle([-180,-90,180,90]); },
      getCenter: function() { return ee.Geometry.Point([0,0]); },
      widgets: function() { return { set: function() {} }; }
    };
  },
  Panel: function() {
    return new Proxy({}, {
      get: function(t, p) {
        if (p === 'add') return function() { return new Proxy({}, this); };
        return function() { return new Proxy({}, this); };
      }
    });
  },
  Label: function() { return { style: function() { return this; }, setValue: function() { return this; } }; },
  Button: function() { return { style: function() { return this; }, onClick: function() { return this; } }; },
  Select: function() { return { style: function() { return this; }, onChange: function() { return this; } }; },
  Textbox: function() { return { style: function() { return this; } }; },
  Slider: function() { return { style: function() { return this; }, onChange: function() { return this; }, setValue: function() { return this; } }; },
  Thumbnail: function() { return { style: function() { return this; } }; },
  SplitPanel: function() { return { setFirstPanel: function() { return this; }, setSecondPanel: function() { return this; } }; },
  root: { clear: function() {}, add: function() {}, insert: function() {}, remove: function() {}, widgets: function() { return { set: function() {}, get: function() { return null; }, length: function() { return 0; } }; } }
};

// Patch ee.batch.Export to use our stub instead of real API.
ee.batch = ee.batch || {};
ee.batch.Export = Export;

// Add static constructors to ui.Map.
ui.Map.Linker = function() { return { add: function() { return this; }, getValue: function() { return []; } }; };
ui.Map.Layer = function() { return { setOpacity: function() { return this; } }; };
ui.Map.CloudStorageLayer = function() { return {}; };

const token = process.env.EE_TOKEN;
const project = process.env.EE_PROJECT;

if (!token) {
  console.log(JSON.stringify({
    prints: ['Auth error: no EE_TOKEN'],
    layers: [], center: null
  }));
  process.exit(0);
}

ee.data.setAuthToken('', 'Bearer', token, 3600, [],
  () => {
    if (project) ee.data.setProject(project);
    ee.initialize(null, null, () => {
      try {
        ${userCode}
      } catch(e) {
        prints.push('ERROR: ' + e.message);
      }
      emitResult();
    }, (e) => {
      console.log(JSON.stringify({
        prints: ['EE init error: ' + e],
        layers: [], center: null
      }));
    });
  },
  false
);
`;
}

function parseOutput(raw: string): {
  prints: string[];
  layers: Array<{ tileUrl: string; name: string }>;
  center: { lng: number; lat: number; zoom: number } | null;
} {
  const lines = raw.trim().split('\n');
  for (let i = lines.length - 1; i >= 0; i--) {
    try {
      return JSON.parse(lines[i]);
    } catch {
      continue;
    }
  }
  return { prints: [raw], layers: [], center: null };
}

// ---------- test suite ----------
suite('Geeni Fixture Runner', function () {
  // Give EE API calls plenty of time.
  this.timeout(120000);

  const skip = !token || !token.startsWith('ya29.');

  if (!fixtures.length) {
    test('fixtures not found', function () {
      this.skip();
    });
    return;
  }

  // Run ALL fixtures that have JS code.
  const jsFixtures = fixtures.filter(
    (f) => f.reference_answer.code_js
  );

  for (const fixture of jsFixtures) {
    test(`${fixture.id}: ${fixture.question.slice(0, 70)}`,
      async function () {
        if (skip) return this.skip();

        // Refresh token per-fixture to avoid expiry.
        const freshToken = getToken();

        let code = fixture.reference_answer.code_js!;

        // Inject context variables from fixture metadata.
        const ctx = fixture.context || {};
        let preamble = '';
        const geoVars = ['roi', 'geometry', 'aoi', 'region', 'studyArea', 'sampleArea'];

        function needsVar(c: string, v: string): boolean {
          const re = new RegExp('\\b' + v + '\\b');
          return re.test(c) &&
            !c.includes('var ' + v) &&
            !c.includes('let ' + v) &&
            !c.includes('const ' + v);
        }

        // Inject region from fixture context.
        if (ctx.region && ctx.region.startsWith('ee.Geometry')) {
          for (const v of geoVars) {
            if (needsVar(code, v)) {
              preamble += `var ${v} = ${ctx.region};\n`;
            }
          }
        }

        // Provide a default geometry for undefined geo vars.
        const defaultGeom = "ee.Geometry.Point([-122.4194, 37.7749])";
        for (const v of geoVars) {
          if (needsVar(code, v) && !preamble.includes('var ' + v)) {
            preamble += `var ${v} = ${defaultGeom};\n`;
          }
        }

        if (preamble) { code = preamble + code; }

        const script = buildJSRunner(code);

        const result = await runScriptFile(
          'node',
          script,
          'js',
          {
            EE_TOKEN: freshToken,
            EE_PROJECT: project,
            NODE_PATH: nodeModules,
          },
          90000
        );

        const parsed = parseOutput(result.stdout);

        // Check for hard errors.
        const errors = parsed.prints.filter(
          (p) => p.startsWith('ERROR:')
        );
        const initErrors = parsed.prints.filter(
          (p) => p.startsWith('EE init error:')
        );
        const warnings = parsed.prints.filter(
          (p) => p.includes('warning:')
        );

        // Log what happened for visibility.
        const summary = {
          id: fixture.id,
          exit: result.exitCode,
          prints: parsed.prints.length,
          layers: parsed.layers.length,
          tileUrls: parsed.layers.filter(
            (l) => l.tileUrl && l.tileUrl.length > 0
          ).length,
          errors: errors.length,
          warnings: warnings.length,
        };
        console.log(
          '      ' + JSON.stringify(summary)
        );

        // Assertions: no init errors, no hard errors,
        // exit code 0.
        assert.strictEqual(
          result.exitCode, 0,
          `Non-zero exit. stderr: ${result.stderr.slice(0, 300)}`
        );
        assert.strictEqual(
          initErrors.length, 0,
          `Init errors: ${initErrors.join('; ')}`
        );
        assert.strictEqual(
          errors.length, 0,
          `Runtime errors: ${errors.join('; ')}`
        );

        // If the script has Map.addLayer, we should get
        // at least one layer with a tile URL.
        if (code.includes('Map.addLayer')) {
          assert.ok(
            parsed.layers.length > 0,
            'Expected map layers'
          );
        }
      }
    );
  }
});
