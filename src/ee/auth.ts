import * as vscode from 'vscode';
import { execSync } from 'child_process';

export class EEAuth {
  private _token: string | undefined;
  private _projectId: string | undefined;
  private _outputChannel: vscode.OutputChannel;

  constructor(outputChannel: vscode.OutputChannel) {
    this._outputChannel = outputChannel;
  }

  get token(): string | undefined {
    return this._token;
  }

  get projectId(): string | undefined {
    return this._projectId;
  }

  get isAuthenticated(): boolean {
    return this._token !== undefined;
  }

  async authenticate(): Promise<void> {
    const config = vscode.workspace.getConfiguration('eede');
    const method = config.get<string>(
      'authMethod', 'gcloud'
    );
    this._projectId =
      config.get<string>('projectId') || undefined;

    if (method === 'service-account') {
      await this._authServiceAccount(config);
    } else {
      await this._authGcloud();
    }
  }

  private async _authGcloud(): Promise<void> {
    try {
      const token = execSync(
        'gcloud auth print-access-token',
        { encoding: 'utf-8', timeout: 10000 }
      ).trim();
      this._token = token;

      if (!this._projectId) {
        try {
          this._projectId = execSync(
            'gcloud config get-value project',
            { encoding: 'utf-8', timeout: 5000 }
          ).trim();
        } catch {
          // Project ID is optional for some operations.
        }
      }

      this._outputChannel.appendLine(
        `Auth: gcloud token acquired` +
          (this._projectId
            ? ` (project: ${this._projectId})`
            : '')
      );
    } catch (err) {
      throw new Error(
        'Failed to get gcloud access token. ' +
          'Run "gcloud auth login" first.'
      );
    }
  }

  private async _authServiceAccount(
    config: vscode.WorkspaceConfiguration
  ): Promise<void> {
    const keyPath = config.get<string>(
      'serviceAccountKeyPath', ''
    );
    if (!keyPath) {
      throw new Error(
        'Service account key path not configured.'
      );
    }

    // For service account auth, we store the key path
    // and let the EE API handle token exchange.
    this._outputChannel.appendLine(
      `Auth: using service account key at ${keyPath}`
    );
    // Token exchange happens via the EE API at runtime.
    this._token = `sa:${keyPath}`;
  }

  async getHeaders(): Promise<Record<string, string>> {
    if (!this._token) {
      await this.authenticate();
    }
    if (!this._token) {
      throw new Error('Not authenticated.');
    }
    if (this._token.startsWith('sa:')) {
      return {};
    }
    return { Authorization: `Bearer ${this._token}` };
  }
}
