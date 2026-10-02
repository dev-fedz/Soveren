import fs from 'fs/promises';
import fsSync from 'fs';
import path from 'path';
import { Tool, ToolResult } from './registry.js';
import { WorkspaceContext } from '../context/workspaceContext.js';
import { globalWorkspaceState } from '../workspace/workspaceState.js';
import { browserAutomationEngine } from '../browser/browserAutomation.js';
import { DocumentService } from '../documents/documentService.js';
import { agentPermissionManager } from '../permissions/agentPermissionManager.js';
import { TestStep } from '../workspace/types.js';

// ==========================================
// 1. WORKSPACE FILE NAVIGATION TOOLS
// ==========================================

export class OpenFileTool implements Tool {
  name = 'open_file';
  description = 'Open a file in the active workspace. Automatically navigates the editor to the file, highlights it in the file tree, and activates the Code tab.';
  inputSchema = {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'Relative path of the file to open.' },
      line: { type: 'number', description: 'Optional line number to scroll to.' },
      column: { type: 'number', description: 'Optional column number.' },
    },
    required: ['path'],
  };

  async execute(input: { path: string; line?: number; column?: number }): Promise<ToolResult> {
    try {
      const check = WorkspaceContext.validatePathAccess(input.path, path.isAbsolute(input.path));
      if (!check.allowed) {
        return { success: false, content: '', error: check.error || 'Access denied.' };
      }
      const absPath = check.resolvedPath;
      if (!fsSync.existsSync(absPath)) {
        return {
          success: false,
          content: '',
          error: `File not found: ${input.path}`,
        };
      }

      globalWorkspaceState.openFile(input.path, input.line, input.column);

      return {
        success: true,
        content: `Opened ${input.path} in Code editor${input.line ? ` at line ${input.line}` : ''}. Active workspace surface updated to Code.`,
      };
    } catch (err: any) {
      return { success: false, content: '', error: err.message };
    }
  }
}

export class CreateFileTool implements Tool {
  name = 'create_file';
  description = 'Create a new file in the workspace. Automatically reveals the new file in the file explorer and opens it in the editor.';
  inputSchema = {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'Relative path of the file to create.' },
      content: { type: 'string', description: 'Initial file content.' },
    },
    required: ['path'],
  };

  async execute(input: { path: string; content?: string }): Promise<ToolResult> {
    try {
      const check = WorkspaceContext.validatePathAccess(input.path, path.isAbsolute(input.path));
      if (!check.allowed) {
        return { success: false, content: '', error: check.error || 'Access denied.' };
      }
      const absPath = check.resolvedPath;
      const dir = path.dirname(absPath);
      if (!fsSync.existsSync(dir)) {
        await fs.mkdir(dir, { recursive: true });
      }

      const initialContent = input.content || '';
      await fs.writeFile(absPath, initialContent, 'utf8');

      globalWorkspaceState.createFile(input.path, initialContent);

      return {
        success: true,
        content: `Created file: ${input.path}. Revealed in file explorer and opened in active workspace.`,
      };
    } catch (err: any) {
      return { success: false, content: '', error: err.message };
    }
  }
}

export class DeleteFileTool implements Tool {
  name = 'delete_file';
  description = 'Delete a file in the workspace. Automatically updates the file explorer.';
  inputSchema = {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'Relative path of the file to delete.' },
    },
    required: ['path'],
  };

  async execute(input: { path: string }): Promise<ToolResult> {
    try {
      const check = WorkspaceContext.validatePathAccess(input.path, path.isAbsolute(input.path));
      if (!check.allowed) {
        return { success: false, content: '', error: check.error || 'Access denied.' };
      }
      const absPath = check.resolvedPath;
      if (!fsSync.existsSync(absPath)) {
        return { success: false, content: '', error: `File not found: ${input.path}` };
      }

      await fs.unlink(absPath);
      globalWorkspaceState.dispatch({
        type: 'delete_file',
        path: input.path,
      });

      return {
        success: true,
        content: `Deleted file: ${input.path}. File explorer updated.`,
      };
    } catch (err: any) {
      return { success: false, content: '', error: err.message };
    }
  }
}

