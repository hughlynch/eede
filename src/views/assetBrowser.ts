import * as vscode from 'vscode';
import { EEAuth } from '../ee/auth';

interface EEAsset {
  type: string;
  name: string;
  id: string;
}

export class AssetBrowserProvider
  implements vscode.TreeDataProvider<AssetItem>
{
  private _onDidChange =
    new vscode.EventEmitter<
      AssetItem | undefined | void
    >();
  readonly onDidChangeTreeData =
    this._onDidChange.event;

  constructor(private readonly _auth: EEAuth) {}

  refresh(): void {
    this._onDidChange.fire();
  }

  getTreeItem(element: AssetItem): vscode.TreeItem {
    return element;
  }

  async getChildren(
    element?: AssetItem
  ): Promise<AssetItem[]> {
    if (!this._auth.isAuthenticated) {
      return [
        new AssetItem(
          'Not authenticated',
          '',
          'info',
          vscode.TreeItemCollapsibleState.None
        ),
      ];
    }

    const parentId = element
      ? element.assetId
      : `projects/${this._auth.projectId || 'earthengine-legacy'}/assets`;

    try {
      const assets = await this._listAssets(parentId);
      return assets.map((a) => {
        const isFolder =
          a.type === 'FOLDER' ||
          a.type === 'IMAGE_COLLECTION';
        const label = a.id.split('/').pop() || a.id;
        return new AssetItem(
          label,
          a.id,
          a.type,
          isFolder
            ? vscode.TreeItemCollapsibleState.Collapsed
            : vscode.TreeItemCollapsibleState.None
        );
      });
    } catch (err) {
      return [
        new AssetItem(
          `Error: ${err}`,
          '',
          'error',
          vscode.TreeItemCollapsibleState.None
        ),
      ];
    }
  }

  private async _listAssets(
    parent: string
  ): Promise<EEAsset[]> {
    const headers = await this._auth.getHeaders();
    const url =
      `https://earthengine.googleapis.com/v1/` +
      `${parent}:listAssets`;

    const resp = await fetch(url, { headers });
    if (!resp.ok) {
      throw new Error(`EE API ${resp.status}`);
    }

    const data = (await resp.json()) as {
      assets?: EEAsset[];
    };
    return data.assets || [];
  }
}

class AssetItem extends vscode.TreeItem {
  constructor(
    label: string,
    public readonly assetId: string,
    public readonly assetType: string,
    collapsibleState: vscode.TreeItemCollapsibleState
  ) {
    super(label, collapsibleState);

    this.tooltip = assetId || label;
    this.description = assetType.toLowerCase();

    if (assetType === 'FOLDER') {
      this.iconPath = new vscode.ThemeIcon('folder');
    } else if (assetType === 'IMAGE_COLLECTION') {
      this.iconPath = new vscode.ThemeIcon(
        'library'
      );
    } else if (assetType === 'IMAGE') {
      this.iconPath = new vscode.ThemeIcon('file-media');
    } else if (assetType === 'TABLE') {
      this.iconPath = new vscode.ThemeIcon('table');
    } else if (
      assetType === 'info' ||
      assetType === 'error'
    ) {
      this.iconPath = new vscode.ThemeIcon('info');
    }
  }
}
