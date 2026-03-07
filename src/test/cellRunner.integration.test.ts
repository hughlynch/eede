// Integration tests for cell execution.
// These run real EE code against the API using gcloud auth.
// Requires: gcloud auth print-access-token to work.

import * as assert from 'assert';
import { execSync } from 'child_process';
import { runScriptFile } from '../notebook/cellRunner';
import * as path from 'path';

// Get a real token for testing. Skip if unavailable.
let token = '';
let project = '';
try {
  token = execSync(
    'gcloud auth application-default print-access-token 2>/dev/null' +
    ' || gcloud auth print-access-token 2>/dev/null',
    { encoding: 'utf-8', timeout: 10000 }
  ).trim();
  project = execSync(
    'gcloud config get-value project 2>/dev/null',
    { encoding: 'utf-8', timeout: 5000 }
  ).trim();
} catch {
  // Will skip tests below.
}

const extRoot = path.resolve(__dirname, '..', '..');
const nodeModules = path.join(extRoot, 'node_modules');

function buildJSRunner(userCode: string): string {
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
  bridgeVars?: Array<{ name: string; type: string; value: string }>;
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

suite('Cell Runner Integration', function () {
  this.timeout(30000);

  const skip = !token || !token.startsWith('ya29.');

  test('basic ee.Image getInfo', async function () {
    if (skip) return this.skip();
    const result = await runScriptFile(
      'node',
      buildJSRunner(`
        var img = ee.Image(1);
        print(img.bandNames().getInfo());
      `),
      'js',
      {
        EE_TOKEN: token,
        EE_PROJECT: project,
        NODE_PATH: nodeModules,
      },
      30000
    );
    assert.strictEqual(result.exitCode, 0,
      'stderr: ' + result.stderr);
    const parsed = parseOutput(result.stdout);
    assert.ok(parsed.prints.length > 0,
      'should have printed output');
    assert.ok(
      parsed.prints[0].includes('constant'),
      'should contain band name "constant"'
    );
  });

  test('Map.addLayer gets tile URL', async function () {
    if (skip) return this.skip();
    const result = await runScriptFile(
      'node',
      buildJSRunner(`
        var dem = ee.Image('USGS/SRTMGL1_003');
        Map.addLayer(dem, {min: 0, max: 3000}, 'Elevation');
      `),
      'js',
      {
        EE_TOKEN: token,
        EE_PROJECT: project,
        NODE_PATH: nodeModules,
      },
      30000
    );
    assert.strictEqual(result.exitCode, 0,
      'stderr: ' + result.stderr);
    const parsed = parseOutput(result.stdout);
    assert.strictEqual(parsed.layers.length, 1);
    assert.ok(
      parsed.layers[0].tileUrl.includes(
        'earthengine.googleapis.com'
      ),
      'should have EE tile URL, got: ' +
        parsed.layers[0].tileUrl
    );
    assert.strictEqual(
      parsed.layers[0].name, 'Elevation'
    );
  });

  test('Map.setCenter works', async function () {
    if (skip) return this.skip();
    const result = await runScriptFile(
      'node',
      buildJSRunner(`
        Map.setCenter(-122.4, 37.8, 12);
      `),
      'js',
      {
        EE_TOKEN: token,
        EE_PROJECT: project,
        NODE_PATH: nodeModules,
      },
      30000
    );
    assert.strictEqual(result.exitCode, 0);
    const parsed = parseOutput(result.stdout);
    assert.deepStrictEqual(parsed.center, {
      lng: -122.4, lat: 37.8, zoom: 12,
    });
  });

  test('error in user code is captured', async function () {
    if (skip) return this.skip();
    const result = await runScriptFile(
      'node',
      buildJSRunner(`
        throw new Error('test error');
      `),
      'js',
      {
        EE_TOKEN: token,
        EE_PROJECT: project,
        NODE_PATH: nodeModules,
      },
      30000
    );
    assert.strictEqual(result.exitCode, 0);
    const parsed = parseOutput(result.stdout);
    assert.ok(
      parsed.prints.some(p => p.includes('test error'))
    );
  });

  test('missing token gives clear error', async function () {
    const result = await runScriptFile(
      'node',
      buildJSRunner(`print('hello');`),
      'js',
      {
        EE_TOKEN: '',
        EE_PROJECT: project,
        NODE_PATH: nodeModules,
      },
      10000
    );
    assert.strictEqual(result.exitCode, 0);
    const parsed = parseOutput(result.stdout);
    assert.ok(
      parsed.prints.some(p => p.includes('no EE_TOKEN'))
    );
  });
});
