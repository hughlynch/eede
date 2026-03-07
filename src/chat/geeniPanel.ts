import * as vscode from 'vscode';
import { EEState } from '../ee/state';

export class GeeniPanel {
  private static _current: GeeniPanel | undefined;
  private readonly _panel: vscode.WebviewPanel;
  private readonly _state: EEState;
  private _disposables: vscode.Disposable[] = [];
  private _ws: import('http').ClientRequest | undefined;

  static createOrShow(
    extensionUri: vscode.Uri,
    state: EEState
  ) {
    if (GeeniPanel._current) {
      GeeniPanel._current._panel.reveal(
        vscode.ViewColumn.Beside
      );
      return;
    }

    const panel = vscode.window.createWebviewPanel(
      'eedeGeeni',
      'Geeni — EE Expert',
      vscode.ViewColumn.Beside,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
      }
    );

    GeeniPanel._current = new GeeniPanel(
      panel, state
    );
  }

  private constructor(
    panel: vscode.WebviewPanel,
    state: EEState
  ) {
    this._panel = panel;
    this._state = state;
    this._panel.webview.html = this._getHtml();

    this._panel.webview.onDidReceiveMessage(
      async (msg) => {
        if (msg.type === 'ask') {
          await this._handleQuestion(msg.text);
        } else if (msg.type === 'insertCell') {
          await this._insertCell(
            msg.code, msg.language
          );
        }
      },
      undefined,
      this._disposables
    );

    this._panel.onDidDispose(() => {
      GeeniPanel._current = undefined;
      for (const d of this._disposables) {
        d.dispose();
      }
    });
  }

  private async _handleQuestion(
    question: string
  ): Promise<void> {
    const endpoint = vscode.workspace
      .getConfiguration('eede')
      .get<string>('geeniEndpoint', '');

    if (endpoint) {
      await this._askViaHttp(endpoint, question);
    } else {
      await this._askViaWorker(question);
    }
  }

  private async _askViaHttp(
    endpoint: string,
    question: string
  ): Promise<void> {
    try {
      const url = endpoint.replace(/\/$/, '') +
        '/api/ask';
      const resp = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ message: question }),
      });

      if (!resp.ok) {
        throw new Error(`HTTP ${resp.status}`);
      }

      const data = await resp.json() as {
        text?: string;
        error?: string;
      };
      this._panel.webview.postMessage({
        type: 'response',
        text: data.text || data.error ||
          'No response.',
      });
    } catch (err) {
      this._panel.webview.postMessage({
        type: 'response',
        text: `Error: ${err}`,
      });
    }
  }

  private async _askViaWorker(
    question: string
  ): Promise<void> {
    // Run gee.answer via Python worker directly.
    const { execFile } = require('child_process');
    const { promisify } = require('util');
    const execFileAsync = promisify(execFile);

    // Find the geeni worker script.
    const geeniPath = vscode.workspace
      .getConfiguration('eede')
      .get<string>('geeniWorkerPath', '');

    if (!geeniPath) {
      this._panel.webview.postMessage({
        type: 'response',
        text: 'Configure `eede.geeniEndpoint` ' +
          '(gateway URL) or ' +
          '`eede.geeniWorkerPath` ' +
          '(path to geeni repo) in settings.',
      });
      return;
    }

    try {
      const script = `
import sys, json
sys.path.insert(0, "${geeniPath}")
from workers.gee.skills import answer
result = answer.run({"question": ${
        JSON.stringify(JSON.stringify(question))
      }})
print(json.dumps(result))
`;
      const { stdout } = await execFileAsync(
        'python3', ['-c', script],
        { timeout: 120000 }
      );
      const result = JSON.parse(stdout.trim());
      this._panel.webview.postMessage({
        type: 'response',
        text: result.text || result.explanation ||
          JSON.stringify(result),
      });
    } catch (err) {
      this._panel.webview.postMessage({
        type: 'response',
        text: `Error: ${err}`,
      });
    }
  }

  private async _insertCell(
    code: string,
    language: string
  ): Promise<void> {
    const editor = vscode.window.activeNotebookEditor;
    if (!editor ||
        editor.notebook.notebookType !== 'eede-notebook') {
      // No active eede notebook — create one.
      const serializer =
        new (require('../notebook/eeNotebookSerializer')
          .EENotebookSerializer)();
      const data = serializer.createEmptyNotebook();
      const doc =
        await vscode.workspace.openNotebookDocument(
          'eede-notebook', data
        );
      await vscode.window.showNotebookDocument(doc);
    }

    const nb = vscode.window.activeNotebookEditor;
    if (!nb) { return; }

    const cellData = new vscode.NotebookCellData(
      vscode.NotebookCellKind.Code,
      code,
      language === 'python' ? 'python' : 'javascript'
    );

    const edit = new vscode.WorkspaceEdit();
    const insertAt = nb.notebook.cellCount;
    edit.set(nb.notebook.uri, [
      vscode.NotebookEdit.insertCells(
        insertAt, [cellData]
      ),
    ]);
    await vscode.workspace.applyEdit(edit);
  }

  private _getHtml(): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: var(--vscode-font-family, sans-serif);
      font-size: var(--vscode-font-size, 13px);
      color: var(--vscode-editor-foreground);
      background: var(--vscode-editor-background);
      height: 100vh;
      display: flex;
      flex-direction: column;
    }
    .header {
      padding: 8px 12px;
      font-weight: 600;
      border-bottom: 1px solid
        var(--vscode-widget-border, #333);
    }
    .messages {
      flex: 1;
      overflow-y: auto;
      padding: 12px;
    }
    .message {
      margin-bottom: 16px;
      line-height: 1.5;
    }
    .message strong {
      display: block;
      margin-bottom: 4px;
      color: var(--vscode-textLink-foreground);
    }
    .message.user strong {
      color: var(--vscode-editor-foreground);
    }
    .message.user p {
      background: var(--vscode-input-background);
      padding: 8px 12px;
      border-radius: 8px;
      display: inline-block;
    }
    .md-content pre {
      background: var(--vscode-textCodeBlock-background,
        #1e1e1e);
      padding: 12px;
      border-radius: 4px;
      overflow-x: auto;
      margin: 8px 0;
      position: relative;
    }
    .md-content code {
      font-family: var(--vscode-editor-fontFamily,
        monospace);
      font-size: var(--vscode-editor-fontSize, 12px);
    }
    .md-content p { margin: 4px 0; }
    .md-content ul, .md-content ol {
      padding-left: 20px; margin: 4px 0;
    }
    .insert-btn {
      position: absolute;
      top: 4px;
      right: 4px;
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
      border: none;
      padding: 2px 8px;
      border-radius: 3px;
      cursor: pointer;
      font-size: 11px;
    }
    .insert-btn:hover {
      background:
        var(--vscode-button-hoverBackground);
    }
    .starters {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      margin: 8px 0;
    }
    .starter-chip {
      background: var(--vscode-input-background);
      border: 1px solid
        var(--vscode-widget-border, #555);
      color: var(--vscode-editor-foreground);
      padding: 4px 12px;
      border-radius: 16px;
      cursor: pointer;
      font-size: 12px;
    }
    .starter-chip:hover {
      background:
        var(--vscode-list-hoverBackground);
    }
    .thinking {
      color: var(--vscode-descriptionForeground);
      font-style: italic;
    }
    .input-area {
      display: flex;
      gap: 8px;
      padding: 8px 12px;
      border-top: 1px solid
        var(--vscode-widget-border, #333);
    }
    .input-area textarea {
      flex: 1;
      background: var(--vscode-input-background);
      color: var(--vscode-input-foreground);
      border: 1px solid
        var(--vscode-input-border, #555);
      padding: 6px 8px;
      border-radius: 4px;
      font-family: inherit;
      font-size: inherit;
      resize: none;
      min-height: 32px;
      max-height: 120px;
    }
    .input-area button {
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
      border: none;
      padding: 6px 16px;
      border-radius: 4px;
      cursor: pointer;
      font-size: inherit;
      align-self: flex-end;
    }
    .input-area button:hover {
      background:
        var(--vscode-button-hoverBackground);
    }
    .input-area button:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
  </style>
</head>
<body>
  <div class="header">Geeni — Earth Engine Expert</div>
  <div class="messages" id="messages">
    <div class="message assistant">
      <strong>geeni</strong>
      <div class="md-content"><p>Hi! I'm Geeni, an Earth
      Engine expert. Ask me about GEE APIs, band math,
      projections, compositing, exports, or anything
      else.</p></div>
    </div>
    <div class="starters" id="starters">
      <button class="starter-chip"
        data-q="How do I compute NDVI from Sentinel-2?">
        NDVI analysis</button>
      <button class="starter-chip"
        data-q="How do I mask clouds in Landsat 8 Collection 2?">
        Cloud masking</button>
      <button class="starter-chip"
        data-q="How do I export an image to Google Drive?">
        Export to Drive</button>
    </div>
  </div>
  <div class="input-area">
    <textarea id="input" rows="1"
      placeholder="Ask about Earth Engine..."
      autofocus></textarea>
    <button id="send-btn">Send</button>
  </div>
  <script>
    const vscode = acquireVsCodeApi();
    const messages = document.getElementById('messages');
    const input = document.getElementById('input');
    const sendBtn = document.getElementById('send-btn');
    const starters = document.getElementById('starters');

    // Starter chips
    starters.addEventListener('click', function(e) {
      const chip = e.target.closest('.starter-chip');
      if (!chip) return;
      input.value = chip.dataset.q;
      submit();
      starters.remove();
    });

    // Auto-resize textarea
    input.addEventListener('input', function() {
      input.style.height = 'auto';
      input.style.height =
        Math.min(input.scrollHeight, 120) + 'px';
    });

    input.addEventListener('keydown', function(e) {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        submit();
      }
    });

    sendBtn.addEventListener('click', submit);

    function submit() {
      var text = input.value.trim();
      if (!text) return;
      addMessage('you', text);
      input.value = '';
      input.style.height = 'auto';
      input.disabled = true;
      sendBtn.disabled = true;
      showThinking();
      vscode.postMessage({type: 'ask', text: text});
    }

    var thinkingEl = null;
    function showThinking() {
      thinkingEl = document.createElement('div');
      thinkingEl.className = 'message assistant thinking';
      thinkingEl.innerHTML =
        '<strong>geeni</strong>' +
        '<p>Thinking...</p>';
      messages.appendChild(thinkingEl);
      messages.scrollTop = messages.scrollHeight;
    }

    function removeThinking() {
      if (thinkingEl) {
        thinkingEl.remove();
        thinkingEl = null;
      }
    }

    function addMessage(who, text) {
      var div = document.createElement('div');
      div.className = 'message ' +
        (who === 'you' ? 'user' : 'assistant');
      var b = document.createElement('strong');
      b.textContent = who === 'you' ? 'you' : 'geeni';
      div.appendChild(b);

      if (who === 'you') {
        var p = document.createElement('p');
        p.textContent = text;
        div.appendChild(p);
      } else {
        var content = document.createElement('div');
        content.className = 'md-content';
        content.innerHTML = parseMarkdown(text);
        // Add "Insert as Cell" buttons to code blocks
        content.querySelectorAll('pre').forEach(
          function(pre) {
            var code = pre.querySelector('code');
            if (!code) return;
            var lang = 'javascript';
            var cls = code.className || '';
            if (cls.indexOf('python') >= 0) {
              lang = 'python';
            }
            var btn = document.createElement('button');
            btn.className = 'insert-btn';
            btn.textContent = 'Insert as Cell';
            btn.onclick = function() {
              vscode.postMessage({
                type: 'insertCell',
                code: code.textContent,
                language: lang
              });
            };
            pre.style.position = 'relative';
            pre.appendChild(btn);
          }
        );
        div.appendChild(content);
      }
      messages.appendChild(div);
      messages.scrollTop = messages.scrollHeight;
    }

    // Simple markdown parser (no external deps)
    function parseMarkdown(text) {
      if (!text) return '';
      // Escape HTML
      var html = text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');

      // Code blocks
      html = html.replace(
        /\`\`\`(\\w*)?\\n([\\s\\S]*?)\`\`\`/g,
        function(m, lang, code) {
          return '<pre><code class="language-' +
            (lang || 'javascript') + '">' +
            code + '</code></pre>';
        }
      );

      // Inline code
      html = html.replace(
        /\`([^\`]+)\`/g,
        '<code>$1</code>'
      );

      // Bold
      html = html.replace(
        /\\*\\*(.+?)\\*\\*/g,
        '<strong>$1</strong>'
      );

      // Paragraphs (double newline)
      html = html.split(/\\n\\n+/).map(function(p) {
        if (p.startsWith('<pre>') ||
            p.startsWith('<ul>') ||
            p.startsWith('<ol>')) return p;
        return '<p>' + p.replace(/\\n/g, '<br>') +
          '</p>';
      }).join('');

      return html;
    }

    // Receive responses from extension
    window.addEventListener('message', function(e) {
      var msg = e.data;
      if (msg.type === 'response') {
        removeThinking();
        addMessage('geeni', msg.text);
        input.disabled = false;
        sendBtn.disabled = false;
        input.focus();
      }
    });
  </script>
</body>
</html>`;
  }
}
