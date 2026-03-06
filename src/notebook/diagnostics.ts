import * as vscode from 'vscode';

// Provides inline error diagnostics for EE notebook
// cells. Parses error messages from cell execution
// and maps them to source locations.

const diagnosticCollection =
  vscode.languages.createDiagnosticCollection('eede');

export function clearDiagnostics(
  uri: vscode.Uri
): void {
  diagnosticCollection.set(uri, []);
}

export function setDiagnosticsFromError(
  uri: vscode.Uri,
  error: string,
  cellIndex: number
): void {
  const diagnostics: vscode.Diagnostic[] = [];

  // Try to extract line number from error message.
  const lineMatch = error.match(
    /(?:line |Line |:)(\d+)(?::(\d+))?/
  );
  let line = 0;
  let col = 0;
  if (lineMatch) {
    line = Math.max(0, parseInt(lineMatch[1]) - 1);
    if (lineMatch[2]) {
      col = Math.max(0, parseInt(lineMatch[2]) - 1);
    }
  }

  // Clean up error message.
  let message = error
    .replace(/^ERROR:\s*/i, '')
    .replace(/^EE init error:\s*/i, '')
    .trim();

  // Classify severity.
  let severity = vscode.DiagnosticSeverity.Error;
  if (
    message.includes('warning') ||
    message.includes('Warning')
  ) {
    severity = vscode.DiagnosticSeverity.Warning;
  }

  const range = new vscode.Range(
    line, col, line, col + 100
  );
  const diagnostic = new vscode.Diagnostic(
    range,
    message,
    severity
  );
  diagnostic.source = 'eede';

  // Add EE-specific code for common errors.
  if (message.includes('not found')) {
    diagnostic.code = 'ee-asset-not-found';
  } else if (message.includes('permission')) {
    diagnostic.code = 'ee-permission-denied';
  } else if (message.includes('quota')) {
    diagnostic.code = 'ee-quota-exceeded';
  } else if (
    message.includes('SyntaxError') ||
    message.includes('syntax error')
  ) {
    diagnostic.code = 'syntax-error';
  }

  diagnostics.push(diagnostic);
  diagnosticCollection.set(uri, diagnostics);
}

export function disposeDiagnostics(): void {
  diagnosticCollection.dispose();
}
