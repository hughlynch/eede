import * as assert from 'assert';
import {
  extractJSVarNames,
  extractPyVarNames,
  jsDeserializeVars,
  jsSerializeVars,
  pyDeserializeVars,
  pySerializeVars,
  SerializedVar,
} from '../notebook/variableBridge';

suite('Variable Bridge', () => {
  test('extractJSVarNames finds var/let/const', () => {
    const src = `
var image = ee.Image('USGS/SRTMGL1_003');
let ndvi = image.normalizedDifference(['B5', 'B4']);
const scale = 30;
var _private = 1;
    `;
    const names = extractJSVarNames(src);
    assert.ok(names.includes('image'));
    assert.ok(names.includes('ndvi'));
    assert.ok(names.includes('scale'));
    assert.ok(!names.includes('_private'));
  });

  test('extractPyVarNames finds assignments', () => {
    const src = `
image = ee.Image('USGS/SRTMGL1_003')
ndvi = image.normalizedDifference(['B5', 'B4'])
_private = 1
Map = something
    `;
    const names = extractPyVarNames(src);
    assert.ok(names.includes('image'));
    assert.ok(names.includes('ndvi'));
    assert.ok(!names.includes('_private'));
    assert.ok(!names.includes('Map'));
  });

  test('jsDeserializeVars produces valid JS', () => {
    const vars: SerializedVar[] = [
      { name: 'x', type: 'plain', value: '42' },
      {
        name: 'img',
        type: 'ee',
        value: '{"type":"Invocation"}',
      },
    ];
    const code = jsDeserializeVars(vars);
    assert.ok(code.includes('var x = 42'));
    assert.ok(code.includes('ee.Deserializer.fromJSON'));
  });

  test('pyDeserializeVars produces valid Python', () => {
    const vars: SerializedVar[] = [
      { name: 'x', type: 'plain', value: '42' },
      {
        name: 'img',
        type: 'ee',
        value: '{"type":"Invocation"}',
      },
    ];
    const code = pyDeserializeVars(vars);
    assert.ok(code.includes('x = json.loads'));
    assert.ok(
      code.includes('ee.deserializer.fromJSON')
    );
  });

  test('jsSerializeVars produces JS code', () => {
    const code = jsSerializeVars(['x', 'y']);
    assert.ok(code.includes('__bridge_vars'));
    assert.ok(code.includes("name: 'x'"));
    assert.ok(code.includes("name: 'y'"));
  });

  test('pySerializeVars produces Python code', () => {
    const code = pySerializeVars(['x', 'y']);
    assert.ok(code.includes('__bridge_vars'));
    assert.ok(code.includes("'x'"));
    assert.ok(code.includes("'y'"));
  });
});
