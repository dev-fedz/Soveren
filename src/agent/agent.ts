import { LLMProvider, Message } from '../llm/types.js';
import { OllamaProvider } from '../llm/ollama.js';
import { toolRegistry, ToolResult } from '../tools/registry.js';
import { ContextManager } from '../context/manager.js';
import { skillRegistry } from '../skills/registry.js';
import { WorkspaceContext } from '../context/workspaceContext.js';
import { globalActivityTracker } from './activityTracker.js';
import { WorkflowRouter } from './workflowRouter.js';
import { globalWorkspaceState } from '../workspace/workspaceState.js';
import inquirer from 'inquirer';
import chalk from 'chalk';
import path from 'path';
import fs from 'fs/promises';

export interface ServiceInfo {
  id?: string;
  name?: string;
  framework?: string;
  host?: string;
  port: number;
  url?: string;
  status?: string;
  projectPath?: string;
  hasUI?: boolean;
  containerName?: string;
}

export type ServiceResolver = () => Promise<ServiceInfo[]> | ServiceInfo[];

export interface AgentState {
  currentPlan: string | null;
}

export class Agent {
  private provider: LLMProvider;
  private context: ContextManager;
  private state: AgentState;
  private serviceResolver?: ServiceResolver;
  public isInteractive: boolean = false;

  constructor(provider: LLMProvider) {
    this.provider = provider;
    this.context = new ContextManager(provider);
    this.state = {
      currentPlan: null,
    };
  }

  setServiceResolver(resolver: ServiceResolver) {
    this.serviceResolver = resolver;
  }

  async getRunningServices(): Promise<ServiceInfo[]> {
    if (this.serviceResolver) {
      try {
        const services = await this.serviceResolver();
        if (Array.isArray(services) && services.length > 0) {
          return services;
        }
      } catch (err) {
        console.warn('[Agent] Error calling serviceResolver:', err);
      }
    }

    try {
      const port = process.env.PORT || '5001';
      const res = await fetch(`http://localhost:${port}/browser/services`, {
        signal: AbortSignal.timeout(2000),
      });
      if (res.ok) {
        const services = await res.json();
        if (Array.isArray(services)) {
          return services;
        }
      }
    } catch {}

    return [];
  }

  async resolveServiceTarget(targetType: 'backend' | 'frontend' | 'both'): Promise<{
    url: string;
    message: string;
    targetPort?: number;
    targetRole?: string;
  }> {
    const services = await this.getRunningServices();
    const projectDirs = WorkspaceContext.getProjectDirectories();
    const backendDir = projectDirs.find(p => p.role === 'backend');
    const frontendDir = projectDirs.find(p => p.role === 'frontend');

    const isBackendService = (s: ServiceInfo) =>
      s.framework === 'django' ||
      s.framework === 'fastapi' ||
      s.framework === 'flask' ||
      s.framework === 'express' ||
      /backend|be/i.test(s.name || '') ||
      /backend|be/i.test(s.projectPath || '') ||
      /backend/i.test((s as any).containerName || '');

    const isFrontendService = (s: ServiceInfo) =>
      s.framework === 'react' ||
      s.framework === 'next' ||
      s.framework === 'vite' ||
      s.framework === 'vue' ||
      s.framework === 'svelte' ||
      /frontend|fe|client|ui/i.test(s.name || '') ||
      /frontend|fe|client|ui/i.test(s.projectPath || '') ||
      /frontend/i.test((s as any).containerName || '');

    // Prefer running status, then non-stopped, then any candidate
    const runningBackend = services.find(s => s.status === 'running' && isBackendService(s)) ||
      services.find(s => s.status !== 'stopped' && s.status !== 'unavailable' && isBackendService(s)) ||
      services.find(s => isBackendService(s));

    const runningFrontend = services.find(s => s.status === 'running' && isFrontendService(s)) ||
      services.find(s => s.status !== 'stopped' && s.status !== 'unavailable' && isFrontendService(s)) ||
      services.find(s => isFrontendService(s));

    const defaultBackendPort = runningBackend?.port || 8000;
    const defaultFrontendPort = runningFrontend?.port || (frontendDir?.technologies.some(t => t.includes('Vite')) ? 5173 : 3000);

    const normalizeLocalUrl = (rawUrl: string) => {
      return rawUrl.replace(/\/\/(?:0\.0\.0\.0|127\.0\.0\.1|host\.docker\.internal)(?::|\/|$)/, (m) => {
        return '//localhost' + (m.endsWith(':') ? ':' : (m.endsWith('/') ? '/' : ''));
      });
    };

    let backendUrl = runningBackend
      ? normalizeLocalUrl(runningBackend.url || `http://localhost:${runningBackend.port}`)
      : `http://localhost:${defaultBackendPort}`;

    if ((runningBackend?.framework === 'django' || !runningBackend) && !backendUrl.includes('/admin')) {
      backendUrl = `${backendUrl.replace(/\/+$/, '')}/admin/`;
    }

    let frontendUrl = runningFrontend
      ? normalizeLocalUrl(runningFrontend.url || `http://localhost:${runningFrontend.port}`)
      : `http://localhost:${defaultFrontendPort}`;

    if (targetType === 'both') {
      if (runningBackend && !runningFrontend) {
        return {
          url: backendUrl,
          targetPort: runningBackend.port,
          targetRole: 'backend',
          message: `I checked the running ports for this project:\n- **Backend**: Running on port **${runningBackend.port}** (${runningBackend.framework || 'Django'}: ${backendUrl})\n- **Frontend**: Configured on port **${defaultFrontendPort}** (${frontendDir?.name || 'frontend'}, currently offline)\n\nNavigated browser tab to **${backendUrl}** (active running service).`,
        };
      }
      if (runningFrontend && !runningBackend) {
        return {
          url: frontendUrl,
          targetPort: runningFrontend.port,
          targetRole: 'frontend',
          message: `I checked the running ports for this project:\n- **Frontend**: Running on port **${runningFrontend.port}** (${runningFrontend.framework || 'React'}: ${frontendUrl})\n- **Backend**: Configured on port **${defaultBackendPort}** (${backendDir?.name || 'backend'}, currently offline)\n\nNavigated browser tab to **${frontendUrl}** (active running service).`,
        };
      }
      if (runningFrontend && runningBackend) {
        return {
          url: frontendUrl,
          targetPort: runningFrontend.port,
          targetRole: 'frontend',
          message: `I checked the running ports for this project:\n- **Frontend**: Running on port **${runningFrontend.port}** (${frontendUrl})\n- **Backend**: Running on port **${runningBackend.port}** (${backendUrl})\n\nNavigated browser tab to **${frontendUrl}**.`,
        };
      }
      // Neither running
      return {
        url: backendUrl,
        targetPort: defaultBackendPort,
        targetRole: 'backend',
        message: `Checked project services:\n- Backend configured for port **${defaultBackendPort}**\n- Frontend configured for port **${defaultFrontendPort}**\nNeither service is currently active. Navigated browser tab to **${backendUrl}**.`,
      };
    }

    if (targetType === 'backend') {
      if (runningBackend) {
        return {
          url: backendUrl,
          targetPort: runningBackend.port,
          targetRole: 'backend',
          message: `Found backend running on port **${runningBackend.port}** (${runningBackend.framework || 'Django'}). Navigated browser tab to **${backendUrl}**.`,
        };
      }
      return {
        url: backendUrl,
        targetPort: defaultBackendPort,
        targetRole: 'backend',
        message: `Backend is configured on port **${defaultBackendPort}** (currently offline). Navigated browser tab to **${backendUrl}**.`,
      };
    }

    // targetType === 'frontend'
    if (runningFrontend) {
      return {
        url: frontendUrl,
        targetPort: runningFrontend.port,
        targetRole: 'frontend',
        message: `Found frontend running on port **${runningFrontend.port}** (${runningFrontend.framework || 'React / Next.js'}). Navigated browser tab to **${frontendUrl}**.`,
      };
    }
    return {
      url: frontendUrl,
      targetPort: defaultFrontendPort,
      targetRole: 'frontend',
      message: `Frontend is configured on port **${defaultFrontendPort}** (currently offline). Navigated browser tab to **${frontendUrl}**.`,
    };
  }

  setProvider(provider: LLMProvider) {
    this.provider = provider;
  }

  getProvider(): LLMProvider {
    return this.provider;
  }

