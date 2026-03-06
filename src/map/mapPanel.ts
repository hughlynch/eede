import * as vscode from 'vscode';
import { EEState, MapLayer } from '../ee/state';

export class MapPanel {
  private static _current: MapPanel | undefined;
  private readonly _panel: vscode.WebviewPanel;
  private readonly _state: EEState;
  private _disposables: vscode.Disposable[] = [];

  static createOrShow(
    extensionUri: vscode.Uri,
    state: EEState
  ) {
    const column = vscode.ViewColumn.Beside;

    if (MapPanel._current) {
      MapPanel._current._panel.reveal(column);
      return;
    }

    const panel = vscode.window.createWebviewPanel(
      'eedeMap',
      'Earth Engine Map',
      column,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
      }
    );

    MapPanel._current = new MapPanel(panel, state);
  }

  private constructor(
    panel: vscode.WebviewPanel,
    state: EEState
  ) {
    this._panel = panel;
    this._state = state;

    this._panel.webview.html = this._getHtml();

    // Sync existing layers to map.
    for (const layer of state.layers) {
      this._postAddLayer(layer);
    }

    // Listen for state changes.
    this._disposables.push(
      state.onLayersChanged((layers) => {
        this._panel.webview.postMessage({
          type: 'setLayers',
          layers,
        });
      }),
      state.onCenterChanged((center) => {
        this._panel.webview.postMessage({
          type: 'setCenter',
          ...center,
        });
      })
    );

    // Handle messages from the webview.
    this._panel.webview.onDidReceiveMessage(
      async (msg) => {
        if (msg.type === 'inspectPoint') {
          await vscode.commands.executeCommand(
            'eede.openInspector'
          );
          await vscode.commands.executeCommand(
            'eede.inspectPoint',
            msg.lat,
            msg.lng
          );
        }
      },
      null,
      this._disposables
    );

    this._panel.onDidDispose(() => {
      MapPanel._current = undefined;
      for (const d of this._disposables) {
        d.dispose();
      }
    });
  }

  private _postAddLayer(layer: MapLayer) {
    this._panel.webview.postMessage({
      type: 'addLayer',
      layer,
    });
  }

  private _getHtml(): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport"
    content="width=device-width, initial-scale=1.0">
  <title>Earth Engine Map</title>
  <link rel="stylesheet"
    href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
  <script
    src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js">
  </script>
  <style>
    body { margin: 0; padding: 0; overflow: hidden; }
    #map { width: 100vw; height: 100vh; }
    .layer-control {
      position: absolute; top: 10px; right: 10px;
      z-index: 1000; background: var(--vscode-editor-background, #fff);
      color: var(--vscode-editor-foreground, #000);
      border-radius: 4px; padding: 8px; font-size: 12px;
      font-family: var(--vscode-font-family, sans-serif);
      max-height: 300px; overflow-y: auto;
      box-shadow: 0 2px 6px rgba(0,0,0,0.3);
    }
    .layer-item { display: flex; align-items: center;
      gap: 6px; padding: 2px 0; }
    .layer-item input { margin: 0; }
    .coords {
      position: absolute; bottom: 4px; left: 10px;
      z-index: 1000; background: rgba(0,0,0,0.6);
      color: #fff; padding: 2px 8px; border-radius: 3px;
      font-size: 11px; font-family: monospace;
    }
  </style>
</head>
<body>
  <div id="map"></div>
  <div class="layer-control" id="layerControl"></div>
  <div class="coords" id="coords">0.000, 0.000</div>
  <script>
    const vscode = acquireVsCodeApi();
    const map = L.map('map').setView([0, 0], 3);

    L.tileLayer(
      'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
      { attribution: '© OpenStreetMap contributors',
        maxZoom: 19 }
    ).addTo(map);

    const eeLayers = {};

    map.on('mousemove', (e) => {
      document.getElementById('coords').textContent =
        e.latlng.lat.toFixed(4) + ', ' +
        e.latlng.lng.toFixed(4);
    });

    map.on('click', (e) => {
      vscode.postMessage({
        type: 'inspectPoint',
        lat: e.latlng.lat,
        lng: e.latlng.lng
      });
    });

    function addTileLayer(layer) {
      if (!layer.tileUrl) return;
      const tl = L.tileLayer(layer.tileUrl, {
        opacity: layer.opacity,
        maxZoom: 20
      });
      if (layer.visible) tl.addTo(map);
      eeLayers[layer.id] = tl;
      updateLayerControl();
    }

    function updateLayerControl() {
      const el = document.getElementById('layerControl');
      el.innerHTML = Object.keys(eeLayers).length === 0
        ? '<em>No layers</em>'
        : '';
      for (const [id, tl] of Object.entries(eeLayers)) {
        const div = document.createElement('div');
        div.className = 'layer-item';
        const cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.checked = map.hasLayer(tl);
        cb.onchange = () => {
          if (cb.checked) tl.addTo(map);
          else map.removeLayer(tl);
        };
        const label = document.createElement('span');
        label.textContent = id;
        div.appendChild(cb);
        div.appendChild(label);
        el.appendChild(div);
      }
    }

    window.addEventListener('message', (event) => {
      const msg = event.data;
      if (msg.type === 'addLayer') {
        addTileLayer(msg.layer);
      } else if (msg.type === 'setLayers') {
        // Full sync.
        for (const tl of Object.values(eeLayers)) {
          map.removeLayer(tl);
        }
        for (const k of Object.keys(eeLayers)) {
          delete eeLayers[k];
        }
        for (const layer of msg.layers) {
          addTileLayer(layer);
        }
      } else if (msg.type === 'setCenter') {
        map.setView([msg.lat, msg.lng], msg.zoom);
      }
    });

    updateLayerControl();
  </script>
</body>
</html>`;
  }
}
