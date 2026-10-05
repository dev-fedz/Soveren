import { Agent } from '../../src/agent/agent.ts';
import { OllamaProvider } from '../../src/llm/ollama.ts';
import { globalActivityTracker } from '../../src/agent/activityTracker.js';
import { getProjectStructure } from './fileSystem.js';
import { workspaceManager } from './workspace.js';
import { detectIntent } from './intent.js';
import fs from 'fs/promises';
import fsSync from 'fs';
import path from 'path';
import { toolRegistry } from '../../src/tools/registry.js';
import { initializeToolsAndSkills } from '../../src/tools/init.js';
import { WorkspaceContext } from '../../src/context/workspaceContext.js';
import { FormatterService } from '../../src/formatter/index.js';
import {
  SettingsManager,
  DEFAULT_SKILL_PROFILES,
  DEFAULT_SKILLS,
  DEFAULT_TOOLS,
  DEFAULT_PLUGINS,
  DEFAULT_CONNECTORS,
} from '../../src/config/settingsManager.js';
import { CredentialStore } from '../../src/config/credentialStore.js';
import { ModelCatalog } from '../../src/llm/models.js';
import { ProviderRegistry } from '../../src/llm/providerRegistry.js';
import { RuntimeStateManager } from '../../src/context/runtimeState.js';
import { ContextCompactor } from '../../src/context/compactor.js';
import { ProviderId, ToolPermissionLevel } from '../../src/config/types.js';
import { ShellTool } from '../../src/tools/shell.js';
import { PermissionManager } from '../../src/permissions/manager.js';
import { serviceManager } from './serviceManager.js';
import { createDevProxyRouter, createAssetFallbackProxy, handleWebSocketUpgrade } from './devProxy.js';
import { globalWorkspaceState, FileTypeRegistry } from '../../src/workspace/workspaceState.js';
import { agentPermissionManager } from '../../src/permissions/agentPermissionManager.js';
import { artifactManager } from '../../src/artifacts/artifactManager.js';
import { browserAutomationEngine } from '../../src/browser/browserAutomation.js';
import { DocumentService } from '../../src/documents/documentService.js';
import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import dotenv from 'dotenv';
import os from 'os';
import { exec } from 'child_process';
import { promisify } from 'util';

const execPromise = promisify(exec);

dotenv.config();


const app = express();
app.use(cors());
app.use(express.json());

const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

// Broadcast real-time activity events across all connected clients
globalActivityTracker.on('session_update', (session) => {
  io.emit('agent_session', session);
});
globalActivityTracker.on('activity_start', (activity) => {
  io.emit('agent_activity', activity);
});
globalActivityTracker.on('activity_update', (activity) => {
  io.emit('agent_activity', activity);
});
globalActivityTracker.on('activity_complete', (activity) => {
  io.emit('agent_activity', activity);
});
globalActivityTracker.on('activity_fail', (activity) => {
  io.emit('agent_activity', activity);
});
globalActivityTracker.on('file_changes', (changedFiles) => {
  io.emit('agent_file_changes', changedFiles);
});

// Broadcast workspace state & navigation events
globalWorkspaceState.on('state_change', (state) => {
  io.emit('agent_workspace_state', state);
});
globalWorkspaceState.on('action', (action) => {
  io.emit('agent_workspace_action', action);
});
globalWorkspaceState.on('file_created', () => {
  io.emit('explorer_refresh');
});

// Human-in-the-loop Permission Events
agentPermissionManager.on('permission_requested', (req) => {
  io.emit('agent_permission_request', req);
});
agentPermissionManager.on('permission_resolved', (resp) => {
  io.emit('agent_permission_resolved', resp);
});
agentPermissionManager.on('permission_cancelled', (resp) => {
  io.emit('agent_permission_cancelled', resp);
});

// Artifact Events
artifactManager.on('artifact_created', (artifact) => {
  io.emit('agent_artifact_created', artifact);
});

// Browser Automation & Inspect Telemetry Events
browserAutomationEngine.on('console', (msg) => {
  io.emit('browser_inspect_console', msg);
});
browserAutomationEngine.on('network', (req) => {
  io.emit('browser_inspect_network', req);
});
browserAutomationEngine.on('navigated', (data) => {
  io.emit('browser_inspect_navigated', data);
});
browserAutomationEngine.on('test_started', (data) => {
  io.emit('browser_test_started', data);
});
browserAutomationEngine.on('test_completed', (data) => {
  io.emit('browser_test_completed', data);
});
browserAutomationEngine.on('action', (act) => {
  io.emit('browser_action', act);
});

const provider = new OllamaProvider();
const agent = new Agent(provider);
agent.isInteractive = false; // Headless / server mode: auto-approves safe commands and never hangs on stdin

// Enable headless mode for permission manager so ASK-level commands auto-approve
PermissionManager.setHeadlessMode(true);

// Top-level initialization: register all tools, formatters, and skills
await initializeToolsAndSkills();

// Workspace initialized in clean state - user must open a project from the local machine.
// Reading the agent's root project (/app) is prohibited to prevent confusion.
console.log('[Server Startup] Workspace initialized. Ready for user to open a project from local machine.');

try {
  const globalCfg = await SettingsManager.getGlobalConfig();
  if (globalCfg?.activeModel) {
    const startupProvider = await ProviderRegistry.createProviderForModel(globalCfg.activeModel);
    agent.setProvider(startupProvider);
    console.log(`[Server Startup] Initialized active provider for model: ${globalCfg.activeModel}`);
  }
} catch (err) {
  console.warn('[Server Startup] Could not load active model from settings, using default Ollama provider:', err);
}

// --- SERVICE DISCOVERY & BROWSER INTEGRATION ---

// Initialize service manager with the active workspace
if (workspaceManager.isActive() && workspaceManager.getState().path) {
  serviceManager.setWorkspace(workspaceManager.getState().path);
}

// Forward service lifecycle events to all connected clients via Socket.IO
serviceManager.on('service_event', (event: any) => {
  io.emit('browser_service', event);
});
serviceManager.on('services_updated', (services: any[]) => {
  io.emit('browser_services_list', services);
});

// Start monitoring
serviceManager.startMonitoring();

// Connect agent service resolver to dynamic service manager
agent.setServiceResolver(async () => {
  const current = serviceManager.getServices();
  if (current.length > 0) return current;
  try {
    return await serviceManager.discoverServices();
  } catch {
    return current;
  }
});

// Listen to terminal command outputs for instant service discovery
ShellTool.addOutputListener((output, command, pid) => {
  serviceManager.reportServiceFromOutput(output, command, pid);
});

