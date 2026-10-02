import { toolRegistry } from './registry.js';
import { ReadFileTool } from './read-file.js';
import { ReadFileRangeTool } from './read-file-range.js';
import { SearchFilesTool } from './search.js';
import { SemanticSearchTool } from './semantic-search.js';
import { FindSymbolTool } from './find-symbol.js';
import { WriteFileTool } from './write-file.js';
import { LintTool } from './lint.js';
import { EditFileTool } from './edit-file.js';
import { ShellTool } from './shell.js';
import { WeatherTool } from './weather.js';
import {
  GitStatusTool,
  GitDiffTool,
  GitLogTool,
  GitBranchTool,
  GitCommitTool,
} from './git.js';
import { SkillLoader } from '../skills/loader.js';
import { MCPClient, MCPToolProxy } from './mcp.js';
import { FormatterService } from '../formatter/index.js';
import { Tool, ToolResult } from './registry.js';
import { WorkspaceContext } from '../context/workspaceContext.js';
import { ListDirectoryTool } from './list-directory.js';

export class ListFilesTool extends ListDirectoryTool {
  override name = 'list_files';
  override description = 'List files and directories in a workspace path (alias for list_directory).';
}

export class ListDirTool extends ListDirectoryTool {
  override name = 'list_dir';
  override description = 'List files and directories in a workspace path (alias for list_directory).';
}

export class LsTool extends ListDirectoryTool {
  override name = 'ls';
  override description = 'List files and directories in a workspace path (alias for list_directory).';
}

import {
  OpenFileTool,
  CreateFileTool,
  DeleteFileTool,
  OpenBrowserTool,
  NavigateBrowserTool,
  ClickElementTool,
  TypeElementTool,
  InspectDOMTool,
  TakeScreenshotTool,
  RunAutomationTestTool,
  InspectConsoleTool,
  InspectNetworkTool,
  InspectStorageTool,
  InspectPerformanceTool,
  InspectSecurityTool,
  OpenImageTool,
  OpenDocumentTool,
  ReadDocumentTool,
  SearchDocumentTool,
  RequestPermissionTool,
} from './workspace-tools.js';

// Alias for execute_command -> ShellTool
export class ExecuteCommandTool extends ShellTool {
  override name = 'execute_command';
  override description = 'Execute a shell command in the workspace terminal (alias for run_command). Use the "cwd" parameter to specify a subdirectory.';
}

export class ShellAliasTool extends ShellTool {
  override name = 'shell';
  override description = 'Execute a shell command in the workspace terminal (alias for run_command). Use the "cwd" parameter to specify a subdirectory.';
}

export class TerminalAliasTool extends ShellTool {
  override name = 'terminal';
  override description = 'Execute a shell command in the workspace terminal (alias for run_command). Use the "cwd" parameter to specify a subdirectory.';
}

export class SearchAliasTool extends SearchFilesTool {
  override name = 'search';
  override description = 'Search for files by pattern or content (alias for search_files).';
}

export class SearchTextTool extends SearchFilesTool {
  override name = 'search_text';
  override description = 'Search for text or patterns across workspace files (alias for search_files).';
}

export class ReadAliasTool extends ReadFileTool {
  override name = 'read';
  override description = 'Read file contents from the workspace (alias for read_file).';
}


// Code Formatter Tool for the agent
export class FormatCodeTool implements Tool {
  name = 'format_code';
  description = 'Format a file or code snippet using the registered code formatters (Prettier, Black, GoFmt, etc.).';
  inputSchema = {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'Path to the file to format relative to the workspace.' },
      language: { type: 'string', description: 'Optional language identifier.' },
    },
    required: ['path'],
  };

  async execute(input: { path: string; language?: string }): Promise<ToolResult> {
    try {
      const absPath = WorkspaceContext.resolvePath(input.path);
      const fs = await import('fs/promises');
      const content = await fs.readFile(absPath, 'utf-8');
      const result = await FormatterService.format({
        code: content,
        filePath: absPath,
        language: input.language,
        workspacePath: WorkspaceContext.getRoot(),
      });

      if (result.formatted && result.formatted !== content) {
        await fs.writeFile(absPath, result.formatted, 'utf-8');
        return {
          success: true,
          content: `Successfully formatted ${input.path} using ${result.formatterName}.`,
        };
      }

      return {
        success: true,
        content: `File ${input.path} is already cleanly formatted (${result.formatterName}).`,
      };
    } catch (err: any) {
      return {
        success: false,
        content: '',
        error: `Failed to format file: ${err.message}`,
      };
    }
  }
}

