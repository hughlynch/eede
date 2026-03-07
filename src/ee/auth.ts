import * as vscode from 'vscode';
import { execSync } from 'child_process';
import { EEOAuth } from './oauth';

export class EEAuth {
  private _token: string | undefined;
  private _projectId: string | undefined;
  private _outputChannel: vscode.OutputChannel;
  private _oauth: EEOAuth | undefined;

  constructor(
    outputChannel: vscode.OutputChannel,
    secrets?: vscode.SecretStorage
  ) {
    this._outputChannel = outputChannel;
    if (secrets) {
      this._oauth = new EEOAuth(outputChannel, secrets);
    }
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

    if (method === 'oauth') {
      await this._authOAuth();
    } else if (method === 'service-account') {
      await this._authServiceAccount(config);
    } else {
      await this._authGcloud();
    }
  }

  private async _authGcloud(): Promise<void> {
    try {
      // Try application-default first (works after
      // gcloud auth application-default login), then
      // fall back to regular gcloud auth.
      let token = '';
      for (const cmd of [
        'gcloud auth application-default ' +
          'print-access-token 2>&1',
        'gcloud auth print-access-token 2>&1',
      ]) {
        try {
          const raw = execSync(cmd, {
            encoding: 'utf-8', timeout: 10000,
          });
          const t = raw.trim();
          if (t && !t.startsWith('ERROR') &&
              t.startsWith('ya29.')) {
            token = t;
            break;
          }
        } catch {
          continue;
        }
      }
      if (!token) {
        throw new Error(
          'No valid token from gcloud. Run ' +
          '"gcloud auth application-default login" ' +
          'in the terminal.'
        );
      }
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

  private async _authOAuth(): Promise<void> {
    if (!this._oauth) {
      throw new Error(
        'OAuth not available (no secret storage).'
      );
    }
    this._token = await this._oauth.authenticate();
    this._outputChannel.appendLine(
      'Auth: OAuth token acquired'
    );
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
