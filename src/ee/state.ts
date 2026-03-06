import * as vscode from 'vscode';

export interface MapLayer {
  id: string;
  name: string;
  tileUrl: string;
  visible: boolean;
  opacity: number;
  eeObject?: unknown;
  visParams?: Record<string, unknown>;
}

export interface InspectorResult {
  point: { lng: number; lat: number };
  values: Record<string, unknown>;
  timestamp: string;
}

// Shared state for the EE session — coordinates
// between notebook cells, map panel, and inspector.
export class EEState {
  private _layers: MapLayer[] = [];
  private _variables = new Map<string, unknown>();
  private _center: {
    lng: number;
    lat: number;
    zoom: number;
  } = { lng: 0, lat: 0, zoom: 3 };

  private _onLayersChanged =
    new vscode.EventEmitter<MapLayer[]>();
  readonly onLayersChanged =
    this._onLayersChanged.event;

  private _onCenterChanged =
    new vscode.EventEmitter<{
      lng: number;
      lat: number;
      zoom: number;
    }>();
  readonly onCenterChanged =
    this._onCenterChanged.event;

  private _onVariableSet =
    new vscode.EventEmitter<{
      name: string;
      value: unknown;
    }>();
  readonly onVariableSet =
    this._onVariableSet.event;

  get layers(): MapLayer[] {
    return [...this._layers];
  }

  get center() {
    return { ...this._center };
  }

  addLayer(layer: MapLayer): void {
    this._layers.push(layer);
    this._onLayersChanged.fire(this._layers);
  }

  removeLayer(id: string): void {
    this._layers = this._layers.filter(
      (l) => l.id !== id
    );
    this._onLayersChanged.fire(this._layers);
  }

  updateLayerVisibility(
    id: string,
    visible: boolean
  ): void {
    const layer = this._layers.find((l) => l.id === id);
    if (layer) {
      layer.visible = visible;
      this._onLayersChanged.fire(this._layers);
    }
  }

  setCenter(
    lng: number,
    lat: number,
    zoom: number
  ): void {
    this._center = { lng, lat, zoom };
    this._onCenterChanged.fire(this._center);
  }

  setVariable(name: string, value: unknown): void {
    this._variables.set(name, value);
    this._onVariableSet.fire({ name, value });
  }

  getVariable(name: string): unknown {
    return this._variables.get(name);
  }

  getAllVariables(): Map<string, unknown> {
    return new Map(this._variables);
  }

  nextLayerId(): string {
    return `layer-${Date.now()}-${Math.random()
      .toString(36)
      .slice(2, 8)}`;
  }
}