// --- IN-MEMORY CHAT CACHE PER WORKSPACE ---
export interface CachedMessage {
  role: 'user' | 'agent' | 'system';
  content: string;
  type?: 'step' | 'response' | 'error';
  timestamp?: number;
  activities?: any[];
  changedFiles?: any[];
}

const chatMemoryCache = new Map<string, CachedMessage[]>();
chatMemoryCache.set('__global__', []);

export function getChatHistory(workspaceKey?: string | null): CachedMessage[] {
  const key = (!workspaceKey || workspaceKey === '__global__' || workspaceKey === 'global') ? '__global__' : workspaceKey;
  return chatMemoryCache.get(key) || [];
}

export function appendChatMessage(message: CachedMessage, workspaceKey?: string | null) {
  const key = (!workspaceKey || workspaceKey === '__global__' || workspaceKey === 'global') ? '__global__' : workspaceKey;
  if (!chatMemoryCache.has(key)) {
    chatMemoryCache.set(key, []);
  }
  chatMemoryCache.get(key)!.push({
    ...message,
    timestamp: message.timestamp || Date.now(),
  });
}

// --- WORKSPACE ENDPOINTS ---

function toContainerPath(rawPath?: string | null): string {
  if (!rawPath) return '';
  let p = rawPath.trim();
  const isDocker = fsSync.existsSync('/.dockerenv') || !!process.env.DOCKER;
  const hostHome = process.env.HOST_HOME ? process.env.HOST_HOME.replace(/\\/g, '/').replace(/\/$/, '') : null;

  // Normalize backslashes (Windows)
  p = p.replace(/\\/g, '/');

  if (isDocker) {
    // 1. Tilde expansion inside Docker container: ~ maps to /host
    if (p === '~') {
      return '/host';
    }
    if (p.startsWith('~/')) {
      return path.posix.join('/host', p.slice(2));
    }

    // 2. Host home path expansion inside container (e.g., /Users/<username>/Desktop -> /host/Desktop)
    if (hostHome && p.startsWith(hostHome)) {
      const sub = p.slice(hostHome.length);
      return path.posix.join('/host', sub);
    }
    if (hostHome && p.toLowerCase().startsWith(hostHome.toLowerCase())) {
      const sub = p.slice(hostHome.length);
      return path.posix.join('/host', sub);
    }

    return p;
  } else {
    // Native host mode
    if (p === '~') {
      return os.homedir();
    }
    if (p.startsWith('~/')) {
      return path.join(os.homedir(), p.slice(2));
    }
    return path.resolve(p);
  }
}

app.get('/workspace', (req, res) => {
  res.json(workspaceManager.getState());
});