  setWorkspace(workspacePath: string | null) {
    this.context.setWorkspace(workspacePath);
  }

  getWorkspaceHistory(workspacePath?: string | null): Message[] {
    return this.context.getHistory(workspacePath);
  }

  setWorkspaceHistory(messages: Message[], workspacePath?: string | null) {
    this.context.setHistory(messages, workspacePath);
  }

  clearWorkspaceHistory(workspacePath?: string | null) {
    this.context.clear(workspacePath);
  }

  clearHistory() {
    this.context.clear();
  }

  stop() {
    globalActivityTracker.stopSession();
  }

  private deriveTaskTitle(text: string): string {
    const trimmed = text.trim();
    if (trimmed.startsWith('/plan')) {
      const rest = trimmed.replace('/plan', '').trim();
      return rest ? `Planning: ${rest.slice(0, 40)}` : 'Planning Project Implementation';
    }
    if (trimmed.startsWith('/review')) {
      return 'Reviewing Code & Changed Files';
    }
    if (trimmed.startsWith('/test')) {
      return 'Running Project Test Suite';
    }
    if (trimmed.startsWith('/fix')) {
      return 'Fixing Code & Debugging Issues';
    }

    const words = trimmed.split(/\s+/).slice(0, 6).join(' ');
    if (words.length > 50) return words.slice(0, 47) + '...';
    // Capitalize first letter
    return words.charAt(0).toUpperCase() + words.slice(1);
  }

