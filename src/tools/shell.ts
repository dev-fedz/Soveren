import { exec, spawn, ChildProcess } from 'child_process';
import { promisify } from 'util';
import { Tool, ToolResult } from './registry.js';
import { PermissionManager, PermissionRequiredError } from '../permissions/manager.js';
import { WorkspaceContext } from '../context/workspaceContext.js';
import path from 'path';
import fs from 'fs';

const execPromise = promisify(exec);

export type ShellOutputCallback = (output: string, command: string, pid?: number) => void;

// Active background processes
const activeBackgroundProcesses = new Map<number, ChildProcess>();

// Well-known long-running commands (dev servers, watchers, etc.)
const LONG_RUNNING_PATTERNS = [
  /\b(run\s+dev|start|serve|runserver|uvicorn|vite|next\s+dev)\b/i,
  /\b(docker\s+compose\s+up(?!\s+-d))\b/i,  // docker compose up without -d
  /\b(npm\s+run\s+start|npm\s+start|yarn\s+start|pnpm\s+start)\b/i,
  /\b(flask\s+run|rails\s+server|rails\s+s)\b/i,
  /\b(ng\s+serve|nuxt\s+dev|remix\s+dev|astro\s+dev)\b/i,
  /\b(nodemon|ts-node-dev|tsx\s+watch)\b/i,
  /\b(python.*manage\.py\s+runserver)\b/i,
];

// Short-lived commands that always run in foreground
const FOREGROUND_PATTERNS = [
  /\b(docker\s+compose\s+up\s+-d)\b/i,  // detached docker compose
  /\b(docker\s+compose\s+(build|down|stop|pull|push|ps|logs|exec|run))\b/i,
  /\b(npm\s+(install|ci|run\s+build|run\s+lint|test|audit))\b/i,
  /\b(yarn\s+(install|build|lint|test))\b/i,
  /\b(pip\s+install|poetry\s+install|pipenv\s+install)\b/i,
  /\b(make|cmake)\b/i,
  /\b(ls|pwd|echo|cat|head|tail|grep|find|which|wc|du|df)\b/i,
  /\b(git\s+(status|diff|log|branch|commit|push|pull|fetch|clone|checkout|merge|rebase))\b/i,
  /\b(mkdir|touch|cp|mv|chmod|chown)\b/i,
  /\b(pytest|jest|vitest|mocha|cargo\s+test)\b/i,
];

export class ShellTool implements Tool {
  name = 'run_command';
  description = `Execute a command in the system terminal. Supports foreground and background (dev server) modes.

IMPORTANT: Use the 'cwd' parameter to specify the target project directory relative to the workspace root (e.g. the specific backend or frontend folder detected in the workspace, such as "withgod-be" or "withgod-fe"). Do NOT guess generic names like "backend" if the actual directory is named differently.
Without 'cwd', the command runs from the workspace root.`;

  inputSchema = {
    type: 'object',
    properties: {
      command: {
        type: 'string',
        description: 'The shell command to execute.',
      },
      cwd: {
        type: 'string',
        description: 'Target directory relative to the workspace root (e.g. "withgod-be", "withgod-fe"). If omitted, uses workspace root.',
      },
      isBackground: {
        type: 'boolean',
        description: 'Set to true to run a long-running process (e.g. dev server) in the background.',
      },
      timeoutMs: {
        type: 'number',
        description: 'Timeout in milliseconds for foreground commands. Default: 60000 (60s).',
      },
    },
    required: ['command'],
  };

  private static outputListeners: Set<ShellOutputCallback> = new Set();

  /**
   * Register a listener for command output (used for URL/service detection).
   */
  static addOutputListener(listener: ShellOutputCallback): () => void {
    ShellTool.outputListeners.add(listener);
    return () => {
      ShellTool.outputListeners.delete(listener);
    };
  }

  /**
   * Notify registered listeners of command output.
   */
  private static notifyListeners(output: string, command: string, pid?: number): void {
    for (const listener of ShellTool.outputListeners) {
      try {
        listener(output, command, pid);
      } catch (err) {
        console.warn('[ShellTool] Error in output listener:', err);
      }
    }
  }

  /**
   * Get all active background processes.
   */
  static getBackgroundProcesses(): Array<{ pid: number; killed: boolean }> {
    return Array.from(activeBackgroundProcesses.entries()).map(([pid, proc]) => ({
      pid,
      killed: proc.killed,
    }));
  }