// ==========================================
// 2. BROWSER AUTOMATION & TESTING TOOLS
// ==========================================

export class OpenBrowserTool implements Tool {
  name = 'open_browser';
  description = 'Open the browser tab in the workspace with a target URL or service ID. The workspace automatically switches to the Browser tab.';
  inputSchema = {
    type: 'object',
    properties: {
      url: { type: 'string', description: 'URL to navigate to (e.g. http://localhost:3000/login).' },
      serviceId: { type: 'string', description: 'Optional discovered service identifier.' },
    },
  };

  async execute(input: { url?: string; serviceId?: string }): Promise<ToolResult> {
    const targetUrl = input.url || 'http://localhost:3000';
    const res = await browserAutomationEngine.navigate(targetUrl, input.serviceId);
    return {
      success: true,
      content: `Browser opened to ${res.url}${res.success ? ` (Title: "${res.title}")` : ' (Service not yet running or offline on this port)'}. Active workspace switched to Browser tab.`,
    };
  }
}

export class NavigateBrowserTool implements Tool {
  name = 'navigate_browser';
  description = 'Navigate the active browser session to a new URL or path.';
  inputSchema = {
    type: 'object',
    properties: {
      url: { type: 'string', description: 'Full URL or subpath to navigate to.' },
    },
    required: ['url'],
  };

  async execute(input: { url: string }): Promise<ToolResult> {
    const res = await browserAutomationEngine.navigate(input.url);
    return {
      success: true,
      content: `Navigated to ${res.url}${res.success ? `. Page title: "${res.title}".` : ' (Service not yet running or offline on this port).' }`,
    };
  }
}

export class ClickElementTool implements Tool {
  name = 'click_element';
  description = 'Click a button, link, or input element in the browser page using semantic selectors (text, role, CSS selector).';
  inputSchema = {
    type: 'object',
    properties: {
      selector: { type: 'string', description: 'CSS selector (e.g. #login-btn, button[type="submit"]).' },
      text: { type: 'string', description: 'Visible text content of the element (e.g. "Login", "Forgot password").' },
      role: { type: 'string', description: 'ARIA role (e.g. "button", "link").' },
      x: { type: 'number', description: 'Fallback X coordinate.' },
      y: { type: 'number', description: 'Fallback Y coordinate.' },
    },
  };

  async execute(input: { selector?: string; text?: string; role?: string; x?: number; y?: number }): Promise<ToolResult> {
    const res = await browserAutomationEngine.click(input);
    if (!res.success) {
      return { success: false, content: '', error: res.error };
    }
    const el = res.element!;
    return {
      success: true,
      content: `Clicked <${el.tag}${el.id ? ` id="${el.id}"` : ''}> (${el.accessibility?.label || el.textContent || ''}).`,
    };
  }
}

export class TypeElementTool implements Tool {
  name = 'type_element';
  description = 'Type text or fill an input field in the browser page using placeholder, label, or CSS selector.';
  inputSchema = {
    type: 'object',
    properties: {
      value: { type: 'string', description: 'Value to type into the field.' },
      selector: { type: 'string', description: 'CSS selector (e.g. input[type="email"]).' },
      placeholder: { type: 'string', description: 'Placeholder attribute (e.g. "name@example.com").' },
      label: { type: 'string', description: 'Associated label text.' },
    },
    required: ['value'],
  };

  async execute(input: { value: string; selector?: string; placeholder?: string; label?: string }): Promise<ToolResult> {
    const res = await browserAutomationEngine.type(input);
    if (!res.success) {
      return { success: false, content: '', error: res.error };
    }
    return {
      success: true,
      content: `Filled input field with "${input.value.replace(/./g, '•')}".`,
    };
  }
}

export class InspectDOMTool implements Tool {
  name = 'inspect_dom';
  description = 'Inspect the current DOM tree of the browser page.';
  inputSchema = {
    type: 'object',
    properties: {
      selector: { type: 'string', description: 'Optional CSS selector to scope the inspection.' },
      maxDepth: { type: 'number', description: 'Max depth of children to return (default 4).' },
    },
  };

