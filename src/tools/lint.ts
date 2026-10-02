import { exec } from 'child_process';
import { promisify } from 'util';
import { Tool, ToolResult } from './registry.js';
import { WorkspaceContext } from '../context/workspaceContext.js';

const execPromise = promisify(exec);

export class LintTool implements Tool {
  name = 'run_linter';
  description = 'Run ESLint on a specific file or the entire project to find syntax and style errors. Returns a list of warnings and errors that need to be fixed.';
  inputSchema = {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'Path to the file to lint, or "." for the whole project.' },
    },
    required: ['path']
  };

  async execute(input: { path: string }): Promise<ToolResult> {
    try {
      // We use npx eslint to avoid requiring a global installation
      const command = `npx eslint "${input.path}" --format compact`;

      const { stdout, stderr } = await execPromise(command, { cwd: WorkspaceContext.getRoot() });

      if (stdout) {
        return {
          success: true,
          content: `Linting results:\n${stdout}`,
        };
      }

      return {
        success: true,
        content: 'No linting errors found!',
      };
    } catch (error: any) {
      // eslint returns exit code 1 if errors are found
      if (error.stdout) {
        return {
          success: true,
          content: `Linting errors found:\n${error.stdout}`,
        };
      }

      return {
        success: false,
        content: '',
        error: error.message || 'Error executing linter',
      };
    }
  }
}
