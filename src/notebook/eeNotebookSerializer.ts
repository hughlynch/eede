import * as vscode from 'vscode';
import { SerializedVar } from './variableBridge';

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

interface RawLayer {
  id: string;
  name: string;
  tileUrl: string;
  visParams: Record<string, unknown>;
  visible: boolean;
  opacity: number;
}

interface RawNotebook {
  version: 1;
  cells: RawCell[];
  bridgeState?: SerializedVar[];
  mapCenter?: { lng: number; lat: number; zoom: number };
  layers?: RawLayer[];
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

    const metadata: Record<string, unknown> = {};
    if (raw.bridgeState) {
      metadata.bridgeState = raw.bridgeState;
    }
    if (raw.mapCenter) {
      metadata.mapCenter = raw.mapCenter;
    }
    if (raw.layers) {
      metadata.layers = raw.layers;
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

    const notebookData = new vscode.NotebookData(cells);
    notebookData.metadata = metadata;
    return notebookData;
  }

  serializeNotebook(
    data: vscode.NotebookData,
    _token: vscode.CancellationToken
  ): Uint8Array {
    const raw: RawNotebook & Record<string, unknown> = {
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

    // Persist bridge state and map center if available.
    const meta = data.metadata as
      Record<string, unknown> | undefined;
    if (meta?.bridgeState) {
      raw.bridgeState =
        meta.bridgeState as SerializedVar[];
    }
    if (meta?.mapCenter) {
      raw.mapCenter = meta.mapCenter as {
        lng: number;
        lat: number;
        zoom: number;
      };
    }
    if (meta?.layers) {
      raw.layers = meta.layers as RawLayer[];
    }

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