  async execute(input: { selector?: string; maxDepth?: number }): Promise<ToolResult> {
    const dom = browserAutomationEngine.inspectDOM(input.selector, input.maxDepth || 4);
    if (!dom) {
      return { success: false, content: '', error: 'No DOM tree found or selector did not match.' };
    }
    return {
      success: true,
      content: JSON.stringify(dom, null, 2),
    };
  }
}

export class TakeScreenshotTool implements Tool {
  name = 'take_screenshot';
  description = 'Capture a visual screenshot of the current browser page, saves it as an artifact, and opens the Images tab.';
  inputSchema = {
    type: 'object',
    properties: {
      name: { type: 'string', description: 'Optional name/description for the screenshot.' },
    },
  };

  async execute(input: { name?: string }): Promise<ToolResult> {
    const res = await browserAutomationEngine.takeScreenshot(input.name);
    globalWorkspaceState.openImage(res.path);
    return {
      success: true,
      content: `Screenshot captured and saved to artifact "${res.artifact.title}". Images tab opened to ${res.path}.`,
    };
  }
}

export class RunAutomationTestTool implements Tool {
  name = 'run_automation_test';
  description = 'Run an automated multi-step browser UI test (navigate, fill, click, wait, assert). Returns structured step results, console errors, and captures a failure screenshot if a step fails.';
  inputSchema = {
    type: 'object',
    properties: {
      name: { type: 'string', description: 'Name of the test scenario (e.g. "Forgot Password Flow").' },
      steps: {
        type: 'array',
        description: 'Sequence of actions to perform.',
        items: {
          type: 'object',
          properties: {
            action: { type: 'string', enum: ['navigate', 'click', 'fill', 'wait', 'assert', 'screenshot'] },
            selector: { type: 'string' },
            text: { type: 'string' },
            placeholder: { type: 'string' },
            value: { type: 'string' },
            expected: { type: 'string' },
            timeout: { type: 'number' },
          },
          required: ['action'],
        },
      },
    },
    required: ['name', 'steps'],
  };

  async execute(input: { name: string; steps: TestStep[] }): Promise<ToolResult> {
    const report = await browserAutomationEngine.runAutomationTest(input.name, input.steps);
    const summary = report.steps
      .map((s) => `  ${s.status === 'passed' ? '✓' : '✗'} [${s.step.action}] ${s.step.selector || s.step.text || s.step.value || ''} (${s.durationMs}ms)${s.error ? ` - Error: ${s.error}` : ''}`)
      .join('\n');

    const content = `Automated Test: "${report.name}" - ${report.success ? 'PASSED ✓' : 'FAILED ✗'}\nDuration: ${report.durationMs}ms\n\nSteps:\n${summary}${report.screenshotPath ? `\n\nFailure Screenshot Captured: ${report.screenshotPath}` : ''}`;

    return {
      success: report.success,
      content,
      error: report.success ? undefined : `Test failed at step: ${report.steps.find((s) => s.status === 'failed')?.error}`,
    };
  }
}

// ==========================================
// 3. INSPECTION TOOLS (CONSOLE, NETWORK, ETC.)
// ==========================================

export class InspectConsoleTool implements Tool {
  name = 'inspect_console';
  description = 'Inspect browser console logs and errors. Automatically opens or updates the Inspect Console panel.';
  inputSchema = {
    type: 'object',
    properties: {
      level: { type: 'string', enum: ['all', 'error', 'warn', 'info', 'log'], description: 'Filter by log level.' },
      limit: { type: 'number', description: 'Maximum messages to return.' },
    },
  };

  async execute(input: { level?: string; limit?: number }): Promise<ToolResult> {
    globalWorkspaceState.openInspector('console');
    const logs = browserAutomationEngine.inspectConsole(input);
    return {
      success: true,
      content: logs.length > 0 ? JSON.stringify(logs, null, 2) : 'No console messages recorded.',
    };
  }
}