  /**
   * Stop a background process by PID.
   */
  static stopBackgroundProcess(pid: number): boolean {
    const proc = activeBackgroundProcesses.get(pid);
    if (proc && !proc.killed) {
      try {
        proc.kill('SIGTERM');
        activeBackgroundProcesses.delete(pid);
        return true;
      } catch {
        return false;
      }
    }
    return false;
  }

  /**
   * Stop all active background processes.
   */
  static stopAllBackgroundProcesses(): void {
    for (const [pid, proc] of activeBackgroundProcesses.entries()) {
      try {
        proc.kill('SIGTERM');
      } catch { /* ignore */ }
    }
    activeBackgroundProcesses.clear();
  }

  /**
   * Resolve and validate the working directory.
   * Supports relative paths (resolved against workspace root) and absolute paths
   * (must be within workspace for security).
   */
  private resolveAndValidateCwd(inputCwd?: string, command?: string): { cwd: string; error?: string; autoResolvedNote?: string } {
    const workspaceRoot = WorkspaceContext.getRoot();

    if (!workspaceRoot || !WorkspaceContext.hasActiveWorkspace()) {
      return {
        cwd: '',
        error: 'Access denied: No project is currently opened. Please open a project from your local machine to run commands.',
      };
    }

    if (WorkspaceContext.isAgentRoot(workspaceRoot)) {
      return {
        cwd: '',
        error: "Access denied: Running commands inside the AI agent's root project is strictly prohibited to prevent confusion.",
      };
    }

    if (!inputCwd) {
      return { cwd: workspaceRoot };
    }

    const check = WorkspaceContext.validatePathAccess(inputCwd, path.isAbsolute(inputCwd));
    if (!check.allowed) {
      return {
        cwd: workspaceRoot,
        error: check.error || `Access denied for cwd: "${inputCwd}"`,
      };
    }
    const resolved = check.resolvedPath;

    // Validate directory exists
    try {
      const stat = fs.statSync(resolved);
      if (!stat.isDirectory()) {
        return {
          cwd: workspaceRoot,
          error: `Path "${inputCwd}" exists but is not a directory. Resolved to: ${resolved}`,
        };
      }
      return { cwd: resolved };
    } catch {
      // Smart fuzzy matching for requested project directories (e.g. "backend", "frontend", "mobile")
      const matchedRelDir = this.fuzzyMatchWorkspaceDirectory(workspaceRoot, inputCwd, command);
      if (matchedRelDir) {
        const autoResolvedPath = path.resolve(workspaceRoot, matchedRelDir);
        const autoNote = `[Smart Directory Resolution: Directory "${inputCwd}" was auto-mapped to "${matchedRelDir}/"]`;
        console.log(`[ShellTool] ${autoNote}`);
        return {
          cwd: autoResolvedPath,
          autoResolvedNote: autoNote,
        };
      }

      return {
        cwd: workspaceRoot,
        error: `Directory "${inputCwd}" does not exist. Resolved path: ${resolved}. Available items in workspace: ${this.listWorkspaceChildren(workspaceRoot)}`,
      };
    }
  }

  private fuzzyMatchWorkspaceDirectory(workspaceRoot: string, inputCwd: string, command?: string): string | null {
    const cleanInput = inputCwd.toLowerCase().trim().replace(/[/\\]+$/, '');

    // 1. Check WorkspaceContext role finder first
    if (['backend', 'be', 'server', 'api'].includes(cleanInput)) {
      const match = WorkspaceContext.findProjectDirectoryByRole('backend', command);
      if (match) return match;
    } else if (['frontend', 'fe', 'client', 'ui', 'web'].includes(cleanInput)) {
      const match = WorkspaceContext.findProjectDirectoryByRole('frontend', command);
      if (match) return match;
    } else if (['mobile', 'app', 'android', 'ios'].includes(cleanInput)) {
      const match = WorkspaceContext.findProjectDirectoryByRole('mobile', command);
      if (match) return match;
    }

    // 2. Scan all subdirectories in workspace
    try {
      const entries = fs.readdirSync(workspaceRoot, { withFileTypes: true });
      const dirs = entries.filter(e => e.isDirectory() && !e.name.startsWith('.') && e.name !== 'node_modules');

      // Substring match
      const subMatch = dirs.find(d => d.name.toLowerCase().includes(cleanInput) || cleanInput.includes(d.name.toLowerCase()));
      if (subMatch) return subMatch.name;

      // Command-based match if command contains docker-compose or manage.py
      if (command) {
        if (/docker-?compose/i.test(command)) {
          const composeDir = dirs.find(d => fs.existsSync(path.join(workspaceRoot, d.name, 'docker-compose.yml')) || fs.existsSync(path.join(workspaceRoot, d.name, 'docker-compose.yaml')));
          if (composeDir) return composeDir.name;
        }
        if (/manage\.py/i.test(command)) {
          const manageDir = dirs.find(d => fs.existsSync(path.join(workspaceRoot, d.name, 'manage.py')));
          if (manageDir) return manageDir.name;
        }
      }
    } catch {
      // ignore
    }

    return null;
  }