app.post('/workspace/select', async (req, res) => {
  try {
    const { path: dirPath } = req.body;
    if (!dirPath) {
      return res.status(400).json({ error: 'Path is required' });
    }
    const resolvedPath = toContainerPath(dirPath);
    const state = await workspaceManager.select(resolvedPath);
    if (state.path) {
      agent.setWorkspace(state.path);
      serviceManager.setWorkspace(state.path);
    }
    res.json(state);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

app.post('/workspace/create', async (req, res) => {
  try {
    const { parentDir, projectName } = req.body;
    if (!parentDir || !projectName) {
      return res.status(400).json({ error: 'parentDir and projectName are required' });
    }
    const resolvedParent = toContainerPath(parentDir);
    const state = await workspaceManager.create(resolvedParent, projectName);
    if (state.initialized && state.path) {
      agent.setWorkspace(state.path);
      serviceManager.setWorkspace(state.path);
    }
    res.json(state);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

app.post('/workspace/clear', (req, res) => {
  const state = workspaceManager.clear();
  agent.setWorkspace('__global__');
  serviceManager.setWorkspace(null);
  const emptySession = globalActivityTracker.resetSession('Task Workflow', '__global__');
  io.emit('agent_session', emptySession);
  res.json(state);
});

// --- CHAT HISTORY ENDPOINTS ---

app.get('/workspace/chat-history', (req, res) => {
  const workspaceParam = req.query.workspace as string | undefined;
  let key: string;
  if (workspaceParam !== undefined) {
    key = (!workspaceParam || workspaceParam === '__global__' || workspaceParam === 'global') ? '__global__' : workspaceParam;
  } else {
    key = workspaceManager.isActive() ? (workspaceManager.getState().path || '__global__') : '__global__';
  }
  const messages = getChatHistory(key);
  res.json({ workspace: key, messages });
});

app.post('/workspace/chat-history', (req, res) => {
  const { workspace, messages } = req.body;
  const key = (!workspace || workspace === '__global__' || workspace === 'global') ? '__global__' : workspace;
  if (Array.isArray(messages)) {
    chatMemoryCache.set(key, messages);
  }
  res.json({ status: 'ok', count: (chatMemoryCache.get(key) || []).length });
});

// --- TASK HISTORY ENDPOINTS ---

export interface SavedTask {
  id: string;
  title: string;
  timestamp: number;
  messages: CachedMessage[];
  workspace: string;
}

const tasksCache = new Map<string, SavedTask[]>();
const tasksFile = path.join(
  fsSync.existsSync('/host') ? '/host' : os.homedir(),
  '.ai-native-editor',
  'tasks.json'
);

async function loadPersistedTasks() {
  try {
    const raw = await fs.readFile(tasksFile, 'utf-8');
    const data = JSON.parse(raw);
    if (data && typeof data === 'object') {
      for (const [key, list] of Object.entries(data)) {
        if (Array.isArray(list)) {
          tasksCache.set(key, list as SavedTask[]);
        }
      }
    }
  } catch { /* file may not exist yet */ }
}
loadPersistedTasks();

async function savePersistedTasks() {
  try {
    const dir = path.dirname(tasksFile);
    await fs.mkdir(dir, { recursive: true });
    const obj: Record<string, SavedTask[]> = {};
    for (const [k, v] of tasksCache.entries()) {
      obj[k] = v;
    }
    await fs.writeFile(tasksFile, JSON.stringify(obj, null, 2), 'utf-8');
  } catch (e) {
    console.error('Failed to save tasks.json:', e);
  }
}

app.get('/workspace/tasks', (req, res) => {
  const workspaceParam = req.query.workspace as string | undefined;
  const key = (!workspaceParam || workspaceParam === '__global__' || workspaceParam === 'global') ? '__global__' : workspaceParam;
  const tasks = tasksCache.get(key) || [];
  res.json({ workspace: key, tasks });
});

app.post('/workspace/tasks', async (req, res) => {
  try {
    const { workspace, task } = req.body;
    const key = (!workspace || workspace === '__global__' || workspace === 'global') ? '__global__' : workspace;
    if (task && task.id) {
      const list = tasksCache.get(key) || [];
      const filtered = list.filter(t => t.id !== task.id);
      const updated = [task, ...filtered].slice(0, 50);
      tasksCache.set(key, updated);
      await savePersistedTasks();
    }
    res.json({ status: 'ok', count: (tasksCache.get(key) || []).length });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/workspace/tasks/:id', async (req, res) => {
  try {
    const taskId = req.params.id;
    const workspaceParam = req.query.workspace as string | undefined;
    const key = (!workspaceParam || workspaceParam === '__global__' || workspaceParam === 'global') ? '__global__' : workspaceParam;
    const list = tasksCache.get(key) || [];
    const updated = list.filter(t => t.id !== taskId);
    tasksCache.set(key, updated);
    await savePersistedTasks();
    res.json({ status: 'ok', count: updated.length });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

async function dirExists(p?: string | null): Promise<boolean> {
  if (!p) return false;
  try {
    const s = await fs.stat(p);
    return s.isDirectory();
  } catch {
    return false;
  }
}

app.post('/workspace/pick-native', async (req, res) => {
  try {
    const isDocker = fsSync.existsSync('/.dockerenv') || !!process.env.DOCKER;
    if (isDocker) {
      return res.json({
        cancelled: true,
        path: null,
        isDocker: true,
        message: 'Native system file dialog is not accessible from inside Docker. Please browse your local machine folders below.',
      });
    }

    const { prompt } = req.body || {};
    const title = prompt || 'Select Project Directory';
    const platform = process.platform;
    let selected: string | null = null;

    if (platform === 'darwin') {
      const script = `POSIX path of (choose folder with prompt "${title.replace(/"/g, '\\"')}")`;
      const { stdout } = await execPromise(`osascript -e '${script}'`);
      selected = stdout.trim().replace(/\/$/, '');
    } else if (platform === 'win32') {
      const script = `Add-Type -AssemblyName System.Windows.Forms; $f = New-Object System.Windows.Forms.FolderBrowserDialog; $f.Description = "${title}"; if ($f.ShowDialog() -eq 'OK') { $f.SelectedPath }`;
      const { stdout } = await execPromise(`powershell -NoProfile -Command "${script}"`);
      selected = stdout.trim();
    } else {
      const { stdout } = await execPromise(`zenity --file-selection --directory --title="${title}" 2>/dev/null || kdialog --getexistingdirectory . 2>/dev/null`);
      selected = stdout.trim();
    }

    if (!selected) {
      return res.json({ cancelled: true, path: null });
    }

    res.json({ cancelled: false, path: selected });
  } catch {
    // User cancelled the dialog or closed without selecting
    res.json({ cancelled: true, path: null });
  }
});

app.get('/workspace/recent', async (req, res) => {
  try {
    const recent = await workspaceManager.getRecentWorkspaces();
    res.json({ recent });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/workspace/recent', async (req, res) => {
  try {
    const { path: wsPath } = req.body;
    if (!wsPath) {
      return res.status(400).json({ error: 'path is required' });
    }
    const resolvedPath = toContainerPath(wsPath);
    const recent = await workspaceManager.addRecentWorkspace(resolvedPath);
    res.json({ recent });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/workspace/recent', async (req, res) => {
  try {
    const wsPath = (req.body?.path || req.query?.path) as string;
    if (!wsPath) {
      return res.status(400).json({ error: 'path is required' });
    }
    const resolvedPath = toContainerPath(wsPath);
    await workspaceManager.removeRecentWorkspace(resolvedPath);
    if (resolvedPath !== wsPath) {
      await workspaceManager.removeRecentWorkspace(wsPath);
    }
    const recent = await workspaceManager.getRecentWorkspaces();
    res.json({ success: true, recent });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/workspace/browse', async (req, res) => {
  try {
    const isDocker = fsSync.existsSync('/.dockerenv') || !!process.env.DOCKER;
    const requestedDir = req.query.dir as string;
    const hostRoot = isDocker ? '/host' : os.homedir();

    // Resolve target directory with intelligent defaults and path translation
    let resolved: string;
    if (requestedDir) {
      const translated = toContainerPath(requestedDir);
      resolved = path.resolve(translated);

      // SECURITY & WORKSPACE BOUNDARY: Never allow browsing into container root (/) or the agent app repo (/app)
      if (isDocker) {
        if (resolved === '/' || resolved === '/app' || !resolved.startsWith('/host') || WorkspaceContext.isAgentRoot(resolved)) {
          resolved = hostRoot;
        }
      } else if (WorkspaceContext.isAgentRoot(resolved)) {
        resolved = hostRoot;
      }
    } else {
      // Default directory when none provided: ALWAYS default to Local Machine (/host in Docker, homedir outside)
      const currentWs = workspaceManager.isActive() ? workspaceManager.getState().path : null;
      if (currentWs && (await dirExists(currentWs)) && (!isDocker || currentWs.startsWith('/host'))) {
        resolved = currentWs;
      } else {
        resolved = hostRoot;
      }
    }

    // Verify if directory actually exists; if not, fall back gracefully to hostRoot
    if (!await dirExists(resolved)) {
      if (await dirExists(hostRoot)) {
        resolved = hostRoot;
      } else {
        return res.status(404).json({ error: `Directory not found: ${requestedDir}` });
      }
    }

    const entries = await fs.readdir(resolved, { withFileTypes: true });

    const directories = [];
    for (const entry of entries) {
      let isDir = false;
      try {
        isDir = entry.isDirectory();
      } catch {
        continue;
      }
      if (!isDir) continue;
      if (entry.name.startsWith('.')) continue;
      // Filter out system, temp, and agent root directories
      if (['node_modules', 'Library', 'Applications', 'System', 'tmp', '.Trash', 'boot', 'dev', 'etc', 'proc', 'sys', 'run', 'var', 'bin', 'sbin', 'lib', 'app'].includes(entry.name)) continue;
      const entryPath = path.join(resolved, entry.name);
      if (WorkspaceContext.isAgentRoot(entryPath)) continue;

      directories.push({
        name: entry.name,
        path: entryPath,
      });
    }

    directories.sort((a, b) => a.name.localeCompare(b.name));

    // When at host root (/host in Docker, or homedir on native), do not allow going up to container root
    const isAtRoot = (isDocker && resolved === '/host') || (!isDocker && resolved === os.homedir());
    const parentDir = isAtRoot ? null : path.dirname(resolved);

    // Only show "Local Machine" shortcut - static shortcuts (desktop, projects, documents) removed as requested
    const shortcuts: { label: string; path: string; icon: string }[] = [
      { label: 'Local Machine', path: hostRoot, icon: 'home' }
    ];

    const recentWorkspaces = await workspaceManager.getRecentWorkspaces();

    res.json({
      current: resolved,
      parent: parentDir,
      home: hostRoot,
      directories,
      shortcuts,
      recentWorkspaces,
      isDocker,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// --- FILE SYSTEM ENDPOINTS ---

app.get('/files', async (req, res) => {
  try {
    const workspace = workspaceManager.getState();
    if (!workspace.path || !workspace.initialized) {
      // No workspace active — return explicit empty state
      return res.json({ status: 'no_workspace', data: null });
    }

    const structure = await getProjectStructure(workspace.path);
    res.json({ status: 'ok', data: structure });
  } catch (error: any) {
    res.status(500).json({ status: 'error', error: error.message });
  }
});

app.get('/file-content', async (req, res) => {
  try {
    const filePath = req.query.path as string;
    if (!filePath) throw new Error('Path is required');

    const workspace = workspaceManager.getState();
    let absolutePath: string;

    if (workspace.path) {
      absolutePath = path.resolve(workspace.path, filePath);
      // Security: ensure path is within workspace
      if (!absolutePath.startsWith(workspace.path)) {
        return res.status(403).json({ error: 'Access denied: path outside workspace' });
      }
    } else {
      // If the filePath is already absolute and we have no workspace, allow it cautiously
      absolutePath = path.resolve(filePath);
    }

    const content = await fs.readFile(absolutePath, 'utf8');
    res.json({ content });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// --- WORKSPACE STATE & ACTION ENDPOINTS ---
app.get('/workspace/state', (req, res) => {
  res.json(globalWorkspaceState.getState());
});

app.post('/workspace/action', (req, res) => {
  const action = req.body;
  if (!action || !action.type) {
    return res.status(400).json({ error: 'Valid action object with type is required' });
  }
  const updated = globalWorkspaceState.dispatchAction(action);
  res.json(updated);
});

// --- IMAGES VIEWER ENDPOINT ---
app.get('/images/view', async (req, res) => {
  try {
    const imgPath = req.query.path as string;
    if (!imgPath) return res.status(400).send('Path required');

    const absPath = WorkspaceContext.resolvePath(imgPath);
    if (!fsSync.existsSync(absPath)) {
      return res.status(404).send('Image not found');
    }

    const ext = path.extname(imgPath).toLowerCase().replace(/^\./, '');
    const mimeMap: Record<string, string> = {
      png: 'image/png',
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
      gif: 'image/gif',
      webp: 'image/webp',
      svg: 'image/svg+xml',
      bmp: 'image/bmp',
      ico: 'image/x-icon',
    };

    const contentType = mimeMap[ext] || 'application/octet-stream';
    res.setHeader('Content-Type', contentType);
    const data = await fs.readFile(absPath);
    res.send(data);
  } catch (err: any) {
    res.status(500).send(err.message);
  }
});

// --- DOCUMENTS ENDPOINTS ---
app.get('/documents/read', async (req, res) => {
  try {
    const docPath = req.query.path as string;
    if (!docPath) return res.status(400).json({ error: 'Path is required' });
    const page = req.query.page ? parseInt(req.query.page as string, 10) : 1;
    const query = req.query.query as string | undefined;

    const result = await DocumentService.readDocument(docPath, { page, query });
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/documents/search', async (req, res) => {
  try {
    const docPath = req.query.path as string;
    const query = req.query.query as string;
    if (!docPath || !query) return res.status(400).json({ error: 'Path and query are required' });

    const result = await DocumentService.searchDocument(docPath, query);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/documents/structure', async (req, res) => {
  try {
    const docPath = req.query.path as string;
    if (!docPath) return res.status(400).json({ error: 'Path is required' });

    const result = await DocumentService.getDocumentStructure(docPath);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// --- ARTIFACTS ENDPOINTS ---
app.get('/artifacts', (req, res) => {
  const taskId = req.query.taskId as string | undefined;
  const type = req.query.type as any;
  if (taskId) {
    return res.json(artifactManager.getArtifactsForTask(taskId));
  }
  if (type) {
    return res.json(artifactManager.getArtifactsByType(type));
  }
  res.json(artifactManager.getAllArtifacts());
});

app.get('/artifacts/:id', (req, res) => {
  const artifact = artifactManager.getArtifact(req.params.id);
  if (!artifact) return res.status(404).json({ error: 'Artifact not found' });
  res.json(artifact);
});

app.get('/artifacts/:id/content', async (req, res) => {
  const artifact = artifactManager.getArtifact(req.params.id);
  if (!artifact) return res.status(404).send('Artifact not found');

  if (artifact.path && fsSync.existsSync(artifact.path)) {
    const ext = path.extname(artifact.path).toLowerCase().replace(/^\./, '');
    if (ext === 'svg') res.setHeader('Content-Type', 'image/svg+xml');
    else if (ext === 'png') res.setHeader('Content-Type', 'image/png');
    else if (ext === 'json') res.setHeader('Content-Type', 'application/json');
    else res.setHeader('Content-Type', 'text/plain');

    const content = await fs.readFile(artifact.path);
    return res.send(content);
  }

  if (artifact.content) {
    res.setHeader('Content-Type', 'text/plain');
    return res.send(artifact.content);
  }

  res.status(404).send('No content available for artifact');
});

// --- INSPECT TELEMETRY & STATE ENDPOINTS ---
app.get('/inspect/state', (req, res) => {
  res.json({
    dom: browserAutomationEngine.inspectDOM(),
    console: browserAutomationEngine.inspectConsole(),
    network: browserAutomationEngine.inspectNetwork(),
    performance: browserAutomationEngine.inspectPerformance(),
    memory: browserAutomationEngine.inspectMemory(),
    security: browserAutomationEngine.inspectSecurity(),
    storage: browserAutomationEngine.inspectStorage(),
  });
});

app.post('/browser/telemetry', (req, res) => {
  const { type, data } = req.body;
  if (type === 'console' && data) {
    browserAutomationEngine.recordConsoleMessage(data);
  } else if (type === 'network' && data) {
    browserAutomationEngine.recordNetworkRequest(data);
  }
  res.json({ status: 'ok' });
});

// --- HUMAN-IN-THE-LOOP PERMISSION ENDPOINTS ---
app.get('/agent/permission/pending', (req, res) => {
  res.json(agentPermissionManager.getPendingRequests());
});

app.post('/agent/permission/respond', (req, res) => {
  const { requestId, approved, values, reason } = req.body;
  if (!requestId) return res.status(400).json({ error: 'requestId is required' });

  const handled = agentPermissionManager.respond(requestId, !!approved, values, reason);
  res.json({ success: handled });
});

// --- INTENT ENDPOINT ---

app.post('/intent', (req, res) => {
  const { message, history } = req.body;
  if (!message) {
    return res.status(400).json({ error: 'message is required' });
  }
  const result = detectIntent(
    message,
    workspaceManager.isActive(),
    history || [],
  );
  res.json(result);
});

// --- FORMATTER ENDPOINTS ---

app.get('/formatters', async (req, res) => {
  try {
    const list = await FormatterService.getInstalledStatus();
    res.json({ formatters: list });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/format/config', (req, res) => {
  res.json(FormatterService.getConfig());
});

app.post('/format/config', (req, res) => {
  try {
    const updated = FormatterService.updateConfig(req.body || {});
    res.json(updated);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

app.post('/format', async (req, res) => {
  try {
    const { code, filePath, language, workspacePath } = req.body;
    if (typeof code !== 'string') {
      return res.status(400).json({ error: 'code must be a string' });
    }
    const targetWorkspace = workspacePath || (workspaceManager.isActive() ? workspaceManager.getState().path : null);
    const result = await FormatterService.format({
      code,
      filePath,
      language,
      workspacePath: targetWorkspace,
    });
    res.json(result);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// --- AI CONTROL CENTER & RUNTIME SETTINGS ENDPOINTS ---

app.get('/ai/runtime-config', async (req, res) => {
  try {
    const wsParam = req.query.workspace as string | undefined;
    const workspaceKey = wsParam !== undefined ? wsParam : (workspaceManager.isActive() ? workspaceManager.getState().path : null);
    const config = await SettingsManager.getResolvedConfig(workspaceKey);
    res.json(config);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/ai/runtime-config', async (req, res) => {
  try {
    const updated = await SettingsManager.updateGlobalConfig(req.body);
    res.json(updated);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

app.get('/ai/models', async (req, res) => {
  try {
    const all = await ModelCatalog.getAllModels();
    const config = await SettingsManager.getGlobalConfig();
    const includeAll = req.query.all === 'true';
    const models = includeAll
      ? all
      : all.filter(m => m.status === 'ready' || m.status === 'connected');

    let activeModel = config.activeModel;
    if (models.length > 0 && !models.some(m => m.id === activeModel || m.id.replace(/^ollama-/, '') === activeModel?.replace(/^ollama-/, ''))) {
      const gemmaModel = models.find(m => m.id.includes('gemma4'));
      activeModel = gemmaModel ? gemmaModel.id : models[0].id;
    }

    res.json({
      activeModel,
      models,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/ai/models/select', async (req, res) => {
  try {
    const { modelId, workspace } = req.body;
    if (!modelId) {
      return res.status(400).json({ error: 'modelId is required' });
    }

    const config = await SettingsManager.getGlobalConfig();
    const prevModel = config.activeModel;

    // 1. Create provider instance for this model
    const newProvider = await ProviderRegistry.createProviderForModel(modelId);
    agent.setProvider(newProvider);

    // 2. Update activeModel in settings
    await SettingsManager.updateGlobalConfig({ activeModel: modelId });

    // 3. Section 11 & 28: Zero-Loss Model Switch with Context Preservation
    const workspaceKey = workspace || (workspaceManager.isActive() ? (workspaceManager.getState().path || '__global__') : '__global__');
    const rawMessages = getChatHistory(workspaceKey);
    const converted = rawMessages.map(m => ({
      role: (m.role === 'agent' ? 'assistant' : m.role === 'user' ? 'user' : 'system') as any,
      content: m.content,
    }));

    const switchResult = await RuntimeStateManager.switchModel(modelId, prevModel, converted, workspaceKey);

    // If context was compacted, update active in-memory cache and agent history
    if (switchResult.compacted) {
      const updatedCached: CachedMessage[] = switchResult.messages.map(m => ({
        role: m.role === 'assistant' ? 'agent' : m.role === 'user' ? 'user' : 'system',
        content: m.content,
      }));
      chatMemoryCache.set(workspaceKey, updatedCached);
      agent.setWorkspaceHistory(switchResult.messages, workspaceKey);
    }

    res.json({
      success: true,
      activeModel: modelId,
      previousModel: prevModel,
      compacted: switchResult.compacted,
      tokensBefore: switchResult.tokensBefore,
      tokensAfter: switchResult.tokensAfter,
      taskState: switchResult.taskState,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/ai/models/test-connection', async (req, res) => {
  try {
    const { providerId, apiKey, endpoint } = req.body;
    if (!providerId) {
      return res.status(400).json({ error: 'providerId is required' });
    }
    const result = await ProviderRegistry.testConnection(providerId as ProviderId, apiKey, endpoint);
    res.json(result);
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.get('/ai/credentials', async (req, res) => {
  try {
    const masked = await CredentialStore.getAllMasked();
    res.json(masked);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/ai/credentials', async (req, res) => {
  try {
    const { providerId, apiKey } = req.body;
    if (!providerId) {
      return res.status(400).json({ error: 'providerId is required' });
    }
    await CredentialStore.setApiKey(providerId as ProviderId, apiKey || '');
    const masked = CredentialStore.maskKey(apiKey);

    try {
      const config = await SettingsManager.getGlobalConfig();
      const updatedProvider = await ProviderRegistry.createProviderForModel(config.activeModel);
      agent.setProvider(updatedProvider);
      console.log(`[Credentials Updated] Successfully updated active agent provider for ${config.activeModel}`);
    } catch (pErr: any) {
      console.warn('[Credentials Updated] Could not update active provider immediately:', pErr?.message || pErr);
    }

    res.json({ success: true, providerId, masked });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/ai/credentials/:provider', async (req, res) => {
  try {
    const providerId = req.params.provider as ProviderId;
    await CredentialStore.deleteApiKey(providerId);

    try {
      const config = await SettingsManager.getGlobalConfig();
      const updatedProvider = await ProviderRegistry.createProviderForModel(config.activeModel);
      agent.setProvider(updatedProvider);
    } catch {}

    res.json({ success: true, providerId });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/ai/context-usage', async (req, res) => {
  try {
    const wsParam = req.query.workspace as string | undefined;
    const workspaceKey = wsParam !== undefined ? wsParam : (workspaceManager.isActive() ? (workspaceManager.getState().path || '__global__') : '__global__');
    const rawMessages = getChatHistory(workspaceKey);
    const converted = rawMessages.map(m => ({
      role: (m.role === 'agent' ? 'assistant' : m.role === 'user' ? 'user' : 'system') as any,
      content: m.content,
    }));

    const config = await SettingsManager.getGlobalConfig();
    const usage = await RuntimeStateManager.getUsageInfo(config.activeModel, converted, workspaceKey);
    res.json(usage);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/ai/context/compact', async (req, res) => {
  try {
    const { workspace } = req.body;
    const workspaceKey = workspace || (workspaceManager.isActive() ? (workspaceManager.getState().path || '__global__') : '__global__');
    const rawMessages = getChatHistory(workspaceKey);
    const converted = rawMessages.map(m => ({
      role: (m.role === 'agent' ? 'assistant' : m.role === 'user' ? 'user' : 'system') as any,
      content: m.content,
    }));

    const existingState = RuntimeStateManager.getTaskState(workspaceKey);
    const compaction = ContextCompactor.compact(converted, workspaceKey, existingState);

    // Save task state and update history
    RuntimeStateManager.setTaskState(workspaceKey, compaction.taskState);
    const updatedCached: CachedMessage[] = compaction.messages.map(m => ({
      role: m.role === 'assistant' ? 'agent' : m.role === 'user' ? 'user' : 'system',
      content: m.content,
    }));

    chatMemoryCache.set(workspaceKey, updatedCached);
    agent.setWorkspaceHistory(compaction.messages, workspaceKey);

    res.json({
      success: true,
      originalTokens: compaction.tokensBefore,
      compactedTokens: compaction.tokensAfter,
      originalCount: compaction.originalMessageCount,
      compactedCount: compaction.compactedMessageCount,
      summary: compaction.summaryText,
      taskState: compaction.taskState,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/ai/skills', async (req, res) => {
  try {
    const config = await SettingsManager.getGlobalConfig();
    res.json({
      skills: DEFAULT_SKILLS,
      profiles: DEFAULT_SKILL_PROFILES,
      enabled: config.skills.enabled,
      activeProfile: config.skills.activeProfile,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/ai/skills/toggle', async (req, res) => {
  try {
    const { skillId, enabled } = req.body;
    const config = await SettingsManager.getGlobalConfig();
    let currentEnabled = new Set(config.skills.enabled);
    if (enabled) {
      currentEnabled.add(skillId);
    } else {
      currentEnabled.delete(skillId);
    }
    const updated = await SettingsManager.updateGlobalConfig({
      skills: { ...config.skills, enabled: Array.from(currentEnabled) },
    });
    res.json(updated.skills);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

app.post('/ai/skills/profile', async (req, res) => {
  try {
    const { profileId } = req.body;
    const profile = DEFAULT_SKILL_PROFILES.find(p => p.id === profileId);
    if (!profile) {
      return res.status(404).json({ error: 'Profile not found' });
    }
    const config = await SettingsManager.getGlobalConfig();
    const updated = await SettingsManager.updateGlobalConfig({
      skills: {
        enabled: [...profile.skills],
        activeProfile: profile.id,
      },
    });
    res.json(updated.skills);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

app.get('/ai/tools', async (req, res) => {
  try {
    const config = await SettingsManager.getGlobalConfig();
    res.json({
      tools: DEFAULT_TOOLS,
      enabled: config.tools.enabled,
      permissions: config.tools.permissions,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/ai/tools/permission', async (req, res) => {
  try {
    const { toolId, permission } = req.body;
    const config = await SettingsManager.getGlobalConfig();
    const updatedPermissions = {
      ...config.tools.permissions,
      [toolId]: permission as ToolPermissionLevel,
    };
    const updated = await SettingsManager.updateGlobalConfig({
      tools: { ...config.tools, permissions: updatedPermissions },
    });
    res.json(updated.tools);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

app.post('/ai/tools/toggle', async (req, res) => {
  try {
    const { toolId, enabled } = req.body;
    const config = await SettingsManager.getGlobalConfig();
    const currentEnabled = new Set(config.tools.enabled);
    if (enabled) {
      currentEnabled.add(toolId);
    } else {
      currentEnabled.delete(toolId);
    }
    const updated = await SettingsManager.updateGlobalConfig({
      tools: { ...config.tools, enabled: Array.from(currentEnabled) },
    });
    res.json(updated.tools);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

app.get('/ai/plugins', async (req, res) => {
  try {
    const config = await SettingsManager.getGlobalConfig();
    res.json({
      plugins: DEFAULT_PLUGINS,
      enabled: config.plugins.enabled,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/ai/plugins/toggle', async (req, res) => {
  try {
    const { pluginId, enabled } = req.body;
    const config = await SettingsManager.getGlobalConfig();
    const current = new Set(config.plugins.enabled);
    if (enabled) {
      current.add(pluginId);
    } else {
      current.delete(pluginId);
    }
    const updated = await SettingsManager.updateGlobalConfig({
      plugins: { enabled: Array.from(current) },
    });
    res.json(updated.plugins);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

app.get('/ai/connectors', async (req, res) => {
  try {
    const config = await SettingsManager.getGlobalConfig();
    res.json({
      connectors: DEFAULT_CONNECTORS,
      enabled: config.connectors.enabled,
      permissions: config.connectors.permissions,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/ai/connectors/toggle', async (req, res) => {
  try {
    const { connectorId, enabled } = req.body;
    const config = await SettingsManager.getGlobalConfig();
    const current = new Set(config.connectors.enabled);
    if (enabled) {
      current.add(connectorId);
    } else {
      current.delete(connectorId);
    }
    const updated = await SettingsManager.updateGlobalConfig({
      connectors: { ...config.connectors, enabled: Array.from(current) },
    });
    res.json(updated.connectors);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

app.get('/ai/export', async (req, res) => {
  try {
    const jsonString = await SettingsManager.exportConfig();
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', 'attachment; filename="ai-settings.json"');
    res.send(jsonString);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/ai/import', async (req, res) => {
  try {
    const configData = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
    const imported = await SettingsManager.importConfig(configData);
    res.json({ success: true, config: imported });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

app.post('/ai/reset', async (req, res) => {
  try {
    const { category } = req.body;
    const resetResult = await SettingsManager.resetCategory(category || 'all');
    res.json({ success: true, config: resetResult });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

// --- AGENT WORKFLOW & CHANGE APPROVAL ENDPOINTS (Sections 30-62) ---

app.get('/ai/agent/session', (req, res) => {
  const wsParam = req.query.workspace as string | undefined;
  const session = globalActivityTracker.getSession();
  if (wsParam !== undefined) {
    const requestedKey = (!wsParam || wsParam === '__global__' || wsParam === 'global') ? '__global__' : wsParam;
    const sessionKey = session.workspace || '__global__';
    if (requestedKey !== sessionKey) {
      return res.json(null);
    }
  }
  res.json(session);
});

app.post('/ai/agent/reset', (req, res) => {
  const { workspace: ws } = req.body || {};
  const targetWs = ws || (workspaceManager.isActive() ? (workspaceManager.getState().path || '__global__') : '__global__');
  const emptySession = globalActivityTracker.resetSession('Task Workflow', targetWs);
  io.emit('agent_session', emptySession);
  res.json({ status: 'ok', session: emptySession });
});

app.post('/ai/agent/new-session', (req, res) => {
  const { workspace: ws } = req.body || {};
  const targetWs = ws || (workspaceManager.isActive() ? (workspaceManager.getState().path || '__global__') : '__global__');
  const emptySession = globalActivityTracker.resetSession('Task Workflow', targetWs);
  io.emit('agent_session', emptySession);
  res.json({ status: 'ok', session: emptySession });
});

app.post('/ai/agent/stop', (req, res) => {
  agent.stop();
  res.json({ status: 'ok', session: globalActivityTracker.getSession() });
});

app.post('/ai/agent/accept-change', async (req, res) => {
  try {
    const { path: filePath } = req.body;
    const ok = await globalActivityTracker.acceptChange(filePath);
    res.json({ status: ok ? 'ok' : 'not_found' });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/ai/agent/reject-change', async (req, res) => {
  try {
    const { path: filePath } = req.body;
    const ok = await globalActivityTracker.rejectChange(filePath);
    res.json({ status: ok ? 'ok' : 'not_found' });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/ai/agent/accept-all', async (req, res) => {
  try {
    await globalActivityTracker.acceptAllChanges();
    res.json({ status: 'ok' });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/ai/agent/reject-all', async (req, res) => {
  try {
    await globalActivityTracker.rejectAllChanges();
    res.json({ status: 'ok' });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/ai/agent/approval-mode', (req, res) => {
  res.json({ mode: globalActivityTracker.getApprovalMode() });
});

app.post('/ai/agent/approval-mode', async (req, res) => {
  try {
    const { mode } = req.body;
    globalActivityTracker.setApprovalMode(mode);
    await SettingsManager.updateGlobalConfig({ approvalMode: mode });
    res.json({ status: 'ok', mode });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

app.post('/ai/workflow-routing', async (req, res) => {
  try {
    const { routing } = req.body;
    const updated = await SettingsManager.updateGlobalConfig({ workflowRouting: routing });
    res.json({ status: 'ok', routing: updated.workflowRouting });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

// --- BROWSER SERVICE ENDPOINTS ---

app.get('/browser/services', (req, res) => {
  res.json(serviceManager.getServices());
});

app.get('/browser/services/ui', (req, res) => {
  res.json(serviceManager.getUIServices());
});

app.get('/browser/services/diagnose', async (req, res) => {
  try {
    const report = await serviceManager.diagnoseAll();
    res.json(report);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/browser/services/:serviceId/diagnose', async (req, res) => {
  try {
    const diagnostic = await serviceManager.diagnoseService(req.params.serviceId);
    if (!diagnostic) {
      return res.status(404).json({ error: 'Service not found' });
    }
    res.json(diagnostic);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/browser/services/:serviceId', (req, res) => {
  const service = serviceManager.getService(req.params.serviceId);
  if (!service) {
    return res.status(404).json({ error: 'Service not found' });
  }
  res.json(service);
});

app.post('/browser/services/refresh', async (req, res) => {
  try {
    const services = await serviceManager.discoverServices();
    res.json(services);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/browser/services/report', (req, res) => {
  const { url, command, pid, projectSubPath } = req.body;
  if (!url) {
    return res.status(400).json({ error: 'url is required' });
  }
  serviceManager.reportServiceFromOutput(url, command || '', pid, projectSubPath);
  res.json({ status: 'ok' });
});

app.post('/browser/services/manual', async (req, res) => {
  const { url, name } = req.body;
  if (!url) {
    return res.status(400).json({ error: 'url is required' });
  }
  try {
    const service = await serviceManager.registerManualService(url, name);
    res.json(service);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

// Mount the dev proxy routers for both /preview and /dev-proxy
app.use('/preview', createDevProxyRouter('/preview'));
app.use('/dev-proxy', createDevProxyRouter('/dev-proxy'));

// Handle WebSocket upgrades for dev proxies & HMR
handleWebSocketUpgrade(httpServer);

// --- SOCKET.IO CHAT ---

io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);

  // Send current workspace state immediately upon connection
  socket.emit('agent_workspace_state', globalWorkspaceState.getState());

  socket.on('get_workspace_state', () => {
    socket.emit('agent_workspace_state', globalWorkspaceState.getState());
  });

  socket.on('workspace_action', (action: any) => {
    const updated = globalWorkspaceState.dispatchAction(action);
    io.emit('agent_workspace_state', updated);
  });

  socket.on('agent_permission_response', (data: any) => {
    if (data?.requestId) {
      agentPermissionManager.respond(data.requestId, data.approved, data.values, data.reason);
    }
  });

  socket.on('agent_permission_cancel', (data: any) => {
    if (data?.requestId) {
      agentPermissionManager.cancelRequest(data.requestId, data.reason);
    }
  });

  // Send current agent session immediately upon client request
  socket.on('get_agent_session', (data?: { workspace?: string }) => {
    const session = globalActivityTracker.getSession();
    if (data?.workspace !== undefined) {
      const requestedKey = (!data.workspace || data.workspace === '__global__' || data.workspace === 'global') ? '__global__' : data.workspace;
      const sessionKey = session.workspace || '__global__';
      if (requestedKey !== sessionKey) {
        socket.emit('agent_session', null);
        return;
      }
    }
    socket.emit('agent_session', session);
  });

  socket.on('new_agent_session', (data?: { workspace?: string }) => {
    const ws = data?.workspace || (workspaceManager.isActive() ? (workspaceManager.getState().path || '__global__') : '__global__');
    const emptySession = globalActivityTracker.resetSession('Task Workflow', ws);
    io.emit('agent_session', emptySession);
  });

  socket.on('stop_agent', () => {
    agent.stop();
  });

  socket.on('accept_change', async (data) => {
    if (data?.path) {
      await globalActivityTracker.acceptChange(data.path);
    }
  });

  socket.on('reject_change', async (data) => {
    if (data?.path) {
      await globalActivityTracker.rejectChange(data.path);
    }
  });

  socket.on('accept_all_changes', async () => {
    await globalActivityTracker.acceptAllChanges();
  });

  socket.on('reject_all_changes', async () => {
    await globalActivityTracker.rejectAllChanges();
  });

  // Allow client to request chat history for a specific workspace or global
  socket.on('get_chat_history', (data) => {
    let key: string;
    if (data?.workspace !== undefined) {
      key = (!data.workspace || data.workspace === '__global__' || data.workspace === 'global') ? '__global__' : data.workspace;
    } else {
      key = workspaceManager.isActive() ? (workspaceManager.getState().path || '__global__') : '__global__';
    }
    const messages = getChatHistory(key);
    socket.emit('chat_history', { workspace: key, messages });
  });

  socket.on('message', async (data) => {
    try {
      // data can be a string (legacy) or { text, workspace, history }
      const text = typeof data === 'string' ? data : data.text;
      const clientWorkspace = typeof data === 'object' ? data.workspace : null;
      const history = typeof data === 'object' && Array.isArray(data.history) ? data.history : [];

      // Sync active workspace based on client state
      const wsPath = typeof clientWorkspace === 'string'
        ? clientWorkspace
        : clientWorkspace?.path;
      if (wsPath) {
        if (!workspaceManager.isActive() || workspaceManager.getState().path !== wsPath) {
          try {
            await workspaceManager.select(wsPath);
            agent.setWorkspace(wsPath);
          } catch { /* ignore if invalid */ }
        }
      }

      const activeWorkspaceKey = workspaceManager.isActive() ? (workspaceManager.getState().path || '__global__') : '__global__';

      // Hydrate agent context history if fresh in memory
      if (agent.getWorkspaceHistory(activeWorkspaceKey).length === 0 && history.length > 0) {
        const converted = history.map(h => ({
          role: (h.role === 'agent' ? 'assistant' : h.role === 'user' ? 'user' : 'system') as any,
          content: h.content,
        }));
        agent.setWorkspaceHistory(converted, activeWorkspaceKey);
      }

      // Save user message in workspace chat cache
      appendChatMessage({ role: 'user', content: text }, activeWorkspaceKey);

      // Detect intent
      const intent = detectIntent(text, workspaceManager.isActive(), history);
      socket.emit('intent', intent);

      // NEW_PROJECT always asks for directory location (Section 7 & 12)
      if (intent.intent === 'NEW_PROJECT') {
        const msg = 'This looks like a new project. Where would you like me to create it?';
        appendChatMessage({ role: 'agent', content: msg, type: 'response' }, activeWorkspaceKey);
        socket.emit('workspace_required', {
          type: 'new',
          message: msg,
          suggestedName: workspaceManager.generateProjectName(text),
        });
        return;
      }

      // EXISTING_PROJECT requires active workspace (Section 5)
      if (intent.intent === 'EXISTING_PROJECT' && !workspaceManager.isActive()) {
        const isGeneralToolQuery = /\b(tool|tools|read|search|run|exec|command|status|file|package\.json|list|cli)\b/i.test(text);
        if (!isGeneralToolQuery) {
          const msg = 'I can help with that. Which project directory should I work on?';
          appendChatMessage({ role: 'agent', content: msg, type: 'response' }, activeWorkspaceKey);
          socket.emit('workspace_required', {
            type: 'existing',
            message: msg,
          });
          return;
        }
      }

      // Build workspace context for the agent (Section 14 & 15)
      const workspace = workspaceManager.getState();
      const currentRoot = workspace.path || WorkspaceContext.getRoot();
      const currentName = workspace.name || path.basename(currentRoot);
      const workspaceContext = `\n\nActive Workspace: ${currentName} (${currentRoot})\nAll file and tool operations must be performed within this workspace.`;

      const fullMessage = `${text}${workspaceContext}`;

      // Process with agent in the active workspace
      const response = await agent.processRequest(fullMessage, async (step) => {
        socket.emit('agent_step', { step, workspace: activeWorkspaceKey });
      }, activeWorkspaceKey);

      // EMPTY RESPONSE PROTECTION: Never emit a blank response to the frontend
      const safeResponse = (response && response.trim())
        ? response
        : 'I processed your request but was unable to generate a response. Please try rephrasing your request or providing more details.';

      const session = globalActivityTracker.getSession();
      const activities = session.activities && session.activities.length > 0 ? [...session.activities] : undefined;
      const changedFiles = session.changedFiles && session.changedFiles.length > 0 ? [...session.changedFiles] : undefined;

      appendChatMessage({ role: 'agent', content: safeResponse, type: 'response', activities, changedFiles }, activeWorkspaceKey);
      socket.emit('agent_response', { content: safeResponse, workspace: activeWorkspaceKey, activities, changedFiles });

      // Signal explorer refresh after project changes (Section 20)
      if (workspace.path) {
        socket.emit('explorer_refresh');
      }
    } catch (error: any) {
      console.error('[Socket message] Agent processing error:', error);
      const activeWorkspaceKey = workspaceManager.isActive() ? (workspaceManager.getState().path || '__global__') : '__global__';
      const errorMessage = `An error occurred while processing your request: ${error.message || 'Unknown error'}`;
      const session = globalActivityTracker.getSession();
      const activities = session.activities && session.activities.length > 0 ? [...session.activities] : undefined;
      appendChatMessage({ role: 'system', content: errorMessage, type: 'error', activities }, activeWorkspaceKey);
      socket.emit('error', { message: error.message || 'Unknown error' });
      // Also emit an agent_response so the UI doesn't show a blank bubble
      socket.emit('agent_response', { content: errorMessage, workspace: activeWorkspaceKey, activities });
    }
  });

  socket.on('disconnect', () => {
    console.log('Client disconnected');
  });
});

app.get('/port', (req, res) => {
  // Legacy endpoint — return the first detected UI service port, or fallback
  const uiServices = serviceManager.getUIServices();
  const port = uiServices.length > 0 ? String(uiServices[0].port) : '3000';
  res.json({ port });
});

// Asset fallback proxy for absolute paths (/static/*, /_next/*, /media/*, etc.)
app.use(createAssetFallbackProxy());

const PORT = process.env.PORT || 5001;
const HOST = process.env.HOST || '0.0.0.0';
if (process.env.NODE_ENV !== 'test') {
  httpServer.listen(Number(PORT), HOST, () => {
    console.log(`Backend server running on http://${HOST === '0.0.0.0' ? 'localhost' : HOST}:${PORT}`);
  });
}