export class InspectNetworkTool implements Tool {
  name = 'inspect_network';
  description = 'Inspect browser network requests (API calls, status codes, payload, duration). Automatically opens the Inspect Network panel.';
  inputSchema = {
    type: 'object',
    properties: {
      filter: { type: 'string', description: 'Filter by resource type or URL substring (e.g. "fetch", "/api/").' },
      failedOnly: { type: 'boolean', description: 'If true, return only failed (4xx/5xx/network error) requests.' },
      limit: { type: 'number', description: 'Maximum requests to return.' },
    },
  };

  async execute(input: { filter?: string; failedOnly?: boolean; limit?: number }): Promise<ToolResult> {
    globalWorkspaceState.openInspector('network');
    const requests = browserAutomationEngine.inspectNetwork(input);
    return {
      success: true,
      content: requests.length > 0 ? JSON.stringify(requests, null, 2) : 'No network requests matching criteria.',
    };
  }
}

export class InspectStorageTool implements Tool {
  name = 'inspect_storage';
  description = 'Inspect application client storage (localStorage, sessionStorage, cookies).';
  inputSchema = {
    type: 'object',
    properties: {
      type: { type: 'string', enum: ['localStorage', 'sessionStorage', 'cookies', 'all'] },
    },
  };

  async execute(input: { type?: string }): Promise<ToolResult> {
    globalWorkspaceState.openInspector('application');
    const storage = browserAutomationEngine.inspectStorage(input.type === 'all' ? undefined : input.type);
    return {
      success: true,
      content: JSON.stringify(storage, null, 2),
    };
  }
}

export class InspectPerformanceTool implements Tool {
  name = 'inspect_performance';
  description = 'Inspect browser page performance, navigation timings, and resource load durations.';
  inputSchema = { type: 'object', properties: {} };

  async execute(): Promise<ToolResult> {
    globalWorkspaceState.openInspector('performance');
    const perf = browserAutomationEngine.inspectPerformance();
    return {
      success: true,
      content: JSON.stringify(perf, null, 2),
    };
  }
}

export class InspectSecurityTool implements Tool {
  name = 'inspect_security';
  description = 'Inspect browser security parameters (HTTPS, CSP, CORS headers, mixed content).';
  inputSchema = { type: 'object', properties: {} };

  async execute(): Promise<ToolResult> {
    globalWorkspaceState.openInspector('security');
    const sec = browserAutomationEngine.inspectSecurity();
    return {
      success: true,
      content: JSON.stringify(sec, null, 2),
    };
  }
}

// ==========================================
// 4. IMAGES AND DOCUMENTS TOOLS
// ==========================================

export class OpenImageTool implements Tool {
  name = 'open_image';
  description = 'Open an image file (PNG, JPG, SVG, WEBP, GIF) in the dedicated Images workspace tab.';
  inputSchema = {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'Relative path to image file.' },
    },
    required: ['path'],
  };

  async execute(input: { path: string }): Promise<ToolResult> {
    const absPath = WorkspaceContext.resolvePath(input.path);
    if (!fsSync.existsSync(absPath)) {
      return { success: false, content: '', error: `Image not found: ${input.path}` };
    }

    const stat = await fs.stat(absPath);
    const ext = path.extname(input.path).toLowerCase().replace('.', '');
    globalWorkspaceState.openImage(input.path);

    return {
      success: true,
      content: `Opened image ${input.path} (${ext.toUpperCase()}, ${(stat.size / 1024).toFixed(1)} KB) in Images tab.`,
    };
  }
}

export class OpenDocumentTool implements Tool {
  name = 'open_document';
  description = 'Open a document file (PDF, DOCX, XLSX, CSV, TXT, MD) in the dedicated Docs workspace tab.';
  inputSchema = {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'Relative path to document file.' },
      page: { type: 'number', description: 'Optional page to navigate to.' },
    },
    required: ['path'],
  };

  async execute(input: { path: string; page?: number }): Promise<ToolResult> {
    const absPath = WorkspaceContext.resolvePath(input.path);
    if (!fsSync.existsSync(absPath)) {
      return { success: false, content: '', error: `Document not found: ${input.path}` };
    }

    globalWorkspaceState.openDocument(input.path, input.page);
    return {
      success: true,
      content: `Opened document ${input.path} in Docs tab${input.page ? ` on page ${input.page}` : ''}.`,
    };
  }
}