  /**
   * List top-level children of a directory (for helpful error messages).
   */
  private listWorkspaceChildren(dir: string): string {
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      return entries
        .filter(e => !e.name.startsWith('.') && e.name !== 'node_modules')
        .slice(0, 15)
        .map(e => e.isDirectory() ? `${e.name}/` : e.name)
        .join(', ');
    } catch {
      return '(unable to list)';
    }
  }

  /**
   * Determine whether a command should run in background or foreground.
   */
  private shouldRunInBackground(command: string, explicitBackground?: boolean): boolean {
    // Explicit override always wins
    if (explicitBackground === true) return true;
    if (explicitBackground === false) return false;

    // Check foreground patterns first (higher priority)
    for (const pattern of FOREGROUND_PATTERNS) {
      if (pattern.test(command)) return false;
    }

    // Check long-running patterns
    for (const pattern of LONG_RUNNING_PATTERNS) {
      if (pattern.test(command)) return true;
    }

    return false;
  }

  /**
   * Produce a clean execution environment for user workspace commands.
   * Strips the agent container's internal PORT (5001) so user dev servers (Next.js, Vite, React, Express)
   * default to their expected standard ports (e.g. 3000, 5173, 8000) rather than attempting to bind
   * to port 5001 and crashing with EADDRINUSE.
   */
  private getSanitizedEnv(command?: string): NodeJS.ProcessEnv {
    const env: NodeJS.ProcessEnv = { ...process.env, FORCE_COLOR: '0' };

    // Strip internal agent backend PORT so child processes don't try to bind to port 5001
    delete env.PORT;

    // For frontend projects/dev servers, if running Next.js or React without an explicit port flag,
    // explicitly set PORT to 3000 so Next.js starts on its standard port 3000.
    if (command && /\b(next(\s+dev)?|withgod-fe)\b/i.test(command) && !/--port|-p\s+\d+/i.test(command)) {
      env.PORT = '3000';
    }

    return env;
  }

  async execute(input: {
    command: string;
    cwd?: string;
    isBackground?: boolean;
    timeoutMs?: number;
  }): Promise<ToolResult> {
    const startedAt = new Date().toISOString();
    const startTime = Date.now();

    try {
      // 1. Resolve and validate working directory
      const { cwd, error: cwdError, autoResolvedNote } = this.resolveAndValidateCwd(input.cwd, input.command);
      if (cwdError) {
        return {
          success: false,
          content: `Command: ${input.command}\nDirectory: ${input.cwd || '(workspace root)'}\n\nError: ${cwdError}`,
          error: cwdError,
        };
      }

      // 2. Check permissions (headless mode auto-approves non-dangerous)
      try {
        await PermissionManager.requestPermission(input.command);
      } catch (error: any) {
        if (error instanceof PermissionRequiredError) {
          // In headless/server mode, auto-approve ASK-level commands
          if (error.level === 'BLOCKED' || error.level === 'DANGEROUS') {
            return {
              success: false,
              content: `Command: ${input.command}\nDirectory: ${cwd}\n\nPermission denied: This command is classified as ${error.level} and cannot be auto-approved.`,
              error: `PERMISSION_REQUIRED: ${error.command} [${error.level}]`,
            };
          }
          // ASK level: proceed in headless mode
          console.log(`[ShellTool] Auto-approving ASK-level command in headless mode: ${input.command}`);
        } else {
          throw error;
        }
      }

      // 3. Determine execution mode
      const runInBackground = this.shouldRunInBackground(input.command, input.isBackground);

      console.log(`[ShellTool] Executing: "${input.command}" | cwd: ${cwd} | mode: ${runInBackground ? 'background' : 'foreground'}`);

      if (runInBackground) {
        return await this.executeBackground(input.command, cwd, startedAt, autoResolvedNote);
      }

      // 4. Foreground execution with timeout
      const timeoutMs = input.timeoutMs || 60000; // 60 seconds default (increased from 30s)

      try {
        const { stdout, stderr } = await execPromise(input.command, {
          timeout: timeoutMs,
          cwd,
          maxBuffer: 10 * 1024 * 1024, // 10MB buffer
          env: this.getSanitizedEnv(input.command),
        });

        const durationMs = Date.now() - startTime;
        const combinedOutput = `${stdout || ''}${stderr || ''}`;
        ShellTool.notifyListeners(combinedOutput, input.command);

        return {
          success: true,
          content: this.formatResult({
            success: true,
            command: input.command,
            cwd,
            stdout: stdout || '',
            stderr: stderr || '',
            exitCode: 0,
            durationMs,
            startedAt,
            finishedAt: new Date().toISOString(),
            autoResolvedNote,
          }),
        };
      } catch (error: any) {
        const durationMs = Date.now() - startTime;
        const combinedOutput = `${error.stdout || ''}${error.stderr || ''}`;
        ShellTool.notifyListeners(combinedOutput, input.command);

        // Check if it's a timeout
        if (error.killed && error.signal === 'SIGTERM') {
          return {
            success: false,
            content: this.formatResult({
              success: false,
              command: input.command,
              cwd,
              stdout: error.stdout || '',
              stderr: error.stderr || '',
              exitCode: null,
              signal: 'SIGTERM (timeout)',
              durationMs,
              startedAt,
              finishedAt: new Date().toISOString(),
              timedOut: true,
              timeoutMs,
              autoResolvedNote,
            }),
            error: `Command timed out after ${timeoutMs}ms`,
          };
        }

        // Non-zero exit codes end up here
        return {
          success: false,
          content: this.formatResult({
            success: false,
            command: input.command,
            cwd,
            stdout: error.stdout || '',
            stderr: error.stderr || error.message || 'Unknown error',
            exitCode: error.code ?? 1,
            durationMs,
            startedAt,
            finishedAt: new Date().toISOString(),
            autoResolvedNote,
          }),
        };
      }
    } catch (error: any) {
      const durationMs = Date.now() - startTime;
      // Catch-all: NEVER return empty content
      return {
        success: false,
        content: this.formatResult({
          success: false,
          command: input.command,
          cwd: input.cwd || '(workspace root)',
          stdout: '',
          stderr: error.message || 'Unknown shell error',
          exitCode: null,
          durationMs,
          startedAt,
          finishedAt: new Date().toISOString(),
        }),
        error: error.message || 'Unknown shell error',
      };
    }
  }

  /**
   * Execute a long-running/dev server command in the background using spawn.
   * Captures initial output for up to 5 seconds or until a URL is detected.
   */
  private async executeBackground(command: string, cwd: string, startedAt: string, autoResolvedNote?: string): Promise<ToolResult> {
    return new Promise((resolve) => {
      const child = spawn(command, {
        cwd,
        shell: true,
        detached: process.platform !== 'win32',
        stdio: ['ignore', 'pipe', 'pipe'],
        env: this.getSanitizedEnv(command),
      });

      if (!child.pid) {
        resolve({
          success: false,
          content: this.formatResult({
            success: false,
            command,
            cwd,
            stdout: '',
            stderr: 'Failed to spawn background process. The command may not exist or the shell is unavailable.',
            exitCode: null,
            durationMs: 0,
            startedAt,
            finishedAt: new Date().toISOString(),
            autoResolvedNote,
          }),
          error: 'Failed to spawn background process',
        });
        return;
      }

      activeBackgroundProcesses.set(child.pid, child);

      let stdoutAccum = '';
      let stderrAccum = '';
      let resolved = false;

      const finish = () => {
        if (resolved) return;
        resolved = true;
        clearTimeout(timer);

        const combined = `${stdoutAccum}\n${stderrAccum}`;
        ShellTool.notifyListeners(combined, command, child.pid);

        resolve({
          success: true,
          content: this.formatResult({
            success: true,
            command,
            cwd,
            stdout: stdoutAccum || '(waiting for output...)',
            stderr: stderrAccum,
            exitCode: null, // Still running
            durationMs: Date.now() - new Date(startedAt).getTime(),
            startedAt,
            finishedAt: new Date().toISOString(),
            background: true,
            pid: child.pid,
            autoResolvedNote,
          }),
        });
      };

      // Check if output contains a URL (service ready signal)
      const checkUrlInOutput = (chunk: string) => {
        if (/https?:\/\/(?:localhost|127\.0\.0\.1|0\.0\.0\.0):\d+/i.test(chunk)) {
          finish();
        }
      };

      child.stdout?.on('data', (data: Buffer) => {
        const text = data.toString();
        stdoutAccum += text;
        ShellTool.notifyListeners(text, command, child.pid);
        checkUrlInOutput(text);
      });

      child.stderr?.on('data', (data: Buffer) => {
        const text = data.toString();
        stderrAccum += text;
        ShellTool.notifyListeners(text, command, child.pid);
        checkUrlInOutput(text);
      });

      child.on('error', (err) => {
        if (resolved) return;
        resolved = true;
        clearTimeout(timer);
        activeBackgroundProcesses.delete(child.pid!);
        resolve({
          success: false,
          content: this.formatResult({
            success: false,
            command,
            cwd,
            stdout: stdoutAccum,
            stderr: `Process error: ${err.message}`,
            exitCode: null,
            durationMs: Date.now() - new Date(startedAt).getTime(),
            startedAt,
            finishedAt: new Date().toISOString(),
          }),
          error: `Background process error: ${err.message}`,
        });
      });

      child.on('exit', (code) => {
        activeBackgroundProcesses.delete(child.pid!);
        if (!resolved) {
          resolved = true;
          clearTimeout(timer);
          const hasError = (code !== null && code !== 0) || Boolean(stderrAccum && /Error: listen EADDRINUSE|Failed to start server|fatal error|ERR_/i.test(stderrAccum));
          resolve({
            success: !hasError,
            content: this.formatResult({
              success: !hasError,
              command,
              cwd,
              stdout: stdoutAccum || '(empty)',
              stderr: stderrAccum || '(empty)',
              exitCode: code,
              durationMs: Date.now() - new Date(startedAt).getTime(),
              startedAt,
              finishedAt: new Date().toISOString(),
              background: false,
              autoResolvedNote,
            }),
            error: hasError ? (stderrAccum || `Process exited early with code ${code}`) : undefined,
          });
        }
      });

      // Wait up to 5 seconds for initial startup output (increased from 3.5s)
      const timer = setTimeout(() => {
        finish();
      }, 5000);
    });
  }

  /**
   * Format a structured, human-readable and machine-parseable result.
   */
  private formatResult(result: {
    success: boolean;
    command: string;
    cwd: string;
    stdout: string;
    stderr: string;
    exitCode: number | null;
    signal?: string | null;
    durationMs: number;
    startedAt: string;
    finishedAt: string;
    background?: boolean;
    pid?: number;
    timedOut?: boolean;
    timeoutMs?: number;
    autoResolvedNote?: string;
  }): string {
    const lines: string[] = [];

    if (result.autoResolvedNote) {
      lines.push(result.autoResolvedNote);
      lines.push('');
    }

    if (result.background) {
      lines.push(result.success ? '✓ Background process started successfully.' : '✗ Background process failed to start.');
    } else if (result.timedOut) {
      lines.push(`✗ Command timed out after ${result.timeoutMs}ms.`);
    } else {
      lines.push(result.success ? '✓ Command completed successfully.' : '✗ Command failed.');
    }

    lines.push('');
    lines.push(`Command: ${result.command}`);
    lines.push(`Directory: ${result.cwd}`);

    if (result.exitCode !== null && result.exitCode !== undefined) {
      lines.push(`Exit Code: ${result.exitCode}`);
    }

    if (result.signal) {
      lines.push(`Signal: ${result.signal}`);
    }

    if (result.pid) {
      lines.push(`PID: ${result.pid}`);
    }

    if (result.background) {
      lines.push(`Mode: Background (process continues running)`);
    }

    lines.push(`Duration: ${result.durationMs}ms`);

    if (result.stdout && result.stdout.trim()) {
      lines.push('');
      lines.push('STDOUT:');
      // Truncate very long output to prevent context overflow
      const stdout = result.stdout.trim();
      if (stdout.length > 8000) {
        lines.push(stdout.slice(0, 4000));
        lines.push(`\n... (${stdout.length - 8000} characters truncated) ...\n`);
        lines.push(stdout.slice(-4000));
      } else {
        lines.push(stdout);
      }
    }

    if (result.stderr && result.stderr.trim()) {
      lines.push('');
      lines.push('STDERR:');
      const stderr = result.stderr.trim();
      if (stderr.length > 4000) {
        lines.push(stderr.slice(0, 2000));
        lines.push(`\n... (${stderr.length - 4000} characters truncated) ...\n`);
        lines.push(stderr.slice(-2000));
      } else {
        lines.push(stderr);
      }
    }

    return lines.join('\n');
  }
}
