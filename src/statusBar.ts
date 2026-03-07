import * as vscode from 'vscode';
import { EEAuth } from './ee/auth';

export class EEStatusBar implements vscode.Disposable {
  private _item: vscode.StatusBarItem;
  private _disposables: vscode.Disposable[] = [];

  constructor(private readonly _auth: EEAuth) {
    this._item = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Left,
      50
    );
    this._update();
    this._item.show();
  }

  update(): void {
    this._update();
  }

  private _update(): void {
    if (this._auth.isAuthenticated) {
      const project =
        this._auth.projectId || 'no project';
      this._item.text =
        `$(globe) EE: ${project}`;
      this._item.tooltip =
        'Earth Engine: authenticated. Click to change project.';
      this._item.command = 'eede.selectProject';
      this._item.backgroundColor = undefined;
    } else {
      this._item.text = '$(globe) EE: not connected';
      this._item.tooltip =
        'Click to authenticate with Earth Engine.';
      this._item.command = 'eede.authenticate';
      this._item.backgroundColor =
        new vscode.ThemeColor(
          'statusBarItem.warningBackground'
        );
    }
  }

  dispose(): void {
    this._item.dispose();
    for (const d of this._disposables) {
      d.dispose();
    }
  }
}
