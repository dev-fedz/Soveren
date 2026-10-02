import fs from 'fs/promises';
import path from 'path';
import { Tool, ToolResult } from './registry.js';
import { WorkspaceContext } from '../context/workspaceContext.js';

export class ReadFileRangeTool implements Tool {
  name = 'read_file_range';
  description = 'Read a specific range of lines from a file (or inspect a directory). Useful for analyzing large files without consuming too many tokens.';
  inputSchema = {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'Path to the file or directory relative to the workspace root.' },
      startLine: { type: 'number', description: 'The starting line number (1-indexed, optional).' },
      endLine: { type: 'number', description: 'The ending line number (1-indexed, optional).' }
    },
    required: ['path']
  };

  async execute(input: { path: string; startLine?: number; endLine?: number }): Promise<ToolResult> {
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
          output.push(`  📄 ${f.name}`);
        }
        if (hidden.length > 0) {
          output.push(`  [+ ${hidden.length} hidden files/folders]`);
        }
        return {
          success: true,
          content: output.map((line, idx) => `${idx + 1}: ${line}`).join('\n'),
        };
      }

      const content = await fs.readFile(absolutePath, 'utf8');
      const lines = content.split(/\r?\n/);

      const start = typeof input.startLine === 'number' && input.startLine >= 1 ? input.startLine : 1;
      const end = typeof input.endLine === 'number' && input.endLine <= lines.length ? input.endLine : lines.length;

      if (start > end) {
        return {
          success: false,
          content: '',
          error: `Invalid line range: startLine (${start}) cannot be greater than endLine (${end}). Total lines: ${lines.length}.`
        };
      }

      // Adjust for 0-indexed array
      const requestedLines = lines.slice(start - 1, end);

      // Prepend line numbers to make it easier for the agent to use with edit_file
      const result = requestedLines
        .map((line, index) => `${start + index}: ${line}`)
        .join('\n');

      return {
        success: true,
        content: result,
      };
    } catch (error: any) {
      return {
        success: false,
        content: '',
        error: error.message || 'Unknown error reading file range',
      };
    }
  }
}
