import * as vscode from 'vscode';
import * as http from 'http';

// OAuth 2.0 flow for Earth Engine authentication in
// web-hosted environments (code-server) where gcloud
// CLI may not be available.

const EE_SCOPES = [
  'https://www.googleapis.com/auth/earthengine',
  'https://www.googleapis.com/auth/devstorage.read_write',
];

const AUTH_ENDPOINT =
  'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_ENDPOINT =
  'https://oauth2.googleapis.com/token';

interface OAuthConfig {
  clientId: string;
  clientSecret: string;
  redirectPort: number;
}

interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  token_type: string;
}

export class EEOAuth {
  private _config: OAuthConfig;
  private _token: string | undefined;
  private _refreshToken: string | undefined;
  private _expiresAt: number = 0;

  constructor(
    private readonly _output: vscode.OutputChannel,
    private readonly _secrets: vscode.SecretStorage
  ) {
    this._config = {
      clientId: '',
      clientSecret: '',
      redirectPort: 18420,
    };
  }

  async loadConfig(): Promise<void> {
    const config =
      vscode.workspace.getConfiguration('eede');
    this._config.clientId =
      config.get<string>('oauthClientId') ||
      (await this._secrets.get('eede.oauthClientId')) ||
      '';
    this._config.clientSecret =
      config.get<string>('oauthClientSecret') ||
      (await this._secrets.get(
        'eede.oauthClientSecret'
      )) ||
      '';
  }

  get isConfigured(): boolean {
    return (
      this._config.clientId !== '' &&
      this._config.clientSecret !== ''
    );
  }

  async authenticate(): Promise<string> {
    await this.loadConfig();

    if (!this.isConfigured) {
      throw new Error(
        'OAuth client ID and secret not configured. ' +
          'Set eede.oauthClientId and ' +
          'eede.oauthClientSecret in settings.'
      );
    }

    // Try refresh first.
    if (this._refreshToken && Date.now() < this._expiresAt) {
      return this._token!;
    }

    if (this._refreshToken) {
      try {
        await this._refreshAccessToken();
        return this._token!;
      } catch {
        this._output.appendLine(
          'OAuth: refresh failed, starting new flow'
        );
      }
    }

    // Full OAuth flow.
    const code = await this._startAuthFlow();
    await this._exchangeCode(code);

    // Persist refresh token.
    if (this._refreshToken) {
      await this._secrets.store(
        'eede.refreshToken',
        this._refreshToken
      );
    }

    return this._token!;
  }

  private _startAuthFlow(): Promise<string> {
    return new Promise((resolve, reject) => {
      const redirectUri =
        `http://localhost:${this._config.redirectPort}/callback`;

      const authUrl = new URL(AUTH_ENDPOINT);
      authUrl.searchParams.set(
        'client_id',
        this._config.clientId
      );
      authUrl.searchParams.set(
        'redirect_uri',
        redirectUri
      );
      authUrl.searchParams.set('response_type', 'code');
      authUrl.searchParams.set(
        'scope',
        EE_SCOPES.join(' ')
      );
      authUrl.searchParams.set(
        'access_type',
        'offline'
      );
      authUrl.searchParams.set('prompt', 'consent');

      const server = http.createServer((req, res) => {
        const url = new URL(
          req.url || '',
          `http://localhost:${this._config.redirectPort}`
        );
        const code = url.searchParams.get('code');
        const error = url.searchParams.get('error');

        if (error) {
          res.writeHead(400, {
            'Content-Type': 'text/html',
          });
          res.end(
            '<h2>Authentication failed</h2>' +
              `<p>${error}</p>`
          );
          server.close();
          reject(new Error(`OAuth error: ${error}`));
          return;
        }

        if (code) {
          res.writeHead(200, {
            'Content-Type': 'text/html',
          });
          res.end(
            '<h2>Authenticated!</h2>' +
              '<p>You can close this tab and return ' +
              'to VS Code.</p>'
          );
          server.close();
          resolve(code);
          return;
        }

        res.writeHead(404);
        res.end();
      });

      server.listen(
        this._config.redirectPort,
        () => {
          vscode.env.openExternal(
            vscode.Uri.parse(authUrl.toString())
          );
          this._output.appendLine(
            'OAuth: opened browser for authentication'
          );
        }
      );

      // Timeout after 5 minutes.
      setTimeout(() => {
        server.close();
        reject(new Error('OAuth flow timed out'));
      }, 300000);
    });
  }

  private async _exchangeCode(
    code: string
  ): Promise<void> {
    const redirectUri =
      `http://localhost:${this._config.redirectPort}/callback`;

    const body = new URLSearchParams({
      code,
      client_id: this._config.clientId,
      client_secret: this._config.clientSecret,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    });

    const resp = await fetch(TOKEN_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type':
          'application/x-www-form-urlencoded',
      },
      body: body.toString(),
    });

    if (!resp.ok) {
      const text = await resp.text();
      throw new Error(
        `Token exchange failed: ${resp.status} ${text}`
      );
    }

    const data = (await resp.json()) as TokenResponse;
    this._token = data.access_token;
    this._refreshToken = data.refresh_token;
    this._expiresAt =
      Date.now() + data.expires_in * 1000 - 60000;

    this._output.appendLine(
      'OAuth: token acquired via authorization code'
    );
  }

  private async _refreshAccessToken(): Promise<void> {
    const body = new URLSearchParams({
      refresh_token: this._refreshToken!,
      client_id: this._config.clientId,
      client_secret: this._config.clientSecret,
      grant_type: 'refresh_token',
    });

    const resp = await fetch(TOKEN_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type':
          'application/x-www-form-urlencoded',
      },
      body: body.toString(),
    });

    if (!resp.ok) {
      throw new Error(
        `Token refresh failed: ${resp.status}`
      );
    }

    const data = (await resp.json()) as TokenResponse;
    this._token = data.access_token;
    this._expiresAt =
      Date.now() + data.expires_in * 1000 - 60000;

    this._output.appendLine('OAuth: token refreshed');
  }
}
