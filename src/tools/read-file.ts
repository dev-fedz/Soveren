import fs from 'fs/promises';
import path from 'path';
import { Tool, ToolResult } from './registry.js';
import { WorkspaceContext } from '../context/workspaceContext.js';

export class ReadFileTool implements Tool {
  name = 'read_file';
  description = 'Read the full text content of a file (or inspect directory contents if given a directory) in the current workspace.';
  inputSchema = {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'Path to the file or directory relative to the workspace root.' }
    },
    required: ['path']
  };

  async execute(input: { path: string }): Promise<ToolResult> {
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

      const stat = await fs.stat(absolutePath);
      if (stat.isDirectory()) {
        const entries = await fs.readdir(absolutePath, { withFileTypes: true });
        const dirs = entries.filter(e => e.isDirectory() && !e.name.startsWith('.')).sort((a, b) => a.name.localeCompare(b.name));
        const files = entries.filter(e => !e.isDirectory() && !e.name.startsWith('.')).sort((a, b) => a.name.localeCompare(b.name));
        const hidden = entries.filter(e => e.name.startsWith('.')).sort((a, b) => a.name.localeCompare(b.name));

        const output: string[] = [`Directory contents of "${relPath === '.' ? '(workspace root)' : relPath}":`];
        for (const d of dirs) {
          output.push(`  📁 ${d.name}/`);
        }
        for (const f of files) {
          try {
            const fStat = await fs.stat(path.join(absolutePath, f.name));
            const sizeStr = fStat.size > 1024 * 1024
              ? `${(fStat.size / (1024 * 1024)).toFixed(1)} MB`
              : fStat.size > 1024
              ? `${(fStat.size / 1024).toFixed(1)} KB`
              : `${fStat.size} B`;
            output.push(`  📄 ${f.name} (${sizeStr})`);
          } catch {
            output.push(`  📄 ${f.name}`);
          }
        }
        if (hidden.length > 0) {
          output.push(`  [+ ${hidden.length} hidden files/folders]`);
        }
        return {
          success: true,
          content: output.join('\n'),
        };
      }

      const content = await fs.readFile(absolutePath, 'utf8');
      return {
        success: true,
        content: content,
      };
    } catch (error: any) {
      return {
        success: false,
        content: '',
        error: error.message || 'Unknown error reading file',
      };
    }
  }
}
