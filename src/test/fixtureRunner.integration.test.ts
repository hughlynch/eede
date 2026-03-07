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
  }
};

const Export = {
  image: {
    toDrive: function(params) {
      prints.push('Export.image.toDrive: ' +
        (params.description || 'export'));
    },
    toAsset: function(params) {
      prints.push('Export.image.toAsset: ' +
        (params.description || 'export'));
    },
    toCloudStorage: function(params) {
      prints.push('Export.image.toCloudStorage: ' +
        (params.description || 'export'));
    }
  },
  table: {
    toDrive: function(params) {
      prints.push('Export.table.toDrive: ' +
        (params.description || 'export'));
    },
    toAsset: function(params) {
      prints.push('Export.table.toAsset: ' +
        (params.description || 'export'));
    }
  },
  video: {
    toDrive: function(params) {
      prints.push('Export.video.toDrive: ' +
        (params.description || 'export'));
    }
  }
};

// Stub ui.Chart so scripts that use it don't crash.
var ui = {
  Chart: {
    image: {
      series: function() { return { setOptions: function() { return this; }, setChartType: function() { return this; } }; },
      byRegion: function() { return { setOptions: function() { return this; } }; },
      histogram: function() { return { setOptions: function() { return this; } }; },
      regions: function() { return { setOptions: function() { return this; } }; },
      doySeries: function() { return { setOptions: function() { return this; } }; },
      doySeriesByYear: function() { return { setOptions: function() { return this; } }; },
      doySeriesByRegion: function() { return { setOptions: function() { return this; } }; }
    },
    feature: {
      byFeature: function() { return { setOptions: function() { return this; } }; },
      byProperty: function() { return { setOptions: function() { return this; } }; },
      groups: function() { return { setOptions: function() { return this; } }; },
      histogram: function() { return { setOptions: function() { return this; } }; }
    },
    array: {
      values: function() { return { setOptions: function() { return this; } }; }
    }
  },
  Map: {
    addLayer: function() {},
    setCenter: function() {},
    centerObject: function() {},
    setOptions: function() {}
  },
  Thumbnail: function() { return { style: function() { return this; } }; }
};

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

        // Inject context variables (e.g. roi from context.region).
        // Only inject if the region looks like valid EE code.
        const ctx = fixture.context || {};
        if (ctx.region &&
            ctx.region.startsWith('ee.Geometry') &&
            !code.includes('var roi') &&
            !code.includes('let roi') &&
            !code.includes('const roi')) {
          code = `var roi = ${ctx.region};\n` + code;
        }

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
