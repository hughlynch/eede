import { spawn } from 'child_process';

// Async cell execution via child processes.
// Replaces execSync to avoid blocking the extension host.

export interface RunResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export function runCell(
  command: string,
  args: string[],
  env: Record<string, string>,
  timeout: number = 60000
): Promise<RunResult> {
  return new Promise((resolve, reject) => {
    const proc = spawn(command, args, {
      env: { ...process.env, ...env },
      timeout,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });

    proc.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    proc.on('close', (code) => {
      resolve({
        stdout,
        stderr,
        exitCode: code ?? 1,
      });
    });

    proc.on('error', (err) => {
      reject(err);
    });

    // Write nothing to stdin and close it.
    proc.stdin.end();
  });
}

// Runs a script string via a command.
export async function runScript(
  command: string,
  script: string,
  env: Record<string, string>,
  timeout: number = 60000
): Promise<RunResult> {
  return new Promise((resolve, reject) => {
    const proc = spawn(command, ['-c', script], {
      env: { ...process.env, ...env },
      timeout,
      stdio: ['pipe', 'pipe', 'pipe'],
      shell: true,
    });

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });

    proc.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    proc.on('close', (code) => {
      resolve({
        stdout,
        stderr,
        exitCode: code ?? 1,
      });
    });

    proc.on('error', (err) => {
      reject(err);
    });

    proc.stdin.end();
  });
}

// Writes a script to a temp file and executes it.
// More reliable than passing code via -c for large
// scripts.
export async function runScriptFile(
  command: string,
  script: string,
  ext: string,
  env: Record<string, string>,
  timeout: number = 60000
): Promise<RunResult> {
  const { writeFileSync, unlinkSync } = await import('fs');
  const { tmpdir } = await import('os');
  const { join } = await import('path');

  const tmpFile = join(
    tmpdir(),
    `eede-cell-${Date.now()}.${ext}`
  );

  try {
    writeFileSync(tmpFile, script, 'utf-8');

    return new Promise((resolve, reject) => {
      const proc = spawn(command, [tmpFile], {
        env: { ...process.env, ...env },
        timeout,
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      let stdout = '';
      let stderr = '';

      proc.stdout.on('data', (chunk) => {
        stdout += chunk.toString();
      });

      proc.stderr.on('data', (chunk) => {
        stderr += chunk.toString();
      });

      proc.on('close', (code) => {
        try {
          unlinkSync(tmpFile);
        } catch {
          // Ignore cleanup errors.
        }
        resolve({
          stdout,
          stderr,
          exitCode: code ?? 1,
        });
      });

      proc.on('error', (err) => {
        try {
          unlinkSync(tmpFile);
        } catch {
          // Ignore cleanup errors.
        }
        reject(err);
      });

      proc.stdin.end();
    });
  } catch (err) {
    try {
      unlinkSync(tmpFile);
    } catch {
      // Ignore.
    }
    throw err;
  }
}