export class ReadDocumentTool implements Tool {
  name = 'read_document';
  description = 'Read a targeted page or section from a document (PDF, DOCX, XLSX, CSV, TXT, MD) without loading excessive text into context.';
  inputSchema = {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'Relative path of document.' },
      page: { type: 'number', description: 'Page number to read (default 1).' },
      pageSize: { type: 'number', description: 'Optional page size (rows for spreadsheets, characters for documents).' },
      query: { type: 'string', description: 'Optional keyword to automatically find and read the relevant page.' },
    },
    required: ['path'],
  };

  async execute(input: { path: string; page?: number; pageSize?: number; query?: string }): Promise<ToolResult> {
    try {
      const res = await DocumentService.readDocument(input.path, {
        page: input.page,
        pageSize: input.pageSize,
        query: input.query,
      });

      return {
        success: true,
        content: `Document: ${res.filePath} (${res.format})\nPage ${res.page} of ${res.totalPages}${res.matchedQuery ? ` (matched query "${input.query}")` : ''}:\n\n${res.content}`,
      };
    } catch (err: any) {
      return { success: false, content: '', error: err.message };
    }
  }
}

export class SearchDocumentTool implements Tool {
  name = 'search_document';
  description = 'Search inside a document for a query and return matching pages and excerpts.';
  inputSchema = {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'Relative path of document.' },
      query: { type: 'string', description: 'Search term or keyword.' },
    },
    required: ['path', 'query'],
  };

  async execute(input: { path: string; query: string }): Promise<ToolResult> {
    try {
      const res = await DocumentService.searchDocument(input.path, input.query);
      if (res.matches.length === 0) {
        return { success: true, content: `No matches found for "${input.query}" in ${input.path}.` };
      }

      const matchText = res.matches.map((m) => `  [Page ${m.page}] ${m.snippet}`).join('\n');
      return {
        success: true,
        content: `Found ${res.matches.length} matches for "${input.query}" in ${input.path}:\n${matchText}`,
      };
    } catch (err: any) {
      return { success: false, content: '', error: err.message };
    }
  }
}

// ==========================================
// 5. HUMAN-IN-THE-LOOP PERMISSION TOOL
// ==========================================

export class RequestPermissionTool implements Tool {
  name = 'request_user_input';
  description = 'Pause execution and request user approval or credentials (e.g. login credentials, 2FA code, confirmation for destructive actions) before proceeding.';
  inputSchema = {
    type: 'object',
    properties: {
      type: {
        type: 'string',
        enum: ['credential', 'confirmation', 'destructive_action', 'external_access', 'otp', 'captcha'],
        description: 'Type of permission or user input required.',
      },
      title: { type: 'string', description: 'Short modal title.' },
      explanation: { type: 'string', description: 'Clear explanation to user why this input is needed.' },
      fields: {
        type: 'array',
        description: 'Form fields for user to complete.',
        items: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            label: { type: 'string' },
            type: { type: 'string', enum: ['text', 'password', 'number', 'boolean'] },
            placeholder: { type: 'string' },
            required: { type: 'boolean' },
          },
          required: ['name', 'label', 'type'],
        },
      },
    },
    required: ['type', 'title', 'explanation'],
  };

  async execute(input: any): Promise<ToolResult> {
    try {
      const response = await agentPermissionManager.requestPermission({
        type: input.type,
        title: input.title,
        explanation: input.explanation,
        fields: input.fields,
      });

      if (!response.approved) {
        return {
          success: false,
          content: 'User cancelled or denied the permission request.',
          error: response.reason || 'User cancelled permission request',
        };
      }

      // Never echo passwords back in plain content
      const safeValues = { ...(response.values || {}) };
      for (const k of Object.keys(safeValues)) {
        if (k.toLowerCase().includes('pass') || k.toLowerCase().includes('secret') || k.toLowerCase().includes('token')) {
          safeValues[k] = '••••••••';
        }
      }

      return {
        success: true,
        content: `User granted permission and provided required input: ${JSON.stringify(safeValues)}. Credentials secured in credential vault.`,
      };
    } catch (err: any) {
      return { success: false, content: '', error: err.message };
    }
  }
}
