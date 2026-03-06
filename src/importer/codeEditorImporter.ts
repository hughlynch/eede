import * as vscode from 'vscode';
import { parseCodeEditorScript } from './scriptParser';

export { parseCodeEditorScript as importCodeEditorScript };

export async function importFromFile(): Promise<void> {
  const uris = await vscode.window.showOpenDialog({
    canSelectFiles: true,
    canSelectMany: false,
    filters: {
      'JavaScript': ['js'],
      'All Files': ['*'],
    },
    title: 'Import Code Editor Script',
  });

  if (!uris || uris.length === 0) return;

  const content = await vscode.workspace.fs.readFile(
    uris[0]
  );
  const source = new TextDecoder().decode(content);
  const cells = parseCodeEditorScript(source);

  const notebook = {
    version: 1,
    cells,
  };

  const name =
    uris[0].path
      .split('/')
      .pop()
      ?.replace(/\.js$/, '') || 'imported';
  const targetUri = vscode.Uri.joinPath(
    vscode.workspace.workspaceFolders?.[0]?.uri ||
      uris[0],
    '..',
    `${name}.eede`
  );

  await vscode.workspace.fs.writeFile(
    targetUri,
    new TextEncoder().encode(
      JSON.stringify(notebook, null, 2) + '\n'
    )
  );

  const doc =
    await vscode.workspace.openNotebookDocument(
      targetUri
    );
  await vscode.window.showNotebookDocument(doc);

  vscode.window.showInformationMessage(
    `Imported ${cells.length} cells from ` +
      `${uris[0].path.split('/').pop()}`
  );
}