export class FormatAliasTool extends FormatCodeTool {
  override name = 'format';
  override description = 'Format source file using the appropriate formatter (alias for format_code).';
}

let initialized = false;

export async function initializeToolsAndSkills(): Promise<void> {
  if (initialized) return;

  try {
    // 1. Load Skills
    await SkillLoader.loadAll().catch((err) => {
      console.warn('[initializeToolsAndSkills] SkillLoader warning:', err.message);
    });

    // 2. Register Core Native Tools
    toolRegistry.registerTool(new ReadFileTool());
    toolRegistry.registerTool(new ReadFileRangeTool());
    toolRegistry.registerTool(new ListDirectoryTool());
    toolRegistry.registerTool(new ListFilesTool());
    toolRegistry.registerTool(new ListDirTool());
    toolRegistry.registerTool(new LsTool());
    toolRegistry.registerTool(new SearchFilesTool());
    toolRegistry.registerTool(new SemanticSearchTool());
    toolRegistry.registerTool(new FindSymbolTool());
    toolRegistry.registerTool(new WriteFileTool());
    toolRegistry.registerTool(new LintTool());
    toolRegistry.registerTool(new EditFileTool());
    toolRegistry.registerTool(new ShellTool());
    toolRegistry.registerTool(new ExecuteCommandTool()); // Alias for models expecting execute_command
    toolRegistry.registerTool(new FormatCodeTool());

    // 3. Register Git Tools
    toolRegistry.registerTool(new GitStatusTool());
    toolRegistry.registerTool(new GitDiffTool());
    toolRegistry.registerTool(new GitLogTool());
    toolRegistry.registerTool(new GitBranchTool());
    toolRegistry.registerTool(new GitCommitTool());

    // 4. Register Workspace Navigation & Control Tools
    toolRegistry.registerTool(new OpenFileTool());
    toolRegistry.registerTool(new CreateFileTool());
    toolRegistry.registerTool(new DeleteFileTool());

    // 5. Register Browser Automation & Inspection Tools
    toolRegistry.registerTool(new OpenBrowserTool());
    toolRegistry.registerTool(new NavigateBrowserTool());
    toolRegistry.registerTool(new ClickElementTool());
    toolRegistry.registerTool(new TypeElementTool());
    toolRegistry.registerTool(new InspectDOMTool());
    toolRegistry.registerTool(new TakeScreenshotTool());
    toolRegistry.registerTool(new RunAutomationTestTool());
    toolRegistry.registerTool(new InspectConsoleTool());
    toolRegistry.registerTool(new InspectNetworkTool());
    toolRegistry.registerTool(new InspectStorageTool());
    toolRegistry.registerTool(new InspectPerformanceTool());
    toolRegistry.registerTool(new InspectSecurityTool());

    // 6. Register Images & Documents Tools
    toolRegistry.registerTool(new OpenImageTool());
    toolRegistry.registerTool(new OpenDocumentTool());
    toolRegistry.registerTool(new ReadDocumentTool());
    toolRegistry.registerTool(new SearchDocumentTool());

    // 7. Register Human-in-the-loop Permission Tool
    toolRegistry.registerTool(new RequestPermissionTool());

    // 4. Setup MCP Tools if available
    try {
      const mcpClient = new MCPClient();
      await mcpClient.connect('default-server', {});
      const mcpTools = await mcpClient.listTools('default-server');
      for (const toolDef of mcpTools) {
        if (toolDef.name === 'mcp_get_weather') continue;
        toolRegistry.registerTool(
          new MCPToolProxy(toolDef.name, toolDef.description, toolDef.inputSchema, {
            callTool: (name: string, args: any) => mcpClient.callTool('default-server', name, args),
          })
        );
      }
    } catch {
      // MCP server optional
    }

    initialized = true;
    console.log(`[initializeToolsAndSkills] Successfully registered ${toolRegistry.getAllTools().length} tools in toolRegistry.`);
  } catch (err) {
    console.error('[initializeToolsAndSkills] Error during initialization:', err);
  }
}
