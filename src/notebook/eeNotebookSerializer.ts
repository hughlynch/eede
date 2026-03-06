import * as vscode from 'vscode';

interface RawCell {
  language: string;
  source: string;
  kind: 'code' | 'markup';
  outputs?: RawOutput[];
}

interface RawOutput {
  mime: string;
  data: string;
}

interface RawNotebook {
  version: 1;
  cells: RawCell[];
}

export class EENotebookSerializer
  implements vscode.NotebookSerializer
{
  deserializeNotebook(
    content: Uint8Array,
    _token: vscode.CancellationToken
  ): vscode.NotebookData {
    const text = new TextDecoder().decode(content);

    let raw: RawNotebook;
    try {
      raw = JSON.parse(text);
    } catch {
      // Empty or invalid file — start with one JS cell.
      return this.createEmptyNotebook();
    }

    const cells = raw.cells.map((cell) => {
      const kind =
        cell.kind === 'markup'
          ? vscode.NotebookCellKind.Markup
          : vscode.NotebookCellKind.Code;

      const cellData = new vscode.NotebookCellData(
        kind,
        cell.source,
        cell.language
      );

      if (cell.outputs) {
        cellData.outputs = cell.outputs.map(
          (out) =>
            new vscode.NotebookCellOutput([
              vscode.NotebookCellOutputItem.text(
                out.data,
                out.mime
              ),
            ])
        );
      }

      return cellData;
    });

    return new vscode.NotebookData(cells);
  }

  serializeNotebook(
    data: vscode.NotebookData,
    _token: vscode.CancellationToken
  ): Uint8Array {
    const raw: RawNotebook = {
      version: 1,
      cells: data.cells.map((cell) => {
        const rawCell: RawCell = {
          language: cell.languageId,
          source: cell.value,
          kind:
            cell.kind === vscode.NotebookCellKind.Markup
              ? 'markup'
              : 'code',
        };

        if (cell.outputs && cell.outputs.length > 0) {
          rawCell.outputs = cell.outputs.flatMap(
            (output) =>
              output.items.map((item) => ({
                mime: item.mime,
                data: new TextDecoder().decode(item.data),
              }))
          );
        }

        return rawCell;
      }),
    };

    return new TextEncoder().encode(
      JSON.stringify(raw, null, 2) + '\n'
    );
  }

  createEmptyNotebook(): vscode.NotebookData {
    return new vscode.NotebookData([
      new vscode.NotebookCellData(
        vscode.NotebookCellKind.Code,
        '// Welcome to eede — Earth Engine Development Environment\n' +
          '// This cell runs JavaScript against the EE API.\n' +
          '\n' +
          "var image = ee.Image('USGS/SRTMGL1_003');\n" +
          'Map.addLayer(image, {min: 0, max: 3000}, ' +
          "'Elevation');",
        'javascript'
      ),
    ]);
  }
}
