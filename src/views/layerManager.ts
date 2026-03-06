import * as vscode from 'vscode';
import { EEState, MapLayer } from '../ee/state';

export class LayerManagerProvider
  implements vscode.TreeDataProvider<LayerItem>
{
  private _onDidChange =
    new vscode.EventEmitter<
      LayerItem | undefined | void
    >();
  readonly onDidChangeTreeData =
    this._onDidChange.event;

  constructor(private readonly _state: EEState) {
    _state.onLayersChanged(() => {
      this._onDidChange.fire();
    });
  }

  getTreeItem(element: LayerItem): vscode.TreeItem {
    return element;
  }

  async getChildren(): Promise<LayerItem[]> {
    const layers = this._state.layers;

    if (layers.length === 0) {
      return [
        new LayerItem({
          id: '',
          name: 'No layers',
          tileUrl: '',
          visible: true,
          opacity: 1,
        }),
      ];
    }

    return layers.map((l) => new LayerItem(l));
  }
}

class LayerItem extends vscode.TreeItem {
  constructor(layer: MapLayer) {
    super(
      layer.name,
      vscode.TreeItemCollapsibleState.None
    );

    this.description = layer.visible
      ? `opacity: ${Math.round(layer.opacity * 100)}%`
      : 'hidden';

    this.iconPath = new vscode.ThemeIcon(
      layer.visible ? 'eye' : 'eye-closed'
    );

    if (!layer.id) {
      this.iconPath = new vscode.ThemeIcon('info');
      this.description = '';
    }
  }
}
