import fs from 'fs/promises';
import path from 'path';
import { Tool, ToolResult } from './registry.js';
import { WorkspaceContext } from '../context/workspaceContext.js';

export class EditFileTool implements Tool {
  name = 'edit_file';
  description = 'Surgically edit a file by replacing a specific block of text with new text. Useful for making precise changes without overwriting the whole file.';
  inputSchema = {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'Path to the file relative to the workspace root.' },
      searchString: { type: 'string', description: 'The exact text block to be replaced. Must match exactly, including indentation.' },
      replaceString: { type: 'string', description: 'The new text to replace the search string with.' }
    },
    required: ['path', 'searchString', 'replaceString']
  };

  async execute(input: { path: string, searchString: string, replaceString: string }): Promise<ToolResult> {
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

      const content = await fs.readFile(absolutePath, 'utf8');

      if (!content.includes(input.searchString)) {
        return {
          success: false,
          content: '',
          error: `Search string not found in ${input.path}. The text must match exactly, including whitespace and indentation. Please read the file again to verify the exact content.`
        };
      }

      // Replace only the first occurrence to maintain precision
      const updatedContent = content.replace(input.searchString, input.replaceString);

      // Auto-format edited file if supported
      let finalContent = updatedContent;
      try {
        const { FormatterService } = await import('../formatter/service.js');
        const formatRes = await FormatterService.format({
          code: updatedContent,
          filePath: absolutePath,
          workspacePath: WorkspaceContext.getRoot(),
        });
        if (formatRes.success && formatRes.formatted) {
          finalContent = formatRes.formatted;
        }
      } catch {
        // Fall back gracefully
      }

      await fs.writeFile(absolutePath, finalContent, 'utf8');

      return {
        success: true,
        content: `Successfully edited ${input.path}. Replaced the specified block of text.`,
      };
    } catch (error: any) {
      return {
        success: false,
        content: '',
        error: error.message || 'Unknown error editing file',
      };
    }
  }
}
