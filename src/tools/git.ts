import { exec } from 'child_process';
import { promisify } from 'util';
import { Tool, ToolResult } from './registry.js';
import { PermissionManager } from '../permissions/manager.js';
import { WorkspaceContext } from '../context/workspaceContext.js';

const execPromise = promisify(exec);

abstract class GitTool implements Tool {
  abstract name: string;
  abstract description: string;
  abstract inputSchema: object;
  abstract execute(input?: any): Promise<ToolResult>;

  protected async runGit(args: string): Promise<ToolResult> {
    try {
      const command = `git ${args}`;
      await PermissionManager.requestPermission(command);
      
      const { stdout, stderr } = await execPromise(command, { cwd: WorkspaceContext.getRoot() });
      return {
        success: true,
        content: stdout || stderr || 'Command executed successfully with no output.',
      };
    } catch (error: any) {
      if (error.name === 'PermissionRequiredError') {
        return {
          success: false,
          content: '',
          error: `PERMISSION_REQUIRED: ${error.command} [${error.level}]`,
        };
      }
      return {
        success: false,
        content: '',
        error: error.message || 'Git operation failed',
      };
    }
  }
}

export class GitStatusTool extends GitTool {
  name = 'git_status';
  description = 'Get the current status of the git working directory.';
  inputSchema = { type: 'object', properties: {}, required: [] };

  async execute(): Promise<ToolResult> {
    return this.runGit('status');
  }
}

export class GitDiffTool extends GitTool {
  name = 'git_diff';
  description = 'Show changes between the working directory and the last commit.';
  inputSchema = { type: 'object', properties: {}, required: [] };

  async execute(): Promise<ToolResult> {
    return this.runGit('diff');
  }
}

export class GitLogTool extends GitTool {
  name = 'git_log';
  description = 'Show recent commit history.';
  inputSchema = {
    type: 'object',
    properties: {
      limit: { type: 'number', description: 'Number of commits to show.' }
    },
    required: []
  };

  async execute(input: { limit?: number }): Promise<ToolResult> {
    const limit = input.limit ? `-n ${input.limit}` : '';
    return this.runGit(`log ${limit} --oneline`);
  }
}

export class GitBranchTool extends GitTool {
  name = 'git_branch';
  description = 'List available git branches.';
  inputSchema = { type: 'object', properties: {}, required: [] };

  async execute(): Promise<ToolResult> {
    return this.runGit('branch');
  }
}

export class GitCommitTool extends GitTool {
  name = 'git_commit';
  description = 'Commit staged changes with a message.';
  inputSchema = {
    type: 'object',
    properties: {
      message: { type: 'string', description: 'The commit message.' }
    },
    required: ['message']
  };

  async execute(input: { message: string }): Promise<ToolResult> {
    // Note: In a real agent, we'd probably want to 'git add' first.
    return this.runGit(`commit -m "${input.message}"`);
  }
}
