import fs from 'fs/promises';
import path from 'path';
import { Tool, ToolResult } from './registry.js';
import { WorkspaceContext } from '../context/workspaceContext.js';

const IGNORED_FOLDERS = new Set([
  'node_modules',
  '.git',
  'dist',
  'build',
  '.next',
  '.cache',
  'coverage',
  '.agents',
  'venv',
  'venv_new',
  '__pycache__',
]);

export class ListDirectoryTool implements Tool {
  name = 'list_directory';
  description = 'List all files and subdirectories in a directory path within the workspace.';
  inputSchema = {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: 'Directory path relative to the workspace root (defaults to "." for workspace root).'
      },
      recursive: {
        type: 'boolean',
        description: 'If true, recursively lists subdirectories up to 2 levels deep.'
      },
      showHidden: {
        type: 'boolean',
        description: 'If true, shows hidden files and folders starting with "."'
      }
    }
  };

  async execute(input: { path?: string; recursive?: boolean; showHidden?: boolean }): Promise<ToolResult> {
    try {
      const relPath = input.path || '.';
      const check = WorkspaceContext.validatePathAccess(relPath, path.isAbsolute(relPath));
      if (!check.allowed) {
        return {
          success: false,
          content: '',
          error: check.error || 'Access denied.',
        };
      }
      const absolutePath = check.resolvedPath;

      let stat;
      try {
        stat = await fs.stat(absolutePath);
      } catch (err: any) {
        return {
          success: false,
          content: '',
          error: `Directory not found: "${relPath}" (${err.message})`
        };
      }

      if (!stat.isDirectory()) {
        return {
          success: false,
          content: '',
          error: `Path "${relPath}" is a file, not a directory. Use read_file instead.`
        };
      }

      const showHidden = Boolean(input.showHidden);
      const isRecursive = Boolean(input.recursive);
      const lines: string[] = [`Directory: ${relPath === '.' ? '(workspace root)' : relPath}`];

      async function scanDir(currentDir: string, depth = 0, prefix = ''): Promise<void> {
        let entries;
        try {
          entries = await fs.readdir(currentDir, { withFileTypes: true });
        } catch {
          return;
        }

        const dirs = entries
          .filter(e => e.isDirectory() && (showHidden || !e.name.startsWith('.')))
          .sort((a, b) => a.name.localeCompare(b.name));
        const files = entries
          .filter(e => !e.isDirectory() && (showHidden || !e.name.startsWith('.')))
          .sort((a, b) => a.name.localeCompare(b.name));

        for (const dir of dirs) {
          lines.push(`${prefix}📁 ${dir.name}/`);
          if (isRecursive && depth < 2 && !IGNORED_FOLDERS.has(dir.name)) {
            await scanDir(path.join(currentDir, dir.name), depth + 1, `${prefix}  `);
          }
        }

        for (const file of files) {
          try {
            const fStat = await fs.stat(path.join(currentDir, file.name));
            const sizeStr = fStat.size > 1024 * 1024
              ? `${(fStat.size / (1024 * 1024)).toFixed(1)} MB`
              : fStat.size > 1024
              ? `${(fStat.size / 1024).toFixed(1)} KB`
              : `${fStat.size} B`;
            lines.push(`${prefix}📄 ${file.name} (${sizeStr})`);
          } catch {
            lines.push(`${prefix}📄 ${file.name}`);
          }
        }
      }

      await scanDir(absolutePath, 0, '  ');

      return {
        success: true,
        content: lines.join('\n'),
      };
    } catch (error: any) {
      return {
        success: false,
        content: '',
        error: error.message || 'Error listing directory',
      };
    }
  }
}
