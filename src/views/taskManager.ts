import * as vscode from 'vscode';
import { EEAuth } from '../ee/auth';

interface EETask {
  id: string;
  task_type: string;
  state: string;
  description: string;
  creation_timestamp_ms: number;
  start_timestamp_ms?: number;
  update_timestamp_ms?: number;
}

export class TaskManagerProvider
  implements vscode.TreeDataProvider<TaskItem>
{
  private _onDidChange =
    new vscode.EventEmitter<
      TaskItem | undefined | void
    >();
  readonly onDidChangeTreeData =
    this._onDidChange.event;

  private _refreshTimer: NodeJS.Timeout | undefined;

  constructor(private readonly _auth: EEAuth) {}

  refresh(): void {
    this._onDidChange.fire();

    // Auto-refresh every 30s when tasks exist.
    if (!this._refreshTimer) {
      this._refreshTimer = setInterval(() => {
        this._onDidChange.fire();
      }, 30000);
    }
  }

  async cancelTask(item: TaskItem): Promise<void> {
    if (!item.taskId) return;

    try {
      const headers = await this._auth.getHeaders();
      const url =
        'https://earthengine.googleapis.com/v1/' +
        `projects/earthengine-legacy/operations/` +
        `${item.taskId}:cancel`;

      await fetch(url, {
        method: 'POST',
        headers,
      });

      vscode.window.showInformationMessage(
        `Task ${item.taskId} cancelled.`
      );
      this.refresh();
    } catch (err) {
      vscode.window.showErrorMessage(
        `Failed to cancel task: ${err}`
      );
    }
  }

  getTreeItem(element: TaskItem): vscode.TreeItem {
    return element;
  }

  async getChildren(
    _element?: TaskItem
  ): Promise<TaskItem[]> {
    if (!this._auth.isAuthenticated) {
      return [
        new TaskItem('Not authenticated', '', 'info'),
      ];
    }

    try {
      const tasks = await this._listTasks();

      if (tasks.length === 0) {
        return [new TaskItem('No tasks', '', 'info')];
      }

      return tasks.map((t) => {
        const label =
          t.description || t.task_type || t.id;
        const item = new TaskItem(label, t.id, t.state);
        return item;
      });
    } catch (err) {
      return [
        new TaskItem(`Error: ${err}`, '', 'error'),
      ];
    }
  }

  private async _listTasks(): Promise<EETask[]> {
    const headers = await this._auth.getHeaders();
    const url =
      'https://earthengine.googleapis.com/v1/' +
      'projects/earthengine-legacy/operations';

    const resp = await fetch(url, { headers });
    if (!resp.ok) {
      throw new Error(`EE API ${resp.status}`);
    }

    const data = (await resp.json()) as {
      operations?: EETask[];
    };
    return data.operations || [];
  }
}

class TaskItem extends vscode.TreeItem {
  constructor(
    label: string,
    public readonly taskId: string,
    public readonly state: string
  ) {
    super(label, vscode.TreeItemCollapsibleState.None);

    this.description = state.toLowerCase();

    if (
      state === 'RUNNING' ||
      state === 'READY'
    ) {
      this.iconPath = new vscode.ThemeIcon(
        'sync~spin'
      );
      this.contextValue = 'running';
    } else if (state === 'COMPLETED' ||
               state === 'SUCCEEDED') {
      this.iconPath = new vscode.ThemeIcon(
        'check'
      );
    } else if (state === 'FAILED') {
      this.iconPath = new vscode.ThemeIcon('error');
    } else if (state === 'CANCELLED') {
      this.iconPath = new vscode.ThemeIcon('close');
    } else {
      this.iconPath = new vscode.ThemeIcon('info');
    }
  }
}
