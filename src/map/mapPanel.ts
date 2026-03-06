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
        } else if (msg.type === 'geometryCreated') {
          if (msg.eeCode) {
            await vscode.env.clipboard.writeText(
              msg.eeCode
            );
            vscode.window.showInformationMessage(
              'Geometry copied to clipboard as EE code.'
            );
          }
          // Store in state for cell access.
          state.setVariable(
            '_lastGeometry',
            msg.geojson
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
  <link rel="stylesheet"
    href="https://unpkg.com/leaflet-draw@1.0.4/dist/leaflet.draw.css" />
  <script
    src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js">
  </script>
  <script
    src="https://unpkg.com/leaflet-draw@1.0.4/dist/leaflet.draw.js">
  </script>
  <style>
    body { margin: 0; padding: 0; overflow: hidden; }
    #map { width: 100vw; height: 100vh; }
    .layer-control {
      position: absolute; top: 10px; right: 10px;
      z-index: 1000;
      background: var(--vscode-editor-background, #fff);
      color: var(--vscode-editor-foreground, #000);
      border: 1px solid var(--vscode-widget-border, #ccc);
      border-radius: 4px; padding: 8px; font-size: 12px;
      font-family: var(--vscode-font-family, sans-serif);
      max-height: 300px; overflow-y: auto;
      box-shadow: 0 2px 6px rgba(0,0,0,0.15);
    }
    .layer-item { display: flex; align-items: center;
      gap: 6px; padding: 2px 0; }
    .layer-item input { margin: 0; }
    .coords {
      position: absolute; bottom: 4px; left: 10px;
      z-index: 1000;
      background: var(--vscode-editor-background, #000);
      color: var(--vscode-editor-foreground, #fff);
      border: 1px solid var(--vscode-widget-border, #555);
      padding: 2px 8px; border-radius: 3px;
      font-size: 11px; font-family: monospace;
      opacity: 0.9;
    }
    .geom-toolbar {
      position: absolute; bottom: 4px; right: 10px;
      z-index: 1000;
      background: var(--vscode-editor-background, #fff);
      color: var(--vscode-editor-foreground, #000);
      border: 1px solid var(--vscode-widget-border, #ccc);
      border-radius: 4px; padding: 4px 8px;
      font-size: 11px;
      font-family: var(--vscode-font-family, sans-serif);
      display: none; cursor: pointer;
    }
    .geom-toolbar:hover {
      background: var(--vscode-button-background, #007acc);
      color: var(--vscode-button-foreground, #fff);
    }
  </style>
</head>
<body>
  <div id="map"></div>
  <div class="layer-control" id="layerControl"></div>
  <div class="coords" id="coords">0.000, 0.000</div>
  <div class="geom-toolbar" id="geomToolbar"
    onclick="copyAllGeometries()">
    Copy All as FeatureCollection
  </div>
  <script>
    const vscode = acquireVsCodeApi();
    const map = L.map('map').setView([0, 0], 3);

    // Theme-aware basemap: detect dark vs light.
    const isDark = document.body.classList.contains(
      'vscode-dark') ||
      document.body.getAttribute('data-vscode-theme-kind')
        === 'vscode-dark';

    const lightTiles =
      'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
    const darkTiles =
      'https://{s}.basemaps.cartocdn.com/' +
      'dark_all/{z}/{x}/{y}{r}.png';

    let basemap = L.tileLayer(
      isDark ? darkTiles : lightTiles,
      { attribution: '© OpenStreetMap contributors' +
          (isDark ? ' © CARTO' : ''),
        maxZoom: 19 }
    ).addTo(map);

    // Watch for theme changes.
    const observer = new MutationObserver(() => {
      const nowDark = document.body.classList.contains(
        'vscode-dark') ||
        document.body.getAttribute(
          'data-vscode-theme-kind') === 'vscode-dark';
      const url = nowDark ? darkTiles : lightTiles;
      if (basemap._url !== url) {
        map.removeLayer(basemap);
        basemap = L.tileLayer(url, {
          attribution: '© OpenStreetMap contributors' +
            (nowDark ? ' © CARTO' : ''),
          maxZoom: 19
        }).addTo(map);
      }
    });
    observer.observe(document.body, {
      attributes: true,
      attributeFilter: ['class', 'data-vscode-theme-kind']
    });

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

    // Drawing tools.
    const drawnItems = new L.FeatureGroup();
    map.addLayer(drawnItems);

    const drawControl = new L.Control.Draw({
      edit: { featureGroup: drawnItems },
      draw: {
        polygon: true,
        polyline: false,
        rectangle: true,
        circle: false,
        circlemarker: false,
        marker: true
      }
    });
    map.addControl(drawControl);

    function geomToEE(geom) {
      if (geom.type === 'Point')
        return 'ee.Geometry.Point(' +
          JSON.stringify(geom.coordinates) + ')';
      if (geom.type === 'Polygon')
        return 'ee.Geometry.Polygon(' +
          JSON.stringify(geom.coordinates) + ')';
      if (geom.type === 'LineString')
        return 'ee.Geometry.LineString(' +
          JSON.stringify(geom.coordinates) + ')';
      return '';
    }

    function updateGeomToolbar() {
      const count = drawnItems.getLayers().length;
      const tb = document.getElementById('geomToolbar');
      tb.style.display = count >= 2 ? 'block' : 'none';
      tb.textContent =
        'Copy ' + count + ' geometries as FeatureCollection';
    }

    function copyAllGeometries() {
      const geoms = [];
      drawnItems.eachLayer(function(layer) {
        const geom = layer.toGeoJSON().geometry;
        geoms.push(geomToEE(geom));
      });
      if (geoms.length === 0) return;
      const code =
        'ee.FeatureCollection([\\n' +
        geoms.map(function(g) {
          return '  ee.Feature(' + g + ')';
        }).join(',\\n') +
        '\\n])';
      vscode.postMessage({
        type: 'geometryCreated',
        geojson: {
          type: 'FeatureCollection',
          features: drawnItems.toGeoJSON().features
        },
        eeCode: code
      });
    }

    map.on(L.Draw.Event.CREATED, function(event) {
      const layer = event.layer;
      drawnItems.addLayer(layer);

      const geojson = layer.toGeoJSON();
      const geom = geojson.geometry;
      const code = geomToEE(geom);

      vscode.postMessage({
        type: 'geometryCreated',
        geojson: geom,
        eeCode: code
      });
      updateGeomToolbar();
    });

    map.on(L.Draw.Event.DELETED, function() {
      updateGeomToolbar();
    });

    updateLayerControl();
    updateGeomToolbar();
  </script>
</body>
</html>`;
  }
}
