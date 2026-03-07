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
import { GeeniPanel } from './chat/geeniPanel';

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
    ),
    vscode.commands.registerCommand(
      'eede.selectProject', async () => {
        await selectProject(auth, statusBar, outputChannel);
        assetProvider.refresh();
        taskProvider.refresh();
      }
    ),
    vscode.commands.registerCommand(
      'eede.openGeeni', () => {
        GeeniPanel.createOrShow(
          context.extensionUri, eeState
        );
      }
    )
  );

  // Restore cached layers when an eede notebook opens.
  context.subscriptions.push(
    vscode.workspace.onDidOpenNotebookDocument((nb) => {
      if (nb.notebookType !== 'eede-notebook') return;
      const meta = nb.metadata as
        Record<string, unknown> | undefined;
      if (!meta) return;
      const layers = meta.layers as
        Array<{
          id: string; name: string;
          tileUrl: string; visible: boolean;
          opacity: number;
          visParams: Record<string, unknown>;
        }> | undefined;
      if (layers) {
        for (const l of layers) {
          eeState.addLayer(l);
        }
      }
      const center = meta.mapCenter as
        { lng: number; lat: number; zoom: number }
        | undefined;
      if (center) {
        eeState.setCenter(
          center.lng, center.lat, center.zoom
        );
      }
    })
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

async function selectProject(
  auth: EEAuth,
  statusBar: EEStatusBar,
  outputChannel: vscode.OutputChannel
): Promise<void> {
  // List GCP projects the user has access to.
  let projects: string[] = [];
  try {
    const { execSync } = require('child_process');
    const raw = execSync(
      'gcloud projects list --format="value(projectId)" ' +
      '--sort-by=projectId 2>/dev/null',
      { encoding: 'utf-8', timeout: 15000 }
    );
    projects = raw.trim().split('\n').filter(Boolean);
  } catch {
    // Fall through to manual entry.
  }

  let selected: string | undefined;
  if (projects.length > 0) {
    selected = await vscode.window.showQuickPick(
      projects,
      {
        placeHolder: 'Select a Google Cloud project for Earth Engine',
        title: 'Earth Engine Project',
      }
    );
  }

  if (!selected) {
    selected = await vscode.window.showInputBox({
      prompt: 'Enter Google Cloud project ID',
      placeHolder: 'my-project-id',
      value: auth.projectId || '',
    });
  }

  if (!selected) { return; }

  // Check if the EE API is enabled on this project.
  outputChannel.appendLine(
    `Checking Earth Engine API on project ${selected}...`
  );

  let eeEnabled = false;
  try {
    const { execSync } = require('child_process');
    const services = execSync(
      `gcloud services list --project="${selected}" ` +
      '--format="value(config.name)" ' +
      '--filter="config.name:earthengine" 2>/dev/null',
      { encoding: 'utf-8', timeout: 15000 }
    );
    eeEnabled = services.includes('earthengine');
  } catch {
    // Can't check — assume it's fine and let EE API
    // report the error at runtime.
    eeEnabled = true;
  }

  if (!eeEnabled) {
    const enable = await vscode.window.showWarningMessage(
      `Earth Engine API is not enabled on project "${selected}".`,
      'Enable it',
      'Use anyway'
    );
    if (enable === 'Enable it') {
      try {
        const { execSync } = require('child_process');
        execSync(
          `gcloud services enable earthengine.googleapis.com ` +
          `--project="${selected}" 2>&1`,
          { encoding: 'utf-8', timeout: 30000 }
        );
        vscode.window.showInformationMessage(
          'Earth Engine API enabled.'
        );
      } catch (err) {
        vscode.window.showErrorMessage(
          `Failed to enable EE API: ${err}`
        );
        return;
      }
    } else if (enable !== 'Use anyway') {
      return;
    }
  }

  // Save to settings and update auth.
  await auth.setProject(selected);
  const config = vscode.workspace.getConfiguration('eede');
  await config.update(
    'projectId', selected,
    vscode.ConfigurationTarget.Global
  );
  statusBar.update();
  vscode.window.showInformationMessage(
    `Earth Engine project set to "${selected}".`
  );
}

export function deactivate() {}
