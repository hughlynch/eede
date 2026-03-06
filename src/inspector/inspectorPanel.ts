import * as vscode from 'vscode';
import { EEState } from '../ee/state';
import { EEAuth } from '../ee/auth';

export class InspectorPanel {
  private static _current: InspectorPanel | undefined;
  private readonly _panel: vscode.WebviewPanel;
  private _disposables: vscode.Disposable[] = [];

  static sendResults(
    results: Array<{
      layerName: string;
      values: Record<string, unknown>;
    }>
  ) {
    if (InspectorPanel._current) {
      InspectorPanel._current._panel.webview.postMessage(
        {
          type: 'inspectResult',
          results,
        }
      );
    }
  }

  static createOrShow(
    extensionUri: vscode.Uri,
    state: EEState,
    auth: EEAuth
  ) {
    if (InspectorPanel._current) {
      InspectorPanel._current._panel.reveal(
        vscode.ViewColumn.Beside
      );
      return;
    }

    const panel = vscode.window.createWebviewPanel(
      'eedeInspector',
      'EE Inspector',
      vscode.ViewColumn.Beside,
      { enableScripts: true }
    );

    InspectorPanel._current = new InspectorPanel(
      panel,
      state,
      auth
    );
  }

  private constructor(
    panel: vscode.WebviewPanel,
    private readonly _state: EEState,
    private readonly _auth: EEAuth
  ) {
    this._panel = panel;
    this._panel.webview.html = this._getHtml();

    this._panel.onDidDispose(() => {
      InspectorPanel._current = undefined;
      for (const d of this._disposables) {
        d.dispose();
      }
    });
  }

  private _getHtml(): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <style>
    body {
      font-family: var(--vscode-font-family, sans-serif);
      font-size: var(--vscode-font-size, 13px);
      color: var(--vscode-editor-foreground);
      background: var(--vscode-editor-background);
      padding: 12px;
    }
    h2 { margin: 0 0 8px 0; font-size: 14px; }
    .point { font-family: monospace; margin-bottom: 12px;
      color: var(--vscode-descriptionForeground); }
    table { width: 100%; border-collapse: collapse; }
    th, td {
      text-align: left; padding: 4px 8px;
      border-bottom: 1px solid
        var(--vscode-widget-border, #333);
    }
    th { font-weight: 600; }
    .empty {
      color: var(--vscode-descriptionForeground);
      font-style: italic; margin-top: 24px;
    }
  </style>
</head>
<body>
  <h2>Inspector</h2>
  <p class="empty">
    Click a point on the map to inspect pixel values.
  </p>
  <div id="results"></div>
  <script>
    const vscode = acquireVsCodeApi();

    window.addEventListener('message', (event) => {
      const msg = event.data;
      if (msg.type === 'inspectResult') {
        const el = document.getElementById('results');
        el.innerHTML = '';
        const p = document.createElement('div');
        p.className = 'point';
        p.textContent =
          msg.point.lat.toFixed(6) + ', ' +
          msg.point.lng.toFixed(6);
        el.appendChild(p);

        if (msg.values &&
            Object.keys(msg.values).length > 0) {
          const table = document.createElement('table');
          const thead = document.createElement('thead');
          thead.innerHTML =
            '<tr><th>Band</th><th>Value</th></tr>';
          table.appendChild(thead);
          const tbody = document.createElement('tbody');
          for (const [k, v] of
               Object.entries(msg.values)) {
            const tr = document.createElement('tr');
            tr.innerHTML =
              '<td>' + k + '</td><td>' + v + '</td>';
            tbody.appendChild(tr);
          }
          table.appendChild(tbody);
          el.appendChild(table);
        } else {
          const e = document.createElement('p');
          e.className = 'empty';
          e.textContent = 'No values at this point.';
          el.appendChild(e);
        }
      }
    });
  </script>
</body>
</html>`;
  }
}
