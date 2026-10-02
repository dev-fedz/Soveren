import fs from 'fs/promises';
import path from 'path';
import { Tool, ToolResult } from './registry.js';
import { WorkspaceContext } from '../context/workspaceContext.js';

export class WriteFileTool implements Tool {
  name = 'write_file';
  description = 'Create a new file or completely overwrite an existing file in the workspace.';
  inputSchema = {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'Path to the file relative to the workspace root.' },
      content: { type: 'string', description: 'The text content to write to the file.' }
    },
    required: ['path', 'content']
  };

  async execute(input: { path: string, content: string }): Promise<ToolResult> {
    try {
      const check = WorkspaceContext.validatePathAccess(input.path, path.isAbsolute(input.path));
      if (!check.allowed) {
        return {
          success: false,
          content: '',
          error: check.error || 'Access denied.',
        };
      }
      const absolutePath = check.resolvedPath;

      // Ensure directory exists
      await fs.mkdir(path.dirname(absolutePath), { recursive: true });
      
      // Auto-format code if supported
      let finalContent = input.content;
      try {
        const { FormatterService } = await import('../formatter/service.js');
        const formatRes = await FormatterService.format({
          code: input.content,
          filePath: absolutePath,
          workspacePath: WorkspaceContext.getRoot(),
        });
        if (formatRes.success && formatRes.formatted) {
          finalContent = formatRes.formatted;
        }
      } catch {
        // Keep original code if formatting fails or is unavailable
      }

      await fs.writeFile(absolutePath, finalContent, 'utf8');
      return {
        success: true,
        content: `Successfully wrote to ${input.path}`,
      };
    } catch (error: any) {
      return {
        success: false,
        content: '',
        error: error.message || 'Unknown error writing file',
      };
    }
  }
}
