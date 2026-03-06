import * as assert from 'assert';
import { EECompletionProvider } from '../completion/eeCompletionProvider';

// Tests for the completion provider logic.
// These test the method matching, not VS Code integration.

suite('EECompletionProvider', () => {
  const provider = new EECompletionProvider();

  // Helper: create a minimal mock document + position.
  function mockDocAndPos(lineText: string, col?: number) {
    const position = {
      line: 0,
      character: col ?? lineText.length,
    };
    const document = {
      lineAt: () => ({ text: lineText }),
      getText: () => lineText,
    };
    return { document, position };
  }

  test('completes ee. with type names', async () => {
    const { document, position } = mockDocAndPos(
      'ee.'
    );
    const items = await provider.provideCompletionItems(
      document as any,
      position as any
    );
    assert.ok(items);
    assert.ok(items!.length > 0);
    const labels = items!.map(
      (i: any) => (i.label as string)
    );
    assert.ok(labels.includes('Image'));
    assert.ok(labels.includes('ImageCollection'));
    assert.ok(labels.includes('Reducer'));
  });

  test('completes ee.Image. with methods', async () => {
    const { document, position } = mockDocAndPos(
      'ee.Image.'
    );
    const items = await provider.provideCompletionItems(
      document as any,
      position as any
    );
    assert.ok(items);
    const labels = items!.map(
      (i: any) => (i.label as string)
    );
    assert.ok(labels.includes('select'));
    assert.ok(labels.includes('addBands'));
    assert.ok(labels.includes('normalizedDifference'));
  });

  test('completes Map. with methods', async () => {
    const { document, position } = mockDocAndPos(
      'Map.'
    );
    const items = await provider.provideCompletionItems(
      document as any,
      position as any
    );
    assert.ok(items);
    const labels = items!.map(
      (i: any) => (i.label as string)
    );
    assert.ok(labels.includes('addLayer'));
    assert.ok(labels.includes('setCenter'));
  });

  test('completes dataset IDs', async () => {
    const { document, position } = mockDocAndPos(
      "ee.Image('"
    );
    const items = await provider.provideCompletionItems(
      document as any,
      position as any
    );
    assert.ok(items);
    assert.ok(items!.length > 0);
    const labels = items!.map(
      (i: any) => (i.label as string)
    );
    assert.ok(labels.includes('USGS/SRTMGL1_003'));
  });

  test('returns undefined for unrelated lines', async () => {
    const { document, position } = mockDocAndPos(
      'const x = 1 + '
    );
    const items = await provider.provideCompletionItems(
      document as any,
      position as any
    );
    assert.strictEqual(items, undefined);
  });
});
