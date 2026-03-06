import * as assert from 'assert';
import { parseCodeEditorScript } from '../importer/scriptParser';

suite('Code Editor Importer', () => {
  test('imports simple script as one cell', () => {
    const cells = parseCodeEditorScript(
      "var image = ee.Image('USGS/SRTMGL1_003');\n" +
        "Map.addLayer(image, {min: 0, max: 3000}, 'Elevation');"
    );
    assert.strictEqual(cells.length, 1);
    assert.strictEqual(cells[0].language, 'javascript');
    assert.strictEqual(cells[0].kind, 'code');
  });

  test('splits on separator comments', () => {
    const cells = parseCodeEditorScript(
      "var a = 1;\n" +
        "// ----------\n" +
        "var b = 2;\n" +
        "// ==========\n" +
        "var c = 3;"
    );
    assert.strictEqual(cells.length, 3);
    assert.ok(cells[0].source.includes('var a'));
    assert.ok(cells[1].source.includes('var b'));
    assert.ok(cells[2].source.includes('var c'));
  });

  test('converts pure comments to markup', () => {
    const cells = parseCodeEditorScript(
      "// # Section Title\n" +
        "// This is a description.\n" +
        "// ----------\n" +
        "var x = 1;"
    );
    assert.strictEqual(cells.length, 2);
    assert.strictEqual(cells[0].kind, 'markup');
    assert.strictEqual(cells[0].language, 'markdown');
    assert.strictEqual(cells[1].kind, 'code');
  });

  test('splits on large gaps', () => {
    const cells = parseCodeEditorScript(
      "var a = 1;\n\n\n\nvar b = 2;"
    );
    assert.strictEqual(cells.length, 2);
  });

  test('handles empty input', () => {
    const cells = parseCodeEditorScript('');
    assert.strictEqual(cells.length, 1);
  });
});
