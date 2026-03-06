import * as assert from 'assert';
import { EENotebookSerializer } from '../notebook/eeNotebookSerializer';
import * as vscode from 'vscode';

// Minimal mock of vscode types for testing outside
// the extension host. These tests verify the
// serialization logic, not the VS Code integration.

suite('EENotebookSerializer', () => {
  const serializer = new EENotebookSerializer();
  const token = {
    isCancellationRequested: false,
    onCancellationRequested: () => ({ dispose: () => {} }),
  } as vscode.CancellationToken;

  test('round-trips a notebook', () => {
    const input = {
      version: 1 as const,
      cells: [
        {
          language: 'javascript',
          source: 'var x = 1;',
          kind: 'code' as const,
        },
        {
          language: 'markdown',
          source: '# Hello',
          kind: 'markup' as const,
        },
      ],
    };

    const bytes = new TextEncoder().encode(
      JSON.stringify(input)
    );
    const data = serializer.deserializeNotebook(
      bytes,
      token
    );

    assert.strictEqual(data.cells.length, 2);
    assert.strictEqual(
      data.cells[0].value,
      'var x = 1;'
    );
    assert.strictEqual(
      data.cells[0].languageId,
      'javascript'
    );
    assert.strictEqual(data.cells[1].value, '# Hello');

    const serialized = serializer.serializeNotebook(
      data,
      token
    );
    const parsed = JSON.parse(
      new TextDecoder().decode(serialized)
    );
    assert.strictEqual(parsed.version, 1);
    assert.strictEqual(parsed.cells.length, 2);
    assert.strictEqual(
      parsed.cells[0].source,
      'var x = 1;'
    );
  });

  test('handles empty/invalid content', () => {
    const empty = new TextEncoder().encode('');
    const data = serializer.deserializeNotebook(
      empty,
      token
    );
    // Should create a default notebook with one cell.
    assert.ok(data.cells.length > 0);
  });

  test('createEmptyNotebook returns JS cell', () => {
    const data = serializer.createEmptyNotebook();
    assert.strictEqual(data.cells.length, 1);
    assert.strictEqual(
      data.cells[0].languageId,
      'javascript'
    );
    assert.ok(
      data.cells[0].value.includes('ee.Image')
    );
  });
});
