import * as vscode from 'vscode';
import { MapPanel } from './map/mapPanel';
import { InspectorPanel } from './inspector/inspectorPanel';
import { EENotebookController } from './notebook/eeNotebookController';
import { EENotebookSerializer } from './notebook/eeNotebookSerializer';
import { AssetBrowserProvider } from './views/assetBrowser';
import { TaskManagerProvider } from './views/taskManager';
import { LayerManagerProvider } from './views/layerManager';
import { EECompletionProvider } from './completion/eeCompletionProvider';
import { EEAuth } from './ee/auth';
import { EEState } from './ee/state';
import { inspectPoint } from './ee/inspect';
import { EEStatusBar } from './statusBar';
import { importFromFile } from './importer/codeEditorImporter';

export async function activate(
  context: vscode.ExtensionContext
) {
  const outputChannel = vscode.window.createOutputChannel(
    'Earth Engine'
  );
  outputChannel.appendLine('eede activating...');

  // Shared state for EE session.
  const eeState = new EEState();

  // Authentication.
  const auth = new EEAuth(
    outputChannel,
    context.secrets
  );

  // Tree views.
  const assetProvider = new AssetBrowserProvider(auth);
  const taskProvider = new TaskManagerProvider(auth);
  const layerProvider = new LayerManagerProvider(eeState);

  vscode.window.registerTreeDataProvider(
    'eede.assets', assetProvider
  );
  vscode.window.registerTreeDataProvider(
    'eede.tasks', taskProvider
  );
  vscode.window.registerTreeDataProvider(
    'eede.layers', layerProvider
  );

  // Notebook support.
  const serializer = new EENotebookSerializer();
  const controller = new EENotebookController(
    eeState, auth, outputChannel
  );

  context.subscriptions.push(
    vscode.workspace.registerNotebookSerializer(
      'eede-notebook', serializer
    ),
    controller
  );

  // Completion provider for JS and Python EE code.
  const completionProvider = new EECompletionProvider();
  context.subscriptions.push(
    vscode.languages.registerCompletionItemProvider(
      { language: 'javascript' },
      completionProvider,
      '.'
    ),
    vscode.languages.registerCompletionItemProvider(
      { language: 'python' },
      completionProvider,
      '.'
    )
  );

  // Commands.
  context.subscriptions.push(
    vscode.commands.registerCommand('eede.openMap', () => {
      MapPanel.createOrShow(context.extensionUri, eeState);
    }),
    vscode.commands.registerCommand(
      'eede.openInspector', () => {
        InspectorPanel.createOrShow(
          context.extensionUri, eeState, auth
        );
      }
    ),
    vscode.commands.registerCommand(
      'eede.authenticate', async () => {
        await auth.authenticate();
        statusBar.update();
        vscode.window.showInformationMessage(
          'Earth Engine: authenticated.'
        );
        assetProvider.refresh();
        taskProvider.refresh();
      }
    ),
    vscode.commands.registerCommand(
      'eede.newNotebook', async () => {
        const data = serializer.createEmptyNotebook();
        const doc =
          await vscode.workspace.openNotebookDocument(
            'eede-notebook', data
          );
        await vscode.window.showNotebookDocument(doc);
      }
    ),
    vscode.commands.registerCommand(
      'eede.inspectPoint',
      async (lat: number, lng: number) => {
        const results = await inspectPoint(
          lat, lng, eeState, auth
        );
        InspectorPanel.sendResults(results);
      }
    ),
    vscode.commands.registerCommand(
      'eede.refreshAssets', () => {
        assetProvider.refresh();
      }
    ),
    vscode.commands.registerCommand(
      'eede.cancelTask', (item) => {
        taskProvider.cancelTask(item);
      }
    ),
    vscode.commands.registerCommand(
      'eede.importScript', () => {
        importFromFile();
      }
    ),
    vscode.commands.registerCommand(
      'eede.toggleMap', () => {
        MapPanel.createOrShow(
          context.extensionUri, eeState
        );
      }
    ),
    vscode.commands.registerCommand(
      'eede.toggleCellLanguage', async () => {
        const editor =
          vscode.window.activeNotebookEditor;
        if (!editor) return;
        const idx =
          editor.selections[0]?.start ?? 0;
        const cell =
          editor.notebook.cellAt(idx);
        if (!cell) return;
        const newLang =
          cell.document.languageId === 'javascript'
            ? 'python'
            : 'javascript';
        await vscode.languages
          .setTextDocumentLanguage(
            cell.document, newLang
          );
      }
    ),
    vscode.commands.registerCommand(
      'eede.clearCellOutput', () => {
        vscode.commands.executeCommand(
          'notebook.cell.clearOutputs'
        );
      }
    )
  );

  // Status bar.
  const statusBar = new EEStatusBar(auth);
  context.subscriptions.push(statusBar);

  // Auto-authenticate on startup.
  auth.authenticate().then(
    () => {
      outputChannel.appendLine(
        'Earth Engine: authenticated'
      );
      statusBar.update();
      assetProvider.refresh();
      taskProvider.refresh();
    },
    (err) => {
      outputChannel.appendLine(
        `Earth Engine: auth failed: ${err}`
      );
      statusBar.update();
    }
  );

  outputChannel.appendLine('eede activated.');
}

export function deactivate() {}