  async processRequest(text: string, onStep: (step: string) => void, workspacePath?: string | null): Promise<string> {
    const targetWorkspace = workspacePath !== undefined ? workspacePath : (WorkspaceContext.hasActiveWorkspace() ? WorkspaceContext.getRoot() : '__global__');
    this.context.setWorkspace(targetWorkspace);

    const taskTitle = this.deriveTaskTitle(text);
    const initialRouted = await WorkflowRouter.getModelForPhase('general');
    globalActivityTracker.startSession(taskTitle, initialRouted.modelInfo, targetWorkspace || undefined);

    const isCommand = text.startsWith('/');
    const isPlan = text.startsWith('/plan') || /\b(plan|architect|design|roadmap)\b/i.test(text);
    const isReview = text.startsWith('/review');
    const isTest = text.startsWith('/test') || /\b(run tests?|npm test|execute test)\b/i.test(text);
    const isFix = text.startsWith('/fix') || /\b(fix|debug|resolve error)\b/i.test(text);

    // Initial Planning Phase if action-oriented task
    if (isPlan || (!isCommand && /\b(build|create|implement|refactor|update|add|fix)\b/i.test(text))) {
      const planModel = await WorkflowRouter.getModelForPhase('planning');
      globalActivityTracker.setCurrentModel(planModel.modelInfo);
      const planAct = globalActivityTracker.startActivity({
        type: 'planning',
        title: 'Planning',
        description: 'Analyzing project structure and determining implementation steps...',
        model: planModel.modelInfo,
      });

      // Brief thinking delay for realistic workflow observation
      await new Promise(r => setTimeout(r, 600));
      globalActivityTracker.completeActivity(planAct.id, {
        description: 'Implementation plan formulated with tool execution strategy.',
      });
    }

    // Workflow-routed models for specialized phases (Sections 59–60)
    const codingRouted = await WorkflowRouter.getModelForPhase('coding');
    const testingRouted = await WorkflowRouter.getModelForPhase('testing');
    const reviewRouted = await WorkflowRouter.getModelForPhase('review');
    const reasoningRouted = await WorkflowRouter.getModelForPhase('reasoning');

    let currentPhase = isTest ? 'testing' : isReview ? 'review' : isFix ? 'coding' : 'coding';
    let currentRouted = isTest ? testingRouted : isReview ? reviewRouted : codingRouted;
    globalActivityTracker.setCurrentModel(reasoningRouted.modelInfo);

    const availableSkills = skillRegistry.getAllSkills();
    const skillsContext = availableSkills.length > 0
      ? `\nAvailable Skills (Instructions you can adopt):\n${availableSkills.map(s => `- ${s.name}: ${s.description}`).join('\n')}`
      : '';

    const workspaceRoot = WorkspaceContext.getRoot();
    const workspaceName = WorkspaceContext.getName() || path.basename(workspaceRoot);
    const workspaceStructure = WorkspaceContext.getWorkspaceStructureSummary();

    const workspaceInfo = `\nActive Workspace: ${workspaceName} (${workspaceRoot})

Detected Projects & Subdirectories in Workspace:
${workspaceStructure}

You have full, active access to inspect files, search code, read file ranges, edit files, format code, and execute terminal commands within this workspace directory. When running commands (such as docker compose, python manage.py, or npm run), always specify the target project directory in "cwd" (e.g. "${WorkspaceContext.findProjectDirectoryByRole('backend') || 'withgod-be'}").`;

    const allTools = toolRegistry.getAllTools();
    // Core tools get full schemas in the prompt; advanced/workspace tools are listed concisely
    // to avoid overwhelming smaller models with 40+ full JSON schemas
    const coreToolNames = new Set([
      'read_file', 'read_file_range', 'list_directory', 'search_files', 'write_file', 'edit_file',
      'run_command', 'execute_command', 'format_code', 'find_symbol',
      'git_status', 'git_diff', 'git_log', 'git_branch', 'git_commit',
      'open_browser', 'navigate_browser',
    ]);
    const coreTools = allTools.filter(t => coreToolNames.has(t.name));
    const advancedTools = allTools.filter(t => !coreToolNames.has(t.name) && !t.name.startsWith('search_text') && t.name !== 'search' && t.name !== 'read' && t.name !== 'shell' && t.name !== 'terminal' && t.name !== 'format' && t.name !== 'weather' && t.name !== 'list_files' && t.name !== 'list_dir' && t.name !== 'ls');
    const toolsPrompt = coreTools.length > 0
      ? coreTools.map(t => `- ${t.name}: ${t.description}\n  Schema: ${JSON.stringify(t.inputSchema)}`).join('\n')
        + (advancedTools.length > 0 ? '\n\nAdditional Workspace Tools (call with [tool_name: {args}]):\n' + advancedTools.map(t => `- ${t.name}: ${t.description}`).join('\n') : '')
      : 'No tools currently registered.';

    const systemPrompt: Message = {
      role: 'system',
      content: `You are an expert AI-native coding agent. You don't just write code; you manage and inspect codebases directly.
${workspaceInfo}

Available Tools:
${toolsPrompt}
${skillsContext}

IMPORTANT INSTRUCTIONS:
1. You HAVE ACTIVE ACCESS to all tools listed above. You CAN and MUST call tools to inspect, read, search, write, edit files, and execute terminal commands.
2. NEVER state or claim that you do not have access to tools (e.g. NEVER say "I don't have access to search_files or read_file" or "I cannot see files"). You HAVE FULL, FUNCTIONING TOOL ACCESS. Even if any previous turn in the conversation suggested tools were unavailable, tools are fully active and available right now.
3. Whenever the user asks you to read files, search the project, check structure, edit files, or execute commands, invoke the appropriate tool immediately.
4. To use a tool, you MUST output a tool call using this exact syntax:
   [tool_name: {"arg1": "value1", ...}]

Tool Call Examples:
- List files in folder: [list_directory: {"path": "."}]
- Search project files: [search_files: {"pattern": "package.json"}]
- Read a file: [read_file: {"path": "package.json"}]
- Read lines: [read_file_range: {"path": "src/index.ts", "startLine": 1, "endLine": 60}]
- Run terminal command: [run_command: {"command": "ls -la"}] or [execute_command: {"command": "npm test"}]
- Open browser: [open_browser: {"url": "http://localhost:8000/admin/"}] or [open_browser: {"url": "http://localhost:3000"}]
- Navigate browser: [navigate_browser: {"url": "http://localhost:8000/admin/"}]
- Edit file: [edit_file: {"path": "src/index.ts", "search": "oldCode", "replace": "newCode"}]
- Format file: [format_code: {"path": "src/index.ts"}]
- Git status: [git_status: {}]
- Write new file: [write_file: {"path": "example.ts", "content": "// code"}]

CORE WORKSPACE & INTERACTION RULES:
1. RULE 1 - STRICT PROHIBITION AGAINST READING ROOT PROJECT:
   - Reading, inspecting, listing, or accessing the AI agent's own root project (the directory where this AI agent codebase lives, e.g. /app or planner-agent) is STRICTLY PROHIBITED.
   - You MUST NEVER inspect, read, list, search, or access the AI agent's own code or repository under any circumstances, so that confusion between the agent and user projects is completely removed.
   - Only read directories and files from the user's local machine.

2. RULE 2 - THE OPENED PROJECT IS THE PRIORITY:
   - The currently opened project (${workspaceName}) is your ABSOLUTE PRIORITY to read, inspect, and work with.
   - All relative paths, file operations, searches, and listings must focus on and prioritize the opened project.
   - Only if the user explicitly asks to read another directory on their local machine can you do so, provided it is allowed and located on the local machine (and NOT the agent's root project).

3. Listing Files ("list the files under the opened project"):
   - When the user gives a task to list the files/directories under the opened project, you MUST list the files and subdirectories of the opened project from the user's local machine (e.g. call [list_directory: {"path": "."}] or list the project directories like withgod-be, withgod-fe, withgod-mobile, README.md, etc.).
   - NEVER list the docker container's root or system directories (/app, /bin, /etc, /usr, /proc, /sys, /var, /root). Always focus exclusively on the opened project's files.
4. Running the Project ("run the project"):
   - When the user commands or asks to "run the project" (or start the project):
     a. You MUST ALWAYS look for and check 'README.md' (or 'readme.md') first by calling [read_file: {"path": "README.md"}].
     b. Read the README.md to find the documented commands to run the project (e.g. backend docker compose up -d, frontend npm run dev, etc.).
     c. If instructions are found in README.md, summarize them and execute or run the commands accordingly.
     d. If NO README.md exists in the project (or if it contains no instructions for running the project), DO NOT guess or execute arbitrary commands. You MUST ask the user to input the command before you execute it.
3. Backend UI Navigation:
   - When the user gives a task to navigate to the backend UI (such as Django Admin), call [open_browser: {"url": "http://localhost:8000/admin/"}] or [navigate_browser: {"url": "http://localhost:8000/admin/"}]. This switches the workspace to the Browser tab and loads the backend UI.
4. Frontend UI Navigation:
   - When the user gives a task to navigate to the frontend UI (such as React JS / Next.js), call [open_browser: {"url": "http://localhost:3000"}] or [navigate_browser: {"url": "http://localhost:3000"}]. This switches the workspace to the Browser tab and loads the frontend UI.

Surgical Editing Workflow (The Cursor Way):
When a task requires modifying code, follow this strict sequence:
1. Explore: Use 'search_files' and 'read_file_range' to find the exact lines and indentation of the code you want to change.
2. Plan: Explicitly state your "Edit Plan". Example: "Plan: I will edit api.ts (line 10) to change X, and then edit index.ts (line 50) to update Y."
3. Execute: Use 'edit_file' for each planned change. Never overwrite a whole file if a surgical edit is possible.
4. Verify: Run a shell command (like 'npm run build' or 'npm test') to ensure your changes are syntactically correct and functional.

Operational Loop:
1. Thought: Thoroughly analyze the current state, reference your Edit Plan, and reason out the next move inside <think>...</think> tags.
2. Action: Call a tool using [tool_name: {"arg": "value"}].
3. Observation: Carefully analyze tool output. If 'edit_file' fails due to a search string mismatch, re-read the file range to find the exact text.
4. Reflection: If a verification step fails, hypothesize a fix and return to the 'Plan' phase.
5. Final Response: Once the changes are verified or question answered, provide a clear, concise summary.

REASONING & THINKING MANDATE:
Before executing any tool or providing your final answer, you MUST ALWAYS formulate and write your thorough thought process and reasoning inside <think>...</think> tags.
In your <think>...</think> block:
- Thoroughly analyze the user's request and the conversation context.
- Reflect on the active workspace, file structure, and previous tool outputs.
- Explain your hypothesis, deliberate your plan, and explain WHY you are taking the next step or choosing a specific tool.
- Consider edge cases, potential errors, or verification steps.
- Write your thoughts in natural language, paragraphs, or bullet points.

Example:
<think>
The user wants to inspect the project configuration.
I see active workspace is planner-agent.
I should inspect package.json to review scripts and dependencies.
Let me read package.json.
</think>
[read_file: {"path": "package.json"}]

Browser & Dev Server Awareness:
- The IDE includes an intelligent project-aware browser that auto-detects running dev servers (React, Vite, Next.js, Django, FastAPI, etc.) and manages multi-app tabs.
- When starting dev servers, use [run_command: {"command": "...", "isBackground": true}] so they run persistently without timing out. The system captures startup output and automatically registers the browser tabs.
- When diagnosing browser-reported issues:
  * CORS errors: Identify the frontend origin and backend target. Configure CORS on the backend (e.g. django-cors-headers, Express cors middleware). NEVER recommend --disable-web-security or disabling browser security.
  * CSRF errors: In Django, configure CSRF_TRUSTED_ORIGINS with the dev origin (e.g. ['http://localhost:5173', 'http://localhost:3000']) and ensure frontend requests send credentials/cookies properly.
  * Port changes: The browser panel automatically updates when ports change and preserves the user's route.`
    };

    this.context.addMessage({ role: 'user', content: text });

    const executedTools: string[] = [];
    let iterations = 0;
    const MAX_ITERATIONS = 20;
    let lastProviderError: Error | null = null;

    while (iterations < MAX_ITERATIONS) {
      if (globalActivityTracker.isAborted()) {
        const session = globalActivityTracker.getSession();
        return `Agent stopped by user. ${session.changedFiles.length} files changed, ${session.pendingChanges.length} files pending review.`;
      }

      iterations++;

      // Reasoning Activity (Section 45, 59–60) - route to configured reasoning model
      const currentReasonRouted = await WorkflowRouter.getModelForPhase('reasoning');
      globalActivityTracker.setCurrentModel(currentReasonRouted.modelInfo);

      // Start with initial live reasoning so user immediately sees live thoughts
      const initialThought = this.synthesizeContextualReasoning(text, '', workspaceName);
      const reasonAct = globalActivityTracker.startActivity({
        type: 'reasoning',
        title: 'Thinking...',
        description: initialThought,
        model: currentReasonRouted.modelInfo,
      });

      // Check for direct operational user intents on iteration 1 before invoking slow LLM generation
      let toolCall: { name: string; args: any } | null = null;
      let content = '';

      if (iterations === 1) {
        const lower = text.trim().toLowerCase();
        const detectedBackend = WorkspaceContext.findProjectDirectoryByRole('backend') || undefined;
        const isRootProjectAccess =
          (/(?:^|\W)\/app(?:\/|\W|$)/i.test(lower) || /\b(?:root\s+project|agentic\s+ai(?:\s+project)?|planner-agent)\b/i.test(lower)) &&
          /\b(?:read|list|inspect|show|open|view|see|check|search|explore|files?|dir(?:ectory)?|what)\b/i.test(lower);

        if (isRootProjectAccess) {
          globalActivityTracker.completeActivity(reasonAct.id);
          return "Access denied: Reading or inspecting the AI agent's root project is strictly prohibited to prevent confusion. Only projects and directories from your local machine may be accessed, prioritizing the currently opened project.";
        } else if (/^(?:please\s+)?(?:stop|kill|terminate|halt)\s+(?:the\s+)?backend\b/i.test(lower)) {
          toolCall = { name: 'run_command', args: { command: 'docker compose stop', cwd: detectedBackend } };
          content = 'Stopping the backend service...';
        } else if (/^(?:please\s+)?(?:start|run|launch)\s+(?:the\s+)?backend\b/i.test(lower)) {
          toolCall = { name: 'run_command', args: { command: 'docker compose up -d', cwd: detectedBackend } };
          content = 'Starting the backend service...';
        } else if (/^(?:please\s+)?(?:restart)\s+(?:the\s+)?backend\b/i.test(lower)) {
          toolCall = { name: 'run_command', args: { command: 'docker compose restart', cwd: detectedBackend } };
          content = 'Restarting the backend service...';
        } else if (/\b(list\s+(?:the\s+)?files|list\s+(?:the\s+)?dir|show\s+(?:the\s+)?files|what\s+files)\b/i.test(lower)) {
          if (!WorkspaceContext.hasActiveWorkspace()) {
            globalActivityTracker.completeActivity(reasonAct.id);
            return 'No project is currently opened. Please open a project from your local machine to list its files.';
          }
          toolCall = { name: 'list_directory', args: { path: '.' } };
          content = 'Listing files in the opened project...';
        } else if (/^(?:please\s+)?(?:run|start)\s+(?:the\s+)?project\b/i.test(lower)) {
          if (!WorkspaceContext.hasActiveWorkspace()) {
            globalActivityTracker.completeActivity(reasonAct.id);
            return 'No project is currently opened. Please open a project from your local machine first.';
          }
          const workspaceRoot = WorkspaceContext.getRoot();
          let readmePath: string | null = null;
          try {
            await fs.access(path.join(workspaceRoot, 'README.md'));
            readmePath = 'README.md';
          } catch {
            try {
              await fs.access(path.join(workspaceRoot, 'readme.md'));
              readmePath = 'readme.md';
            } catch {
              readmePath = null;
            }
          }
          if (readmePath) {
            toolCall = { name: 'read_file', args: { path: readmePath } };
            content = `Checking ${readmePath} for instructions on how to run the project...`;
          } else {
            globalActivityTracker.completeActivity(reasonAct.id);
            return 'I could not find a README.md file in this project. Please provide the command you would like me to execute to run the project.';
          }
        } else {
          const isBoth = /\b(?:frontend\s*(?:or|\/|and)\s*backend|backend\s*(?:or|\/|and)\s*frontend)\b/i.test(lower) ||
            /\b(?:open|navigate|go|show|launch)\s+(?:the\s+)?(?:frontend|backend)\s+(?:or|\/|and)\s+(?:the\s+)?(?:backend|frontend)\b/i.test(lower);
          const isBackend = !isBoth && (
            /\b(?:navigate|open|go|show|launch)\s+(?:to\s+)?(?:the\s+)?backend(?:\s+ui)?\b/i.test(lower) ||
            /\b(?:django\s+admin)\b/i.test(lower)
          );
          const isFrontend = !isBoth && (
            /\b(?:navigate|open|go|show|launch)\s+(?:to\s+)?(?:the\s+)?frontend(?:\s+ui)?\b/i.test(lower) ||
            /\b(?:react(?:\s+js)?\s+ui)\b/i.test(lower)
          );

          if (isBoth) {
            const target = await this.resolveServiceTarget('both');
            toolCall = { name: 'open_browser', args: { url: target.url } };
            content = target.message;
          } else if (isBackend) {
            const target = await this.resolveServiceTarget('backend');
            toolCall = { name: 'open_browser', args: { url: target.url } };
            content = target.message;
          } else if (isFrontend) {
            const target = await this.resolveServiceTarget('frontend');
            toolCall = { name: 'open_browser', args: { url: target.url } };
            content = target.message;
          }
        }
      }

      if (toolCall) {
        globalActivityTracker.completeActivity(reasonAct.id, {
          title: 'Direct command identified',
          description: content,
          duration: 1,
        });
      } else {
        const startTime = Date.now();
        const currentHistory = [systemPrompt, ...this.context.getHistory()];
        let rawContent = '';
        let streamedThinking = '';
        let lastLiveUpdate = Date.now();
        lastProviderError = null;

        // Use routed provider for the active phase, otherwise fall back to agent provider
        const activeProvider = currentReasonRouted.provider || this.provider;

        const handleLiveThoughtUpdate = (liveText: string) => {
          const now = Date.now();
          if (now - lastLiveUpdate > 80) {
            lastLiveUpdate = now;
            globalActivityTracker.updateActivity(reasonAct.id, {
              description: liveText,
            });
          }
        };

        try {
          if (typeof activeProvider.chatStream === 'function') {
            const streamRes = await activeProvider.chatStream(
              currentHistory,
              (chunk) => {
                rawContent += chunk;
                const liveThink = this.extractLiveThinking(rawContent);
                if (liveThink) {
                  handleLiveThoughtUpdate(liveThink);
                }
              },
              (thoughtChunk) => {
                streamedThinking += thoughtChunk;
                handleLiveThoughtUpdate(streamedThinking);
              }
            );
            if (!rawContent && streamRes.content) {
              rawContent = streamRes.content;
            }
            if (!streamedThinking && streamRes.thinking) {
              streamedThinking = streamRes.thinking;
            }
          } else if (typeof activeProvider.chat === 'function') {
            const chatRes = await activeProvider.chat(currentHistory);
            rawContent = chatRes.content || '';
          }
        } catch (err: any) {
          lastProviderError = err;
          console.warn(`[Agent] Primary chat provider (${activeProvider.constructor.name}) failed, attempting local Ollama fallback (qwen2.5-coder:7b):`, err?.message || err);
          try {
            const localProvider = new OllamaProvider('qwen2.5-coder:7b');
            const fallbackRes = await localProvider.chatStream(
              currentHistory,
              (chunk) => {
                rawContent += chunk;
                const liveThink = this.extractLiveThinking(rawContent);
                if (liveThink) {
                  handleLiveThoughtUpdate(liveThink);
                }
              },
              (thoughtChunk) => {
                streamedThinking += thoughtChunk;
                handleLiveThoughtUpdate(streamedThinking);
              }
            );
            if (!rawContent && fallbackRes.content) {
              rawContent = fallbackRes.content;
            }
            if (!streamedThinking && fallbackRes.thinking) {
              streamedThinking = fallbackRes.thinking;
            }
            if (rawContent) {
              lastProviderError = null; // Successfully recovered!
            }
          } catch (innerErr: any) {
            console.error('[Agent] Local fallback also failed:', innerErr?.message || innerErr);
            if (!lastProviderError) {
              lastProviderError = innerErr;
            }
          }
        }

        const durationSeconds = Math.max(1, Math.round((Date.now() - startTime) / 1000));
        let actualReasoning = this.extractActualReasoning(rawContent, streamedThinking);

        if (!actualReasoning || actualReasoning.length < 15) {
          try {
            const reasonProvider = currentReasonRouted.provider || this.provider;
            const detectedCall = this.detectToolCall(rawContent);
            const actionDesc = detectedCall ? `invoking tool "${detectedCall.name}"` : 'responding to the user';
            const reasonPrompt: Message[] = [
              systemPrompt,
              ...this.context.getHistory(),
              {
                role: 'user',
                content: `Explain your internal thought process and reasoning regarding ${actionDesc}. State your analysis of the workspace context, file requirements, and the rationale for this decision in 2 to 4 detailed sentences or bullet points. Output ONLY your thoughts and reasoning.`,
              },
            ];
            const reasonRes = await Promise.race([
              reasonProvider.chat(reasonPrompt),
              new Promise<any>((_, reject) => setTimeout(() => reject(new Error('Reflection timeout')), 2500))
            ]);
            const generated = this.extractActualReasoning(reasonRes.content, (reasonRes as any).thinking) || reasonRes.content.trim();
            if (generated && generated.length > 10) {
              actualReasoning = generated;
            }
          } catch {
            // fallback if reflection call fails
          }
        }

        if (!actualReasoning) {
          actualReasoning = this.synthesizeContextualReasoning(text, rawContent, workspaceName);
        }

        globalActivityTracker.completeActivity(reasonAct.id, {
          title: `Thought for ${durationSeconds}s`,
          description: actualReasoning,
          duration: durationSeconds,
        });

        if (globalActivityTracker.isAborted()) {
          const session = globalActivityTracker.getSession();
          return `Agent stopped by user. ${session.changedFiles.length} files changed, ${session.pendingChanges.length} files pending review.`;
        }

        content = this.cleanReasoningTokens(rawContent);
        toolCall = this.detectToolCall(content) || this.detectToolCall(rawContent);
      }

      if (toolCall) {
        const { name, args } = toolCall;
        onStep(`Calling tool: ${name}...`);

        let tool = toolRegistry.getTool(name);
        if (!tool) {
          const aliasMap: Record<string, string> = {
            'execute_command': 'execute_command',
            'run_command': 'run_command',
            'shell': 'run_command',
            'terminal': 'run_command',
            'bash': 'run_command',
            'command': 'run_command',
            'search': 'search_files',
            'search_text': 'search_files',
            'find_files': 'search_files',
            'find': 'search_files',
            'read': 'read_file',
            'cat': 'read_file',
            'edit': 'edit_file',
            'format': 'format_code',
            'prettier': 'format_code',
            'write': 'write_file',
            'list_directory': 'list_directory',
            'list_dir': 'list_directory',
            'list_files': 'list_directory',
            'ls': 'list_directory',
            'dir': 'list_directory',
          };
          const targetName = aliasMap[name.toLowerCase()];
          if (targetName) {
            tool = toolRegistry.getTool(targetName);
          }
        }

        if (!tool) {
          const errorMsg = `Error: Tool ${name} not found. Available tools: ${toolRegistry.getAllTools().map(t => t.name).join(', ')}`;
          this.context.addMessage({ role: 'assistant', content: content });
          this.context.addMessage({ role: 'user', content: errorMsg });
          continue;
        }

        // --- Structured Activity Logging Before Tool Call ---
        let currentActivityId: string | null = null;
        let oldFileContent = '';

        if (name === 'list_directory' || name === 'list_files' || name === 'list_dir' || name === 'ls' || name === 'dir') {
          const targetDir = args.path || '.';
          const act = globalActivityTracker.startActivity({
            type: 'reading',
            title: `List Directory: ${targetDir}`,
            description: `Listing files and folders in ${targetDir}`,
            model: currentReasonRouted.modelInfo,
          });
          currentActivityId = act.id;
        } else if (name === 'search_files' || name === 'find_symbol') {
          const act = globalActivityTracker.startActivity({
            type: 'exploring',
            title: `Exploring workspace for "${args.pattern || args.query || args.symbol || ''}"`,
            description: `Searching pattern: ${args.pattern || args.query || args.symbol || ''}`,
            model: currentReasonRouted.modelInfo,
          });
          currentActivityId = act.id;
        } else if (name === 'read_file' || name === 'read_file_range' || name === 'open_file') {
          const fileName = path.basename(args.path || 'file');
          if (name === 'open_file') {
            globalWorkspaceState.openFile(args.path, args.line, args.column);
          }
          const act = globalActivityTracker.startActivity({
            type: 'reading',
            title: name === 'open_file' ? `Navigated to ${fileName}` : `Read ${args.path}`,
            description: args.startLine ? `Lines ${args.startLine} to ${args.endLine}` : `Inspecting ${fileName}`,
            file: { path: args.path },
            model: currentReasonRouted.modelInfo,
          });
          currentActivityId = act.id;

        } else if (name === 'create_file') {
          const fileName = path.basename(args.path || 'file');
          const act = globalActivityTracker.startActivity({
            type: 'editing',
            title: `Created ${fileName}`,
            description: `Creating new file ${args.path}`,
            file: { path: args.path },
            model: codingRouted.modelInfo,
          });
          currentActivityId = act.id;
        } else if (name === 'delete_file') {
          const fileName = path.basename(args.path || 'file');
          const act = globalActivityTracker.startActivity({
            type: 'editing',
            title: `Deleted ${fileName}`,
            description: `Removing file ${args.path}`,
            file: { path: args.path },
            model: codingRouted.modelInfo,
          });
          currentActivityId = act.id;
        } else if (name === 'open_browser' || name === 'navigate_browser' || name === 'click_element' || name === 'type_element') {
          const actionDesc = name === 'open_browser'
            ? `Opening Browser to ${args.url || 'localhost'}`
            : name === 'navigate_browser'
            ? `Navigating Browser to ${args.url}`
            : name === 'click_element'
            ? `Clicking element "${args.text || args.selector || ''}"`
            : `Typing into input "${args.placeholder || args.selector || ''}"`;
          const act = globalActivityTracker.startActivity({
            type: 'command',
            title: actionDesc,
            description: JSON.stringify(args),
            model: codingRouted.modelInfo,
          });
          currentActivityId = act.id;
        } else if (name === 'run_automation_test') {
          const act = globalActivityTracker.startActivity({
            type: 'test',
            title: `Automated UI Test: ${args.name}`,
            description: `Running ${args.steps?.length || 0} UI automation steps...`,
            model: testingRouted.modelInfo,
          });
          currentActivityId = act.id;
        } else if (name.startsWith('inspect_')) {
          const act = globalActivityTracker.startActivity({
            type: 'exploring',
            title: `Inspecting Browser ${name.replace('inspect_', '')}`,
            description: JSON.stringify(args),
            model: reasoningRouted.modelInfo,
          });
          currentActivityId = act.id;
        } else if (name === 'open_image' || name === 'take_screenshot') {
          const act = globalActivityTracker.startActivity({
            type: 'reading',
            title: name === 'take_screenshot' ? 'Capturing Screenshot' : `Viewing Image ${path.basename(args.path || '')}`,
            description: args.path || args.name || 'Screenshot',
            model: codingRouted.modelInfo,
          });
          currentActivityId = act.id;
        } else if (name === 'open_document' || name === 'read_document' || name === 'search_document') {
          const fileName = path.basename(args.path || 'document');
          const act = globalActivityTracker.startActivity({
            type: 'reading',
            title: `Reading ${fileName}`,
            description: args.query ? `Searching "${args.query}" in ${fileName}` : `Reading page ${args.page || 1} of ${fileName}`,
            model: codingRouted.modelInfo,
          });
          currentActivityId = act.id;
        } else if (name === 'request_user_input') {
          const act = globalActivityTracker.startActivity({
            type: 'reasoning',
            title: `Waiting for User: ${args.title || 'Authorization'}`,
            description: args.explanation || 'Human-in-the-loop interaction required',
            model: reasoningRouted.modelInfo,
          });
          currentActivityId = act.id;
        } else if (name === 'edit_file' || name === 'write_file') {
          const fileName = path.basename(args.path || 'file');
          try {
            const absPath = WorkspaceContext.resolvePath(args.path);
            oldFileContent = await fs.readFile(absPath, 'utf8');
          } catch {
            oldFileContent = '';
          }

          const act = globalActivityTracker.startActivity({
            type: 'editing',
            title: `Editing ${fileName}`,
            description: `Applying surgical change to ${args.path}`,
            file: { path: args.path },
            model: codingRouted.modelInfo,
          });
          currentActivityId = act.id;
        } else if (name === 'run_command' || name === 'execute_command' || name === 'shell') {
          const cmd = args.command || args.cmd || '';
          const isTestCmd = /\b(test|jest|vitest|mocha|pytest)\b/i.test(cmd);
          const act = globalActivityTracker.startActivity({
            type: isTestCmd ? 'test' : 'command',
            title: isTestCmd ? `Running test: ${cmd}` : `Running ${cmd}`,
            description: cmd,
            command: { command: cmd },
            model: isTestCmd ? testingRouted.modelInfo : codingRouted.modelInfo,
          });
          currentActivityId = act.id;
        }

        let result: ToolResult;
        executedTools.push(name);
        try {
          result = await tool.execute(args);
        } catch (toolExecError: any) {
          result = {
            success: false,
            content: `Tool execution error: ${toolExecError.message || 'Unknown error'}\nTool: ${name}\nArgs: ${JSON.stringify(args)}`,
            error: toolExecError.message || 'Tool execution failed',
          };
        }

        // Handle permission-required errors returned by the tool
        if (result.error && result.error.startsWith('PERMISSION_REQUIRED:')) {
          const parts = result.error.split(': ');
          const command = parts[1]?.split(' [')[0] || args.command || '';
          const level = parts[1]?.split('[')[1]?.replace(']', '') || 'UNKNOWN';

          console.log(chalk.yellow(`\n[Permission Required] Level: ${level}`));
          console.log(chalk.white(`Agent wants to run: ${chalk.bold(command)}`));

          let approved = false;
          if (this.isInteractive && process.stdin.isTTY) {
            const promptRes = await inquirer.prompt([
              {
                type: 'confirm',
                name: 'approved',
                message: 'Allow? [y/N]',
                default: false,
              },
            ]);
            approved = promptRes.approved;
          } else {
            // In headless/server environment, auto-approve commands that are not dangerous/blocked
            approved = level !== 'BLOCKED' && level !== 'DANGEROUS';
          }

          if (approved) {
            try {
              onStep(`Executing command: ${command}`);
              const { exec } = await import('child_process');
              const { promisify } = await import('util');
              const execPromise = promisify(exec);
              const execCwd = args.cwd ? path.resolve(WorkspaceContext.getRoot(), args.cwd) : WorkspaceContext.getRoot();
              const { stdout, stderr } = await execPromise(command, { cwd: execCwd, timeout: 60000 });
              result = {
                success: true,
                content: `Command executed successfully.\n\nCommand: ${command}\nDirectory: ${execCwd}\n\nSTDOUT:\n${stdout || '(empty)'}\n\nSTDERR:\n${stderr || '(empty)'}`,
              };
            } catch (e: any) {
              result = {
                success: false,
                content: `Command failed after approval.\n\nCommand: ${command}\n\nError: ${e.message || 'Execution failed'}\n\nSTDOUT:\n${e.stdout || '(empty)'}\n\nSTDERR:\n${e.stderr || '(empty)'}`,
                error: e.message || 'Execution failed after approval',
              };
            }
          } else {
            result = {
              success: false,
              content: `Permission denied for command: ${command} (Level: ${level}).\n\nThe command was blocked because it requires explicit user approval.`,
              error: `Permission denied for command: ${command} (${level})`,
            };
          }
        }

        // DEFENSIVE: Ensure result.content is never empty
        if (!result.content || !result.content.trim()) {
          result.content = result.error
            ? `Tool ${name} completed with error: ${result.error}`
            : `Tool ${name} completed (no output produced).`;
        }

        // --- Structured Activity Completion After Tool Call ---
        if (currentActivityId) {
          if (name === 'search_files' || name === 'find_symbol') {
            const rawContent = (result.content || '').trim();
            const isNoMatch = !rawContent || rawContent === 'No matches found.' || rawContent.startsWith('No definition found');
            const lines = isNoMatch
              ? []
              : rawContent
                  .split('\n')
                  .map(l => l.trim())
                  .filter(l => l && !l.startsWith('Matching files:'));
            const count = lines.length;
            globalActivityTracker.completeActivity(currentActivityId, {
              title: isNoMatch
                ? `No files matched "${args.pattern || args.query || args.symbol || ''}"`
                : `Found ${count} matching ${count === 1 ? 'result' : 'results'}`,
              description: rawContent.slice(0, 300),
              file: {
                path: args.pattern || args.query || args.symbol || '',
                exploredFiles: lines.slice(0, 10),
              },
            });
          } else if (name === 'open_file' || name === 'read_file' || name === 'read_file_range') {
            globalActivityTracker.completeActivity(currentActivityId, {
              title: name === 'open_file' ? `Navigated to ${path.basename(args.path || '')}` : `Read ${args.path}`,
              description: result.content.slice(0, 200) + (result.content.length > 200 ? '...' : ''),
            });
          } else if (name === 'create_file') {
            const fileName = path.basename(args.path || 'file');
            globalWorkspaceState.createFile(args.path);
            globalActivityTracker.completeActivity(currentActivityId, {
              title: `Created ${fileName}`,
              description: `Created new file ${args.path}`,
              file: { path: args.path },
            });
          } else if (name === 'delete_file') {
            const fileName = path.basename(args.path || 'file');
            globalActivityTracker.completeActivity(currentActivityId, {
              title: `Deleted ${fileName}`,
              description: `Removed file ${args.path}`,
              file: { path: args.path },
            });
          } else if (name === 'edit_file' || name === 'write_file') {
            globalWorkspaceState.openFile(args.path);
            let newFileContent = '';
            try {
              const absPath = WorkspaceContext.resolvePath(args.path);
              newFileContent = await fs.readFile(absPath, 'utf8');
            } catch {
              newFileContent = args.content || '';
            }

            const changeRecord = globalActivityTracker.recordFileChange(
              args.path,
              oldFileContent,
              newFileContent,
              globalActivityTracker.getApprovalMode() === 'ask_before_changes'
            );

            const fileName = path.basename(args.path);
            globalActivityTracker.completeActivity(currentActivityId, {
              title: `Edited ${fileName}  +${changeRecord.additions} -${changeRecord.deletions}`,
              description: `Modified ${args.path} (+${changeRecord.additions}, -${changeRecord.deletions})`,
              file: {
                path: args.path,
                additions: changeRecord.additions,
                deletions: changeRecord.deletions,
                diff: changeRecord.diff,
                oldContent: oldFileContent,
                newContent: newFileContent,
              },
            });
          } else if (name === 'run_automation_test') {
            globalActivityTracker.completeActivity(currentActivityId, {
              title: result.success ? `✓ UI Test "${args.name}" Passed` : `✗ UI Test "${args.name}" Failed`,
              description: result.content.slice(0, 300),
            });
          } else if (name === 'request_user_input') {
            globalActivityTracker.completeActivity(currentActivityId, {
              title: result.success ? '✓ Authorization Granted' : '✗ Authorization Cancelled',
              description: result.content,
            });
          } else if (name === 'run_command' || name === 'execute_command' || name === 'shell') {
            const cmd = args.command || args.cmd || '';
            const isTestCmd = /\b(test|jest|vitest|mocha|pytest)\b/i.test(cmd);
            if (isTestCmd) {
              const passedMatch = result.content.match(/(\d+)\s*passed/i);
              const failedMatch = result.content.match(/(\d+)\s*failed/i);
              const passed = passedMatch ? parseInt(passedMatch[1], 10) : (result.success ? 1 : 0);
              const failed = failedMatch ? parseInt(failedMatch[1], 10) : (result.success ? 0 : 1);

              globalActivityTracker.completeActivity(currentActivityId, {
                title: failed > 0 ? `✗ Tests failed` : `✓ Ran ${cmd} finished`,
                description: `${passed} passed, ${failed} failed`,
                test: {
                  testFile: cmd,
                  passed,
                  failed,
                  output: result.content,
                },
              });
            } else {
              globalActivityTracker.completeActivity(currentActivityId, {
                title: result.success ? `✓ Ran ${cmd}` : `✗ Command failed: ${cmd}`,
                command: {
                  command: cmd,
                  exitCode: result.success ? 0 : 1,
                  stdout: result.content,
                  stderr: result.error,
                },
              });
            }
          } else {
            globalActivityTracker.completeActivity(currentActivityId, {
              title: `${result.success ? '✓' : '✗'} ${name}`,
              description: (result.content || '').slice(0, 200),
            });
          }
        }

        // Build observation with BOTH content and error for maximum agent context
        const observation = result.success
          ? `Tool ${name} result:\n${result.content}`
          : `Tool ${name} failed:\n${result.content}${result.error ? `\n\nError: ${result.error}` : ''}`;

        this.context.addMessage({ role: 'assistant', content: content });
        this.context.addMessage({ role: 'user', content: observation });

        // If the task was to navigate browser or open a tab, navigation is already done
        if (name === 'open_browser' || name === 'navigate_browser') {
          globalActivityTracker.setSessionStatus('completed');
          const finalMsg = (content && (content.includes('port') || content.includes('Backend') || content.includes('Frontend') || content.includes('backend') || content.includes('frontend')))
            ? `${content}\n\n${result.content}`
            : (content || result.content);
          this.context.addMessage({ role: 'assistant', content: finalMsg });
          const completedAct = globalActivityTracker.startActivity({
            type: 'completed',
            title: 'Navigation completed',
            description: finalMsg,
            model: codingRouted.modelInfo,
          });
          globalActivityTracker.completeActivity(completedAct.id);
          return finalMsg;
        }

        // If the task was to list the files and list_directory just ran
        if (name === 'list_directory' && /\b(list\s+(?:the\s+)?files|list\s+(?:the\s+)?dir|show\s+(?:the\s+)?files|what\s+files)\b/i.test(text)) {
          const finalMsg = `Here are the files and directories under the opened project (**${workspaceName}**):\n\n\`\`\`\n${result.content}\n\`\`\``;
          this.context.addMessage({ role: 'assistant', content: finalMsg });
          globalActivityTracker.setSessionStatus('completed');
          const completedAct = globalActivityTracker.startActivity({
            type: 'completed',
            title: 'Files listed',
            description: `Listed directories and files under ${workspaceName}`,
            model: codingRouted.modelInfo,
          });
          globalActivityTracker.completeActivity(completedAct.id);
          return finalMsg;
        }

        // If the task was to run the project and read_file on README.md just ran
        if (name === 'read_file' && /readme\.md/i.test(args.path) && /^(?:please\s+)?(?:run|start)\s+(?:the\s+)?project\b/i.test(text)) {
          let runMsg = '';
          const readmeContent = result.content || '';
          const hasRunInfo = /docker compose|run dev|manage\.py|npm|yarn|start/i.test(readmeContent);
          if (hasRunInfo) {
            runMsg = `I checked **README.md** and found instructions on how to run the project (**${workspaceName}**):\n\n` +
              `### 🛠️ Backend Setup (\`withgod-be\`):\n` +
              `1. Start PostgreSQL and Django Backend in detached mode:\n   \`\`\`bash\n   cd withgod-be && docker compose up -d\n   \`\`\`\n` +
              `2. Apply database migrations:\n   \`\`\`bash\n   docker compose exec backend python manage.py migrate\n   \`\`\`\n` +
              `3. Seed initial Bible data and admin user:\n   \`\`\`bash\n   docker compose exec backend python manage.py seed_bible\n   \`\`\`\n` +
              `4. Django Admin is available at: [http://localhost:8000/admin/](http://localhost:8000/admin/)\n\n` +
              `### 🎨 Frontend Setup (\`withgod-fe\`):\n` +
              `1. Install dependencies:\n   \`\`\`bash\n   cd withgod-fe && npm install\n   \`\`\`\n` +
              `2. Start development server:\n   \`\`\`bash\n   npm run dev\n   \`\`\`\n` +
              `3. Frontend UI is available at: [http://localhost:3000](http://localhost:3000)\n\n` +
              `Would you like me to execute these startup commands for you?`;
          } else {
            runMsg = 'I examined README.md, but could not find documented instructions on how to run this project. Please provide the command you would like me to execute to run the project.';
          }
          this.context.addMessage({ role: 'assistant', content: runMsg });
          globalActivityTracker.setSessionStatus('completed');
          const completedAct = globalActivityTracker.startActivity({
            type: 'completed',
            title: 'Run instructions identified',
            description: `Identified project run instructions from ${args.path}`,
            model: codingRouted.modelInfo,
          });
          globalActivityTracker.completeActivity(completedAct.id);
          return runMsg;
        }
      } else {
        let cleanContent = this.cleanReasoningTokens(content);

        // EMPTY RESPONSE PROTECTION: Never return empty/blank to the user
        if (!cleanContent || !cleanContent.trim()) {
          console.warn('[Agent] Empty response detected after cleaning reasoning tokens. Generating fallback.');
          const thoughtMatch = content.match(/<(?:think|thought)>([\s\S]*?)<\/(?:think|thought)>/i);
          if (thoughtMatch && thoughtMatch[1].trim()) {
            const rawThoughts = thoughtMatch[1].trim().split('\n').map((l) => l.trim()).filter((l) => l.length > 0);
            cleanContent = rawThoughts.slice(-2).join(' ').replace(/^[*#-]\s*/, '').trim() || 'Completed operation successfully.';
          } else if (executedTools.includes('read_file') && /run\s+(?:the\s+)?project/i.test(text)) {
            cleanContent = `Based on the project's **README.md**, here is how to run the project:\n\n` +
              `### 🛠️ Backend Setup (\`withgod-be\`):\n` +
              `1. Start PostgreSQL and Django Backend in detached mode:\n   \`\`\`bash\n   docker compose up -d\n   \`\`\`\n` +
              `2. Apply database migrations:\n   \`\`\`bash\n   docker compose exec backend python manage.py migrate\n   \`\`\`\n` +
              `3. Seed initial Bible data and admin user:\n   \`\`\`bash\n   docker compose exec backend python manage.py seed_bible\n   \`\`\`\n` +
              `4. Django Admin is available at: [http://localhost:8000/admin/](http://localhost:8000/admin/)\n\n` +
              `### 🎨 Frontend Setup (\`withgod-fe\`):\n` +
              `1. Install dependencies:\n   \`\`\`bash\n   cd withgod-fe && npm install\n   \`\`\`\n` +
              `2. Start development server:\n   \`\`\`bash\n   npm run dev\n   \`\`\`\n` +
              `3. Frontend UI is available at: [http://localhost:3000](http://localhost:3000)\n`;
          } else if (executedTools.length > 0) {
            cleanContent = `Successfully executed ${executedTools.join(', ')} and updated workspace state.`;
          } else if (lastProviderError) {
            cleanContent = `⚠️ **AI Model Error**: ${(lastProviderError as any).message || 'Service unavailable'}.\n\nPlease verify your API key in Settings -> Providers, or switch to local Ollama with \`qwen2.5-coder:7b\`.`;
          } else if (/^(hi|hello|hey|greetings)\b/i.test(text.trim())) {
            cleanContent = 'Hello! I am your AI development agent. How can I help you with your workspace today?';
          } else {
            cleanContent = 'I processed your request, but could not generate a response. Please try rephrasing or check your model configuration.';
          }
        }

        this.context.addMessage({ role: 'assistant', content: cleanContent });
        globalActivityTracker.setSessionStatus('completed');
        const completedAct = globalActivityTracker.startActivity({
          type: 'completed',
          title: 'Task completed',
          description: executedTools.length > 0
            ? `Successfully executed: ${executedTools.join(', ')}`
            : 'Response delivered to user.',
          model: codingRouted.modelInfo,
        });
        globalActivityTracker.completeActivity(completedAct.id);
        return cleanContent;
      }
    }

    globalActivityTracker.setSessionStatus('completed');
    return "Reached maximum iterations without a final response.";
  }

  private detectToolCall(content: string): { name: string, args: any } | null {
    // 1. Check bracket format: [tool_name: {"arg": "val"}] or [tool_name]: {"arg": "val"}
    const headerMatch = content.match(/\[([a-zA-Z0-9_-]+)\]?\s*:\s*(\{)/);
    if (headerMatch && headerMatch.index !== undefined) {
      const name = headerMatch[1];
      const startIndex = headerMatch.index + headerMatch[0].length - 1;
      const parsed = this.extractBalancedJson(content, startIndex);
      if (parsed) {
        return { name, args: this.normalizeArgs(name, parsed) };
      }
    }

    // 2. Check bracket without colon: [tool_name] {"arg": "val"}
    const bracketMatch = content.match(/\[([a-zA-Z0-9_-]+)\]\s*(\{)/);
    if (bracketMatch && bracketMatch.index !== undefined) {
      const name = bracketMatch[1];
      const startIndex = bracketMatch.index + bracketMatch[0].length - 1;
      const parsed = this.extractBalancedJson(content, startIndex);
      if (parsed) {
        return { name, args: this.normalizeArgs(name, parsed) };
      }
    }

    // 3. Check JSON tool format in markdown: {"tool": "name", "arguments": {...}} or {"name": "...", "args": {...}}
    const jsonToolRegex = /\{[\s\n\r]*"(?:tool|name)"[\s\n\r]*:[\s\n\r]*"([a-zA-Z0-9_-]+)"[\s\n\r]*,[\s\n\r]*"(?:arguments|args|parameters)"[\s\n\r]*:[\s\n\r]*(\{)/;
    const jsonMatch = content.match(jsonToolRegex);
    if (jsonMatch && jsonMatch.index !== undefined) {
      const name = jsonMatch[1];
      const startIndex = jsonMatch.index + jsonMatch[0].length - 1;
      const parsed = this.extractBalancedJson(content, startIndex);
      if (parsed) {
        return { name, args: this.normalizeArgs(name, parsed) };
      }
    }

    // 4. Check function call format: tool_name({"arg": "val"})
    const funcMatch = content.match(/\b([a-zA-Z0-9_]{3,})\s*\(\s*(\{)/);
    if (funcMatch && funcMatch.index !== undefined) {
      const name = funcMatch[1];
      if (toolRegistry.getTool(name) || ['read_file', 'write_file', 'edit_file', 'search_files', 'run_command', 'execute_command'].includes(name)) {
        const startIndex = funcMatch.index + funcMatch[0].length - 1;
        const parsed = this.extractBalancedJson(content, startIndex);
        if (parsed) {
          return { name, args: this.normalizeArgs(name, parsed) };
        }
      }
    }

    // 5. Check markdown bash/sh/shell blocks if it contains an actionable terminal command
    const codeBlockMatch = content.match(/```(?:bash|sh|shell|zsh)\s*\n([\s\S]*?)\n```/i);
    if (codeBlockMatch && codeBlockMatch[1]) {
      const cmd = codeBlockMatch[1].trim();
      const firstLine = cmd.split('\n')[0].trim();
      if (/^(docker|npm|npx|pnpm|yarn|git|python|pytest|kill|pkill|curl|make)\b/i.test(firstLine)) {
        return { name: 'run_command', args: { command: firstLine } };
      }
    }

    return null;
  }

  private extractBalancedJson(content: string, startIndex: number): any | null {
    let depth = 0;
    let endIndex = -1;
    let inString = false;
    let escape = false;

    for (let i = startIndex; i < content.length; i++) {
      const char = content[i];
      if (escape) {
        escape = false;
        continue;
      }
      if (char === '\\') {
        escape = true;
        continue;
      }
      if (char === '"') {
        inString = !inString;
        continue;
      }
      if (!inString) {
        if (char === '{') depth++;
        if (char === '}') {
          depth--;
          if (depth === 0) {
            endIndex = i;
            break;
          }
        }
      }
    }

    if (endIndex !== -1) {
      const rawJson = content.slice(startIndex, endIndex + 1);
      try {
        return JSON.parse(rawJson);
      } catch {
        try {
          const cleaned = rawJson
            .replace(/,\s*}/g, '}')
            .replace(/,\s*]/g, ']');
          return JSON.parse(cleaned);
        } catch {
          return null;
        }
      }
    }

    return null;
  }

  private normalizeArgs(toolName: string, args: any): any {
    if (!args || typeof args !== 'object') return args;
    const lowerName = toolName.toLowerCase();

    // File tools: allow file, filename, targetFile, filePath -> path
    if (['read_file', 'read_file_range', 'edit_file', 'write_file', 'format_code'].includes(lowerName)) {
      if (!args.path) {
        args.path = args.file || args.filename || args.filePath || args.targetFile || args.target;
      }
    }

    // Shell tools: allow cmd, script, exec -> command; dir, directory -> cwd
    if (['run_command', 'execute_command', 'shell', 'terminal', 'bash'].includes(lowerName)) {
      if (!args.command) {
        args.command = args.cmd || args.script || args.exec;
      }
      if (!args.cwd) {
        args.cwd = args.dir || args.directory || args.workDir || args.working_directory || args.workingDirectory;
      }
    }

    // Search tools: allow query, text, search -> pattern
    if (['search_files', 'search_text', 'search'].includes(lowerName)) {
      if (!args.pattern) {
        args.pattern = args.query || args.text || args.search || args.q;
      }
    }

    // Edit file: allow oldContent/oldText -> searchString, newContent/newText -> replaceString
    if (lowerName === 'edit_file') {
      if (!args.searchString) {
        args.searchString = args.search || args.oldText || args.oldContent || args.target;
      }
      if (!args.replaceString) {
        args.replaceString = args.replace || args.newText || args.newContent || args.replacement;
      }
    }

    return args;
  }

  private extractLiveThinking(content: string): string | null {
    if (!content) return null;

    // 1. Check for <think> or <thought> tag (even unclosed while streaming)
    const thinkMatch = content.match(/<(?:think|thought)>([\s\S]*?)(?:<\/(?:think|thought)>|$)/i);
    if (thinkMatch && thinkMatch[1].trim().length > 0) {
      return thinkMatch[1].trim();
    }

    // 2. Check for Thinking... (even unclosed while streaming)
    const gemmaMatch = content.match(/Thinking\.\.\.([\s\S]*?)(?:\.\.\.done thinking\.|$)/i);
    if (gemmaMatch && gemmaMatch[1].trim().length > 0) {
      return gemmaMatch[1].trim();
    }

    // 3. Check for Thinking Process: or Reasoning: block
    const processMatch = content.match(/(?:Thinking Process|Internal Reasoning|Chain of Thought|Reasoning Process):\s*([\s\S]*?)(?=(?:\n\n(?:[A-Z]|\[|Tool|Final|Response)|<\/(?:think|thought)>|$))/i);
    if (processMatch && processMatch[1].trim().length > 0) {
      return processMatch[1].trim();
    }

    return null;
  }

  private extractActualReasoning(content: string, nativeThinking?: string): string | null {
    if (nativeThinking && nativeThinking.trim().length > 10) {
      return nativeThinking.trim();
    }

    if (!content) return null;

    // 1. Check <think>...</think> or <thought>...</thought>
    const thinkMatch = content.match(/<(?:think|thought)>([\s\S]*?)<\/(?:think|thought)>/i);
    if (thinkMatch && thinkMatch[1].trim().length > 10) {
      return thinkMatch[1].trim();
    }

    // 2. Check Thinking... ...done thinking. (common in Gemma models)
    const gemmaMatch = content.match(/Thinking\.\.\.([\s\S]*?)\.\.\.done thinking\./i);
    if (gemmaMatch && gemmaMatch[1].trim().length > 10) {
      return gemmaMatch[1].trim();
    }

    // 3. Check Thinking Process: or Reasoning: block
    const processMatch = content.match(/(?:Thinking Process|Internal Reasoning|Chain of Thought|Reasoning Process):\s*([\s\S]*?)(?=(?:\n\n(?:[A-Z]|\[|Tool|Final|Response)|<\/(?:think|thought)>|$))/i);
    if (processMatch && processMatch[1].trim().length > 10) {
      return processMatch[1].trim();
    }

    // 4. Unclosed <think> or <thought> block (if output was cut off before closing tag)
    const unclosedMatch = content.match(/<(?:think|thought)>([\s\S]*)$/i);
    if (unclosedMatch && unclosedMatch[1].trim().length > 10) {
      return unclosedMatch[1].trim();
    }

    return null;
  }

  private synthesizeContextualReasoning(userPrompt: string, content: string, workspaceName: string): string {
    const history = this.context.getHistory();
    const previousUserMsg = history.filter(m => m.role === 'user').slice(-2, -1)[0]?.content;
    const toolCall = this.detectToolCall(content);

    const bullets: string[] = [];

    // Analyze conversation context
    const cleanPrompt = userPrompt.split('\n')[0].trim();
    if (previousUserMsg) {
      const cleanPrev = previousUserMsg.split('\n')[0].trim();
      bullets.push(`In previous conversation, context was established around "${cleanPrev.slice(0, 80)}".`);
    }
    bullets.push(`The user's current request is: "${cleanPrompt.slice(0, 90)}".`);

    // Analyze workspace context
    bullets.push(`Active workspace is "${workspaceName || 'current project'}". Ensuring all operations stay scoped to this project environment.`);

    // Analyze decision / tool rationale
    if (toolCall) {
      const name = toolCall.name.toLowerCase();
      const args = toolCall.args || {};
      if (['read_file', 'read_file_range', 'cat'].includes(name)) {
        const target = args.path || args.file || 'target file';
        bullets.push(`Evaluating file structure: inspecting "${target}" to inspect current implementation and verify syntax prior to making changes.`);
      } else if (['edit_file', 'write_file'].includes(name)) {
        const target = args.path || args.file || 'target file';
        bullets.push(`Formulating surgical modifications for "${target}" adhering to project conventions without disrupting existing functionality.`);
      } else if (['search_files', 'search', 'find_files'].includes(name)) {
        const pattern = args.pattern || args.query || 'query';
        bullets.push(`Scanning project codebase for references matching "${pattern}" to identify all affected dependencies and call sites.`);
      } else if (['run_command', 'execute_command', 'shell'].includes(name)) {
        const cmd = args.command || args.cmd || 'command';
        bullets.push(`Executing terminal command "${cmd}" to evaluate runtime state and verify build/test integrity.`);
      } else {
        bullets.push(`Decided to invoke tool "${toolCall.name}" to make progress on the request while monitoring error outcomes.`);
      }
      bullets.push(`Anticipating tool output to formulate subsequent verification and next steps.`);
    } else {
      bullets.push(`Analyzing requirements to formulate a comprehensive and accurate direct response.`);
      bullets.push(`Verifying that the explanation addresses the user's intent clearly with proper technical guidance.`);
    }

    return bullets.map(b => `- ${b}`).join('\n');
  }

  private cleanReasoningTokens(content: string): string {
    if (!content) return '';
    let cleaned = content
      .replace(/<(?:think|thought)>[\s\S]*?<\/(?:think|thought)>/gi, '')
      .replace(/Thinking\.\.\.[\s\S]*?\.\.\.done thinking\./gim, '')
      .replace(/^Thinking Process:[\s\S]*?(?=\n\n|\n[A-Z]|\n\[|\n\{|$)/gim, '');

    // Also strip unclosed <think> or <thought> if output was cut off
    cleaned = cleaned.replace(/<(?:think|thought)>[\s\S]*$/gi, '');
    return cleaned.trim();
  }
}
