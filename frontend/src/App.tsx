import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import Editor, { DiffEditor } from '@monaco-editor/react';
import { io, Socket } from 'socket.io-client';
import { Send, Code, Globe, Bot, Folder, FolderOpen, Sparkles, Trash2, Sliders, Settings as SettingsIcon, Square, Check, RotateCcw, X, Loader2, Plus, Activity, Image as ImageIcon, FileText } from 'lucide-react';
import axios from 'axios';
import { MessageRenderer, type ChatMessage } from './components/MessageRenderer';
import { Explorer, type ExplorerStatus, type FileNode } from './components/Explorer';
import { WorkspaceIndicator } from './components/WorkspaceIndicator';
import { DirectoryPicker } from './components/DirectoryPicker';
import { FormatterModal, type FormatterInfo } from './components/FormatterModal';
import { FormatterToast, type ToastMessage } from './components/FormatterToast';
import { ModelSelector } from './components/ModelSelector';
import { AIRuntimeStatusBar } from './components/AIRuntimeStatusBar';
import { ContextAlertBanner } from './components/ContextAlertBanner';
import { AISettingsModal } from './components/AISettingsModal';
import { AgentActivityTimeline } from './components/AgentActivityTimeline';
import { ChangedFilesPanel } from './components/ChangedFilesPanel';
import { AgentSession, AgentActivity, ChangedFile } from './types/agent';
import { useWorkspace } from './hooks/useWorkspace';
import { useBrowserServices } from './hooks/useBrowserServices';
import { BrowserPanel } from './components/BrowserPanel';
import { InspectPanel } from './components/InspectPanel';
import { ImagesPanel } from './components/ImagesPanel';
import { DocsPanel } from './components/DocsPanel';
import { AgentPermissionModal } from './components/AgentPermissionModal';
import { AgentCursor, type AgentCursorState } from './components/AgentCursor';
import type {
  WorkspaceSurface,
  WorkspaceState,
  WorkspaceAction,
  AgentPermissionRequest,
  AgentArtifact,
  InspectorPanelType,
  ConsoleMessage,
  NetworkRequestLog,
  DOMNodeInfo,
  PerformanceMetrics,
  MemoryMetrics,
  StorageInspection,
  SecurityInspection,
} from './types/workspace';

const SOCKET_URL = 'http://localhost:5001';
const API = 'http://localhost:5001';

function getLanguageFromPath(filePath: string): string {
  const parts = filePath.split('/');
  const basename = parts.pop()?.toLowerCase() || '';
  const ext = basename.includes('.') ? basename.split('.').pop()?.toLowerCase() : '';

  if (basename === 'dockerfile' || basename.startsWith('dockerfile.') || ext === 'dockerfile') return 'dockerfile';
  if (basename === '.env' || basename.startsWith('.env.')) return 'dotenv';
  if (basename === '.gitignore' || basename === '.dockerignore' || basename === '.npmignore' || basename === '.editorconfig') return 'ignore';
  if (basename === 'package-lock.json' || basename === 'skills-lock.json' || basename === 'composer.lock') return 'json';
  if (basename === 'pnpm-lock.yaml') return 'yaml';

  switch (ext) {
    case 'tsbuildinfo': return 'json';
    case 'lock': return 'lockfile';
    case 'txt':
    case 'text':
    case 'log': return 'plaintext';
    case 'toml': return 'toml';
    case 'ini':
    case 'cfg':
    case 'conf':
    case 'properties': return 'properties';
    case 'xml':
    case 'svg': return 'xml';
    case 'mdx': return 'mdx';
    case 'py': return 'python';
    case 'js':
    case 'mjs':
    case 'cjs': return 'javascript';
    case 'jsx': return 'jsx';
    case 'ts':
    case 'mts':
    case 'cts': return 'typescript';
    case 'tsx': return 'typescript';
    case 'html':
    case 'htm': return 'html';
    case 'css': return 'css';
    case 'scss':
    case 'sass': return 'scss';
    case 'less': return 'less';
    case 'json':
    case 'jsonc':
    case 'json5': return 'json';
    case 'yaml':
    case 'yml': return 'yaml';
    case 'md':
    case 'markdown': return 'markdown';
    case 'go': return 'go';
    case 'rs': return 'rust';
    case 'c':
    case 'h': return 'c';
    case 'cpp':
    case 'cc':
    case 'cxx':
    case 'hpp': return 'cpp';
    case 'java': return 'java';
    case 'kt':
    case 'kts': return 'kotlin';
    case 'scala':
    case 'sc': return 'scala';
    case 'cs': return 'csharp';
    case 'fs':
    case 'fsi': return 'fsharp';
    case 'swift': return 'swift';
    case 'dart': return 'dart';
    case 'rb':
    case 'rake': return 'ruby';
    case 'php': return 'php';
    case 'lua': return 'lua';
    case 'ex':
    case 'exs': return 'elixir';
    case 'sh':
    case 'bash':
    case 'zsh': return 'shell';
    case 'sql': return 'sql';
    case 'tf':
    case 'tfvars': return 'terraform';
    case 'zig': return 'zig';
    case 'vue': return 'vue';
    case 'svelte': return 'svelte';
    case 'graphql':
    case 'gql': return 'graphql';
    case 'prisma': return 'prisma';
    default: return 'typescript';
  }
}

let socket: Socket;
function getSocket(): Socket {
  if (!socket) {
    socket = io(SOCKET_URL);
  }
  return socket;
}

export default function AIIDE() {
  // --- State ---
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [activeTab, setActiveTab] = useState<WorkspaceSurface>('code');
  const [code, setCode] = useState('// Select a file to view code');
  const [fileName, setFileName] = useState('Welcome');

  // Workspace and Inspect Surface States
  const [activeInspectPanel, setActiveInspectPanel] = useState<InspectorPanelType>('console');
  const [consoleLogs, setConsoleLogs] = useState<ConsoleMessage[]>([]);
  const [networkRequests, setNetworkRequests] = useState<NetworkRequestLog[]>([]);
  const [domTree, setDomTree] = useState<DOMNodeInfo | null>(null);
  const [performanceMetrics, setPerformanceMetrics] = useState<PerformanceMetrics | null>(null);
  const [memoryMetrics, setMemoryMetrics] = useState<MemoryMetrics | null>(null);
  const [storageInspection, setStorageInspection] = useState<StorageInspection | null>(null);
  const [securityInspection, setSecurityInspection] = useState<SecurityInspection | null>(null);

  // File badges & active explorer path
  const [fileBadges, setFileBadges] = useState<Record<string, 'Created' | 'Modified' | 'Deleted'>>({});

  // Artifacts & Viewer States
  const [activeImagePath, setActiveImagePath] = useState<string | null>(null);
  const [activeDocPath, setActiveDocPath] = useState<string | null>(null);
  const [recentScreenshots, setRecentScreenshots] = useState<AgentArtifact[]>([]);
  const [recentDocs, setRecentDocs] = useState<AgentArtifact[]>([]);

  // Agent Permission / Human-in-the-loop State
  const [currentPermissionRequest, setCurrentPermissionRequest] = useState<AgentPermissionRequest | null>(null);

  const inspectErrorCount = useMemo(() => {
    const consoleErrors = consoleLogs.filter((l) => l.level === 'error').length;
    const networkErrors = networkRequests.filter((r) => r.status && r.status >= 400).length;
    return consoleErrors + networkErrors;
  }, [consoleLogs, networkRequests]);

  const handlePermissionSubmit = useCallback((requestId: string, values: Record<string, any>) => {
    if (socketRef.current) {
      socketRef.current.emit('agent_permission_response', {
        requestId,
        approved: true,
        data: values,
      });
    }
    axios.post(`${API}/agent/permission/respond`, {
      requestId,
      approved: true,
      data: values,
    }).catch(() => {});
    setCurrentPermissionRequest(null);
  }, []);

  const handlePermissionCancel = useCallback((requestId: string) => {
    if (socketRef.current) {
      socketRef.current.emit('agent_permission_cancel', { requestId });
    }
    axios.post(`${API}/agent/permission/respond`, {
      requestId,
      approved: false,
    }).catch(() => {});
    setCurrentPermissionRequest(null);
  }, []);

  // Agent Workflow & Activity state (Sections 30-62)
  const [agentSession, setAgentSession] = useState<AgentSession | null>(null);
  const [diffViewFile, setDiffViewFile] = useState<ChangedFile | null>(null);
  const agentSessionRef = useRef<AgentSession | null>(null);
  useEffect(() => {
    agentSessionRef.current = agentSession;
  }, [agentSession]);

  // Explorer state
  const [explorerStatus, setExplorerStatus] = useState<ExplorerStatus>('no_workspace');
  const [projectStructure, setProjectStructure] = useState<FileNode | null>(null);
  const [explorerError, setExplorerError] = useState<string | null>(null);

  // Formatter state
  const [activeFilePath, setActiveFilePath] = useState('');
  const [allFormatters, setAllFormatters] = useState<FormatterInfo[]>([]);
  const [formatOnSave, setFormatOnSave] = useState(false);
  const [formatterModalOpen, setFormatterModalOpen] = useState(false);
  const [formatterToast, setFormatterToast] = useState<ToastMessage | null>(null);

  // Directory picker state
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerMode, setPickerMode] = useState<'open' | 'new'>('open');
  const [suggestedProjectName, setSuggestedProjectName] = useState('');

  // AI Settings & Control Center state
  const [aiSettingsModalOpen, setAiSettingsModalOpen] = useState(false);
  const [aiSettingsInitialTab, setAiSettingsInitialTab] = useState('models');
  const [activeModelId, setActiveModelId] = useState('claude-3-7-sonnet-20250219');
  const [availableModels, setAvailableModels] = useState<any[]>([]);
  const [contextUsage, setContextUsage] = useState<any>({
    usedTokens: 0,
    maxTokens: 200000,
    percentage: 0,
    threshold: 'normal',
    modelName: 'Claude 3.7 Sonnet',
  });
  const [skillsCount, setSkillsCount] = useState(8);
  const [toolsCount, setToolsCount] = useState(10);
  const [connectorsCount, setConnectorsCount] = useState(2);
  const [alertDismissed, setAlertDismissed] = useState(false);

  // Virtual Agent Cursor & Click Animation State
  const [agentCursor, setAgentCursor] = useState<AgentCursorState>({
    x: 400,
    y: 200,
    visible: false,
    isClicking: false,
    label: 'AI Agent',
  });

  const triggerAgentCursor = useCallback((targetTabOrPos?: string | { x: number; y: number }, actionLabel = 'AI Agent Action') => {
    let targetX = window.innerWidth * 0.7;
    let targetY = 32;

    if (typeof targetTabOrPos === 'string') {
      const tabElement = document.querySelector(`[data-tab="${targetTabOrPos}"]`);
      if (tabElement) {
        const rect = tabElement.getBoundingClientRect();
        targetX = rect.left + rect.width / 2;
        targetY = rect.top + rect.height / 2;
      } else {
        const tabOffsets: Record<string, number> = {
          code: 0.72,
          browser: 0.78,
          inspect: 0.84,
          images: 0.90,
          docs: 0.95,
        };
        targetX = window.innerWidth * (tabOffsets[targetTabOrPos] || 0.75);
        targetY = 28;
      }
    } else if (targetTabOrPos && typeof targetTabOrPos.x === 'number') {
      targetX = targetTabOrPos.x;
      targetY = targetTabOrPos.y;
    }

    setAgentCursor({
      x: targetX,
      y: targetY,
      visible: true,
      isClicking: false,
      label: actionLabel,
    });

    setTimeout(() => {
      setAgentCursor((prev) => ({ ...prev, isClicking: true }));
      setTimeout(() => {
        setAgentCursor((prev) => ({ ...prev, isClicking: false }));
      }, 450);
    }, 350);

    setTimeout(() => {
      setAgentCursor((prev) => ({ ...prev, visible: false }));
    }, 3200);
  }, []);

  // Workspace
  const {
    workspace,
    isActive: workspaceActive,
    selectWorkspace,
    createWorkspace,
    clearWorkspace,
    fetchWorkspace,
  } = useWorkspace();

  const getWorkspaceKey = useCallback((p: string | null) => (p ? `proj:${p}` : 'global'), []);

  // Multi-workspace chat cache
  const [chatsByWorkspace, setChatsByWorkspace] = useState<Record<string, ChatMessage[]>>(() => {
    try {
      const saved = localStorage.getItem('ai_ide_project_chats');
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });

  const prevWorkspaceKeyRef = useRef<string>(getWorkspaceKey(workspace.path));
  const messagesRef = useRef<ChatMessage[]>(messages);
  messagesRef.current = messages;
  const workspaceRef = useRef(workspace);
  workspaceRef.current = workspace;

  const chatEndRef = useRef<HTMLDivElement>(null);
  const socketRef = useRef<Socket | null>(null);

  // Browser Services hook
  const {
    services: browserServices,
    tabs: browserTabs,
    activeTab: activeBrowserTab,
    selectTab: selectBrowserTab,
    closeTab: closeBrowserTab,
    addManualTab: addManualBrowserTab,
    updateTabStatus: updateBrowserTabStatus,
    refreshServices: refreshBrowserServices,
  } = useBrowserServices(socketRef);

  // --- Chat persistence ---
  const persistChats = useCallback((updatedChats: Record<string, ChatMessage[]>) => {
    try {
      localStorage.setItem('ai_ide_project_chats', JSON.stringify(updatedChats));
    } catch { /* quota exceeded, etc */ }
  }, []);

  const addMessage = useCallback((msg: ChatMessage, targetWorkspace?: string | null) => {
    const rawTarget = targetWorkspace !== undefined ? targetWorkspace : workspaceRef.current.path;
    const key = getWorkspaceKey(rawTarget);
    const isCurrent = key === getWorkspaceKey(workspaceRef.current.path);

    if (isCurrent) {
      setMessages(prev => [...prev, msg]);
    }

    setChatsByWorkspace(prevChats => {
      const existing = prevChats[key] || [];
      const updated = [...existing, msg];
      const next = { ...prevChats, [key]: updated };
      persistChats(next);
      return next;
    });
  }, [getWorkspaceKey, persistChats]);

  // --- Load project files ---
  const loadProjectStructure = useCallback(async () => {
    setExplorerStatus('loading');
    setExplorerError(null);
    try {
      const res = await axios.get(`${API}/files`);
      if (res.data.status === 'no_workspace') {
        setExplorerStatus('no_workspace');
        setProjectStructure(null);
      } else if (res.data.status === 'ok') {
        setProjectStructure(res.data.data);
        setExplorerStatus('loaded');
      } else {
        throw new Error(res.data.error || 'Unknown error');
      }
    } catch (e: any) {
      console.error('[Explorer] Failed to load:', e);
      setExplorerError(e.message || 'Failed to load project structure');
      setExplorerStatus(workspaceActive ? 'error' : 'no_workspace');
    }
  }, [workspaceActive]);

  // --- Load file content ---
  const loadFileContent = useCallback(async (filePath: string, name: string) => {
    try {
      setFileName(name);
      setActiveFilePath(filePath);
      const res = await axios.get(`${API}/file-content?path=${encodeURIComponent(filePath)}`);
      setCode(res.data.content);
    } catch (e) {
      console.error('Failed to load file content');
      setCode('// Error loading file content.');
    }
  }, []);

  // --- Initialize ---
  useEffect(() => {
    // Fetch workspace state from backend
    fetchWorkspace();

    // Fetch formatters & config
    axios
      .get(`${API}/formatters`)
      .then((res) => {
        if (res.data?.formatters) {
          setAllFormatters(res.data.formatters);
        }
      })
      .catch(() => {});

    axios
      .get(`${API}/format/config`)
      .then((res) => {
        if (typeof res.data?.formatOnSave === 'boolean') {
          setFormatOnSave(res.data.formatOnSave);
        }
      })
      .catch(() => {});

    // Socket events
    const sock = getSocket();
    socketRef.current = sock;

    // Workspace state broadcast from backend
    sock.on('agent_workspace_state', (wsState: WorkspaceState) => {
      if (wsState.activeSurface) {
        setActiveTab(wsState.activeSurface);
      }
      if (wsState.activeFilePath) {
        setActiveFilePath(wsState.activeFilePath);
        const name = wsState.activeFilePath.split('/').pop() || 'File';
        setFileName(name);
        loadFileContent(wsState.activeFilePath, name);
      }
      if (wsState.activeBrowserTab) {
        selectBrowserTab(wsState.activeBrowserTab);
      }
      if (wsState.activeInspectPanel) {
        setActiveInspectPanel(wsState.activeInspectPanel as InspectorPanelType);
      }
      if (wsState.activeImagePath) {
        setActiveImagePath(wsState.activeImagePath);
      }
      if (wsState.activeDocPath) {
        setActiveDocPath(wsState.activeDocPath);
      }
      if (wsState.fileBadges) {
        const normalized: Record<string, 'Created' | 'Modified' | 'Deleted'> = {};
        for (const [k, v] of Object.entries(wsState.fileBadges)) {
          const val = String(v).toLowerCase();
          if (val === 'created') normalized[k] = 'Created';
          else if (val === 'modified') normalized[k] = 'Modified';
          else if (val === 'deleted') normalized[k] = 'Deleted';
        }
        setFileBadges(normalized);
      }
    });

    sock.on('agent_workspace_action', (action: WorkspaceAction) => {
      if (action.type === 'open_file' || action.type === 'create_file') {
        triggerAgentCursor('code', `Opening ${action.target || 'Code'}`);
        if (action.target) {
          setActiveTab('code');
          setActiveFilePath(action.target);
          const name = action.target.split('/').pop() || 'File';
          setFileName(name);
          loadFileContent(action.target, name);
        }
      } else if (action.type === 'open_browser') {
        triggerAgentCursor('browser', 'Opening Browser');
        setActiveTab('browser');
      } else if (action.type === 'open_inspector' || action.type === 'focus_console' || action.type === 'focus_network') {
        triggerAgentCursor('inspect', 'Opening Inspect');
        setActiveTab('inspect');
        if (action.type === 'focus_console') setActiveInspectPanel('console');
        if (action.type === 'focus_network') setActiveInspectPanel('network');
      } else if (action.type === 'open_image') {
        triggerAgentCursor('images', 'Opening Image');
        setActiveTab('images');
        if (action.target) setActiveImagePath(action.target);
      } else if (action.type === 'open_document') {
        triggerAgentCursor('docs', 'Opening Document');
        setActiveTab('docs');
        if (action.target) setActiveDocPath(action.target);
      }
      loadProjectStructure();
    });

    sock.on('browser_action', (action: any) => {
      if (action.type === 'click') {
        triggerAgentCursor({ x: window.innerWidth * 0.65, y: window.innerHeight * 0.45 }, 'Clicking Element');
      } else if (action.type === 'type') {
        triggerAgentCursor({ x: window.innerWidth * 0.65, y: window.innerHeight * 0.40 }, `Typing: ${action.value || ''}`);
      }
    });

    // Permission requests & resolution
    sock.on('agent_permission_request', (request: AgentPermissionRequest) => {
      setCurrentPermissionRequest(request);
    });

    sock.on('agent_permission_resolved', (data: { requestId: string; approved: boolean }) => {
      setCurrentPermissionRequest((prev) => (prev?.id === data.requestId ? null : prev));
    });

    // Artifact creation
    sock.on('agent_artifact_created', (artifact: AgentArtifact) => {
      if (artifact.type === 'screenshot') {
        setRecentScreenshots((prev) => [artifact, ...prev]);
        if (artifact.path) {
          setActiveImagePath(artifact.path);
        }
      } else if (artifact.type === 'document') {
        setRecentDocs((prev) => [artifact, ...prev]);
        if (artifact.path) {
          setActiveDocPath(artifact.path);
        }
      }
    });

    // Inspect telemetry streams
    sock.on('browser_inspect_console', (msg: ConsoleMessage) => {
      setConsoleLogs((prev) => [...prev, msg]);
    });

    sock.on('browser_inspect_network', (req: NetworkRequestLog) => {
      setNetworkRequests((prev) => [...prev, req]);
    });

    sock.on('browser_inspect_telemetry', (telemetry: any) => {
      if (telemetry.domTree) setDomTree(telemetry.domTree);
      if (telemetry.consoleLogs) setConsoleLogs(telemetry.consoleLogs);
      if (telemetry.networkRequests) setNetworkRequests(telemetry.networkRequests);
      if (telemetry.performance) setPerformanceMetrics(telemetry.performance);
      if (telemetry.memory) setMemoryMetrics(telemetry.memory);
      if (telemetry.storage) setStorageInspection(telemetry.storage);
      if (telemetry.security) setSecurityInspection(telemetry.security);
    });

    // Query pending permission request
    axios.get(`${API}/agent/permission/pending`).then((res) => {
      if (res.data?.request) {
        setCurrentPermissionRequest(res.data.request);
      }
    }).catch(() => {});

    // Query initial inspect state
    axios.get(`${API}/inspect/state`).then((res) => {
      if (res.data?.success && res.data.state) {
        const s = res.data.state;
        if (s.domTree) setDomTree(s.domTree);
        if (s.consoleLogs) setConsoleLogs(s.consoleLogs);
        if (s.networkRequests) setNetworkRequests(s.networkRequests);
        if (s.performance) setPerformanceMetrics(s.performance);
        if (s.memory) setMemoryMetrics(s.memory);
        if (s.storage) setStorageInspection(s.storage);
        if (s.security) setSecurityInspection(s.security);
      }
    }).catch(() => {});

    // Query recent artifacts
    axios.get(`${API}/artifacts`).then((res) => {
      if (res.data?.artifacts) {
        const screenshots = res.data.artifacts.filter((a: AgentArtifact) => a.type === 'screenshot');
        const docs = res.data.artifacts.filter((a: AgentArtifact) => a.type === 'document');
        setRecentScreenshots(screenshots);
        setRecentDocs(docs);
      }
    }).catch(() => {});

    sock.on('agent_step', (_data) => {
      // Step notification from backend - tool activities are tracked in activities timeline, not chat bubbles
    });

    sock.on('agent_response', (data) => {
      // DEFENSIVE: Never render a blank agent message
      const responseContent = (data.content && data.content.trim())
        ? data.content
        : 'The agent completed processing but did not produce a visible response. Please try again.';
      const currentActivities = agentSessionRef.current?.activities
        ? [...agentSessionRef.current.activities]
        : undefined;
      const currentChangedFiles = agentSessionRef.current?.changedFiles
        ? [...agentSessionRef.current.changedFiles]
        : undefined;
      addMessage(
        {
          role: 'agent',
          content: responseContent,
          type: 'response',
          activities: currentActivities,
          changedFiles: currentChangedFiles,
        },
        data?.workspace === '__global__' ? null : data?.workspace
      );
    });

    sock.on('error', (data) => {
      addMessage({ role: 'system', content: `Error: ${data.message}`, type: 'error' });
    });

    sock.on('workspace_required', (data) => {
      // AI determined a workspace is needed — show picker
      addMessage({ role: 'agent', content: data.message, type: 'response' });
      if (data.type === 'new') {
        setSuggestedProjectName(data.suggestedName || '');
        setPickerMode('new');
      } else {
        setPickerMode('open');
      }
      setPickerOpen(true);
    });

    sock.on('explorer_refresh', () => {
      loadProjectStructure();
    });

    // Agent Workflow & Activity events (Sections 49, 50, 58)
    sock.on('agent_session', (session: AgentSession | null) => {
      if (!session || !session.activities || session.activities.length === 0) {
        setAgentSession(null);
        return;
      }
      const currentWs = getWorkspaceKey(workspaceRef.current.path);
      const sessionWs = getWorkspaceKey(session.workspace || null);
      if (currentWs === sessionWs) {
        setAgentSession(session);
      } else {
        setAgentSession(null);
      }
    });

    sock.on('agent_activity', (activity: AgentActivity) => {
      const currentWs = getWorkspaceKey(workspaceRef.current.path);
      const activityWs = getWorkspaceKey((activity.metadata?.workspace as string) || (agentSessionRef.current?.workspace || null));
      if (activityWs !== currentWs) return;

      setAgentSession((prev) => {
        if (!prev) {
          return {
            id: 'session-' + Date.now(),
            workspace: currentWs,
            status: 'coding',
            taskTitle: 'Agent Task',
            activities: [activity],
            changedFiles: [],
            pendingChanges: [],
          };
        }
        const existingIdx = prev.activities.findIndex((a) => a.id === activity.id);
        let updatedActivities: AgentActivity[];
        if (existingIdx >= 0) {
          updatedActivities = [...prev.activities];
          updatedActivities[existingIdx] = activity;
        } else {
          updatedActivities = [...prev.activities, activity];
        }
        return {
          ...prev,
          activities: updatedActivities,
        };
      });
    });

    sock.on('agent_file_changes', (changedFiles: ChangedFile[]) => {
      setAgentSession((prev) => {
        if (!prev) return prev;
        const pending = changedFiles.filter((f) => f.status === 'pending');
        return {
          ...prev,
          changedFiles,
          pendingChanges: pending,
        };
      });
      loadProjectStructure();
    });

    // Query active agent session immediately for current workspace
    const initialWsKey = getWorkspaceKey(workspaceRef.current.path);
    sock.emit('get_agent_session', { workspace: initialWsKey });
    axios
      .get(`${API}/ai/agent/session?workspace=${encodeURIComponent(initialWsKey)}`)
      .then((res) => {
        if (res.data && res.data.activities && res.data.activities.length > 0) {
          const sessionWs = getWorkspaceKey(res.data.workspace);
          if (sessionWs === initialWsKey) {
            setAgentSession(res.data);
          }
        } else {
          setAgentSession(null);
        }
      })
      .catch(() => {
        setAgentSession(null);
      });

    sock.on('chat_history', (data) => {
      const key = getWorkspaceKey(data.workspace === '__global__' ? null : data.workspace);
      if (key === getWorkspaceKey(workspaceRef.current.path)) {
        setMessages(data.messages || []);
      }
      setChatsByWorkspace(prev => {
        const next = { ...prev, [key]: data.messages || [] };
        persistChats(next);
        return next;
      });
    });

    // Load initial project structure
    loadProjectStructure();

    return () => {
      sock.off('agent_step');
      sock.off('agent_response');
      sock.off('error');
      sock.off('workspace_required');
      sock.off('explorer_refresh');
      sock.off('agent_session');
      sock.off('agent_activity');
      sock.off('agent_file_changes');
      sock.off('chat_history');
      sock.off('agent_workspace_state');
      sock.off('agent_workspace_action');
      sock.off('agent_permission_request');
      sock.off('agent_permission_resolved');
      sock.off('agent_artifact_created');
      sock.off('browser_inspect_console');
      sock.off('browser_inspect_network');
      sock.off('browser_inspect_telemetry');
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Switch chat conversation & reload explorer when workspace changes
  useEffect(() => {
    const newKey = getWorkspaceKey(workspace.path);
    const oldKey = prevWorkspaceKeyRef.current;

    // Save previous conversation to cache
    if (oldKey !== newKey) {
      setChatsByWorkspace(prev => {
        const updated = { ...prev, [oldKey]: messagesRef.current };
        persistChats(updated);
        return updated;
      });
    }

    prevWorkspaceKeyRef.current = newKey;

    // Load conversation for the active workspace:
    // 1. Check in-memory/local cache first for instant pull
    let cachedMessages: ChatMessage[] = [];
    if (chatsByWorkspace[newKey]) {
      cachedMessages = chatsByWorkspace[newKey];
    } else {
      try {
        const saved = localStorage.getItem('ai_ide_project_chats');
        if (saved) {
          const parsed = JSON.parse(saved);
          if (parsed[newKey]) {
            cachedMessages = parsed[newKey];
          }
        }
      } catch { /* ignore */ }
    }

    setMessages(cachedMessages);

    // 2. Sync from backend memory
    const query = workspace.path ? `?workspace=${encodeURIComponent(workspace.path)}` : '?workspace=__global__';
    axios
      .get(`${API}/workspace/chat-history${query}`)
      .then(res => {
        if (res.data?.messages && Array.isArray(res.data.messages)) {
          if (res.data.messages.length > 0) {
            setMessages(res.data.messages);
            setChatsByWorkspace(prev => {
              const next = { ...prev, [newKey]: res.data.messages };
              persistChats(next);
              return next;
            });
          }
        }
      })
      .catch(() => { });

    loadProjectStructure();
  }, [workspace.path, getWorkspaceKey, loadProjectStructure, persistChats]);

  // Auto-scroll chat
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // --- Formatter Resolution & Handlers ---
  const activeLanguage = useMemo(() => {
    return getLanguageFromPath(activeFilePath || fileName);
  }, [activeFilePath, fileName]);

  const activeFormatter = useMemo(() => {
    if (!allFormatters.length) return undefined;
    const lang = activeLanguage.toLowerCase();
    const found = allFormatters.find((f) => f.languages.includes(lang));
    if (found) return found;
    const ext = (activeFilePath || fileName).split('.').pop()?.toLowerCase();
    if (ext) {
      return allFormatters.find((f) => (f as any).extensions?.includes(`.${ext}`));
    }
    return undefined;
  }, [allFormatters, activeLanguage, activeFilePath, fileName]);

  const handleFormatDocument = useCallback(
    async (codeToFormat?: string) => {
      const currentCode = typeof codeToFormat === 'string' ? codeToFormat : code;
      if (!currentCode || currentCode === '// Select a file to view code') return;

      try {
        const res = await axios.post(`${API}/format`, {
          code: currentCode,
          filePath: activeFilePath || fileName,
          language: activeLanguage,
          workspacePath: workspace.path,
        });

        const result = res.data;
        if (result.unavailable) {
          setFormatterToast({
            type: 'warning',
            text: `${result.formatterName} is not installed on this system.`,
            installHelp: result.installHelp,
            onConfigure: () => setFormatterModalOpen(true),
          });
          return;
        }

        if (!result.success) {
          setFormatterToast({
            type: 'error',
            text: `Formatting error: ${result.error || 'Failed to format code'}`,
            onConfigure: () => setFormatterModalOpen(true),
          });
          return;
        }

        if (typeof result.formatted === 'string') {
          setCode(result.formatted);
          setFormatterToast({
            type: 'success',
            text: `Formatted with ${result.formatterName} ✓`,
          });
          setTimeout(() => {
            setFormatterToast((prev) => (prev?.type === 'success' ? null : prev));
          }, 3000);
        }
      } catch (err: any) {
        console.error('[Format] Request failed:', err);
        setFormatterToast({
          type: 'error',
          text: `Formatter request failed: ${err.message}`,
        });
      }
    },
    [code, activeFilePath, fileName, activeLanguage, workspace.path],
  );

  const handleToggleFormatOnSave = useCallback(async (enabled: boolean) => {
    setFormatOnSave(enabled);
    try {
      await axios.post(`${API}/format/config`, { formatOnSave: enabled });
      setFormatterToast({
        type: 'success',
        text: `Format on Save ${enabled ? 'Enabled' : 'Disabled'}`,
      });
      setTimeout(() => {
        setFormatterToast((prev) => (prev?.type === 'success' ? null : prev));
      }, 2500);
    } catch (err: any) {
      console.error('[Format] Failed to save config:', err);
    }
  }, []);

  const handleSelectFormatter = useCallback(async (language: string, formatterId: string) => {
    try {
      await axios.post(`${API}/format/config`, {
        formatters: { [language.toLowerCase()]: formatterId },
      });
      setFormatterToast({
        type: 'success',
        text: `Set ${formatterId} as default formatter for ${language}`,
      });
      setTimeout(() => {
        setFormatterToast((prev) => (prev?.type === 'success' ? null : prev));
      }, 2500);
    } catch (err: any) {
      console.error('[Format] Failed to select formatter:', err);
    }
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Shift + Alt + F (or Shift + Option + F on Mac)
      if (e.shiftKey && e.altKey && (e.key === 'F' || e.key === 'f')) {
        e.preventDefault();
        handleFormatDocument();
        return;
      }

      // Format on Save (Cmd + S or Ctrl + S)
      if ((e.metaKey || e.ctrlKey) && (e.key === 's' || e.key === 'S')) {
        if (formatOnSave) {
          e.preventDefault();
          handleFormatDocument();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleFormatDocument, formatOnSave]);

  // --- Handlers ---
  const handleSend = useCallback(async () => {
    if (!input.trim()) return;
    const text = input;
    setInput('');
    addMessage({ role: 'user', content: text });

    // Reset activities for new turn so previous turn's activities remain with its message
    setAgentSession((prev) =>
      prev
        ? {
            ...prev,
            activities: [],
            changedFiles: [],
            pendingChanges: [],
            status: 'coding',
          }
        : null
    );

    const sock = socketRef.current || getSocket();
    sock.emit('message', {
      text,
      workspace: workspace,
      history: messages.slice(-10).map(m => ({ role: m.role, content: m.content })),
    });
  }, [input, workspace, messages, addMessage]);

  const handleOpenProject = useCallback(() => {
    setPickerMode('open');
    setSuggestedProjectName('');
    setPickerOpen(true);
  }, []);

  const handleNewProject = useCallback(() => {
    setPickerMode('new');
    setSuggestedProjectName('');
    setPickerOpen(true);
  }, []);

  const handleCloseProject = useCallback(async () => {
    const currentKey = getWorkspaceKey(workspace.path);
    setChatsByWorkspace(prev => {
      const updated = { ...prev, [currentKey]: messagesRef.current };
      persistChats(updated);
      return updated;
    });
    setAgentSession(null);
    setDiffViewFile(null);
    setMessages(chatsByWorkspace['__global__'] || []);
    try {
      await axios.post(`${API}/ai/agent/reset`, { workspace: '__global__' });
      const sock = socketRef.current || getSocket();
      sock.emit('new_agent_session', { workspace: '__global__' });
    } catch {}
    await clearWorkspace();
    setProjectStructure(null);
    setExplorerStatus('no_workspace');
  }, [clearWorkspace, getWorkspaceKey, workspace.path, persistChats, chatsByWorkspace]);

  const handlePickerSelect = useCallback(async (dirPath: string, projectName?: string) => {
    try {
      if (pickerMode === 'new' && projectName) {
        const created = await createWorkspace(dirPath, projectName);
        if (!created.initialized) {
          addMessage({
            role: 'agent',
            content: `The directory \`${dirPath}/${projectName}\` already exists. To avoid overwriting existing files, choose another directory or project name, or open it as an existing project.`,
            type: 'response',
          });
          setPickerOpen(false);
          return;
        }
        addMessage({
          role: 'agent',
          content: `Created new project **${projectName}** at \`${dirPath}/${projectName}\``,
          type: 'response',
        });
      } else {
        await selectWorkspace(dirPath);
        addMessage({
          role: 'agent',
          content: `Opened workspace: **${dirPath.split('/').pop()}** (\`${dirPath}\`)`,
          type: 'response',
        });
      }
      setPickerOpen(false);
      loadProjectStructure();
    } catch (err: any) {
      addMessage({
        role: 'system',
        content: `Error: ${err.message}`,
        type: 'error',
      });
    }
  }, [pickerMode, createWorkspace, selectWorkspace, addMessage, loadProjectStructure]);

  // --- Agent Workflow & Approval Handlers (Sections 30-62) ---
  const handleStopAgent = useCallback(() => {
    const sock = socketRef.current || getSocket();
    sock.emit('stop_agent');
    axios.post(`${API}/ai/agent/stop`).catch(() => {});
  }, []);

  const handleSelectDiff = useCallback((file: ChangedFile) => {
    setDiffViewFile(file);
    setActiveTab('code');
  }, []);

  const handleCloseDiff = useCallback(() => {
    setDiffViewFile(null);
  }, []);

  const handleAcceptChange = useCallback((filePath: string) => {
    const sock = socketRef.current || getSocket();
    sock.emit('accept_change', { path: filePath });
    axios
      .post(`${API}/ai/agent/accept-change`, { path: filePath })
      .then((res) => {
        if (res.data?.session) setAgentSession(res.data.session);
        if (diffViewFile?.path === filePath) {
          setDiffViewFile((prev) => (prev ? { ...prev, status: 'accepted' } : null));
        }
      })
      .catch(() => {});
  }, [diffViewFile]);

  const handleRejectChange = useCallback((filePath: string) => {
    const sock = socketRef.current || getSocket();
    sock.emit('reject_change', { path: filePath });
    axios
      .post(`${API}/ai/agent/reject-change`, { path: filePath })
      .then((res) => {
        if (res.data?.session) setAgentSession(res.data.session);
        if (diffViewFile?.path === filePath) {
          setDiffViewFile(null);
        }
        loadProjectStructure();
      })
      .catch(() => {});
  }, [diffViewFile, loadProjectStructure]);

  const handleAcceptAll = useCallback(() => {
    const sock = socketRef.current || getSocket();
    sock.emit('accept_all_changes');
    axios
      .post(`${API}/ai/agent/accept-all`)
      .then((res) => {
        if (res.data?.session) setAgentSession(res.data.session);
        if (diffViewFile) {
          setDiffViewFile((prev) => (prev ? { ...prev, status: 'accepted' } : null));
        }
      })
      .catch(() => {});
  }, [diffViewFile]);

  const handleRejectAll = useCallback(() => {
    const sock = socketRef.current || getSocket();
    sock.emit('reject_all_changes');
    axios
      .post(`${API}/ai/agent/reject-all`)
      .then((res) => {
        if (res.data?.session) setAgentSession(res.data.session);
        setDiffViewFile(null);
        loadProjectStructure();
      })
      .catch(() => {});
  }, [loadProjectStructure]);

  const handleRefreshAgentSession = useCallback(() => {
    const wsKey = getWorkspaceKey(workspace.path);
    axios
      .get(`${API}/ai/agent/session?workspace=${encodeURIComponent(wsKey)}`)
      .then((res) => {
        if (res.data && res.data.activities && res.data.activities.length > 0) {
          const sessionWs = getWorkspaceKey(res.data.workspace);
          if (sessionWs === wsKey) {
            setAgentSession(res.data);
            return;
          }
        }
        setAgentSession(null);
      })
      .catch(() => {
        setAgentSession(null);
      });
  }, [workspace.path, getWorkspaceKey]);

  const handleNewAgentSession = useCallback(async () => {
    setAgentSession(null);
    setDiffViewFile(null);
    const wsKey = getWorkspaceKey(workspace.path);
    // Strip activities from current messages and cache so the task is no longer visible in chat
    setMessages((prev) =>
      prev.map((msg) => ({
        ...msg,
        activities: undefined,
        changedFiles: undefined,
      }))
    );
    setChatsByWorkspace((prev) => {
      const currentList = prev[wsKey] || [];
      const updatedList = currentList.map((msg) => ({
        ...msg,
        activities: undefined,
        changedFiles: undefined,
      }));
      const next = { ...prev, [wsKey]: updatedList };
      persistChats(next);
      return next;
    });
    try {
      await axios.post(`${API}/ai/agent/reset`, { workspace: wsKey });
      const sock = socketRef.current || getSocket();
      sock.emit('new_agent_session', { workspace: wsKey });
    } catch (e) {
      console.error('Failed to reset session:', e);
    }
  }, [workspace.path, getWorkspaceKey, persistChats]);

  // When workspace changes, query or clear session specifically for that workspace
  useEffect(() => {
    setAgentSession(null);
    setDiffViewFile(null);
    const wsKey = getWorkspaceKey(workspace.path);
    const sock = socketRef.current || getSocket();
    sock.emit('get_agent_session', { workspace: wsKey });
    axios
      .get(`${API}/ai/agent/session?workspace=${encodeURIComponent(wsKey)}`)
      .then((res) => {
        if (res.data && res.data.activities && res.data.activities.length > 0) {
          const sessionWs = getWorkspaceKey(res.data.workspace);
          if (sessionWs === wsKey) {
            setAgentSession(res.data);
          }
        } else {
          setAgentSession(null);
        }
      })
      .catch(() => {
        setAgentSession(null);
      });
  }, [workspace.path, getWorkspaceKey]);

  const isCurrentWorkspaceSession = useMemo(() => {
    if (!agentSession || !agentSession.activities || agentSession.activities.length === 0) return false;
    const sessionWs = getWorkspaceKey(agentSession.workspace || null);
    const currentWs = getWorkspaceKey(workspace.path);
    return sessionWs === currentWs;
  }, [agentSession, workspace.path, getWorkspaceKey]);

  const isAgentWorking = useMemo(() => {
    if (!agentSession || !isCurrentWorkspaceSession) return false;
    return !['idle', 'completed', 'failed'].includes(agentSession.status);
  }, [agentSession, isCurrentWorkspaceSession]);

  // --- AI Settings & Control Center Handlers ---
  const fetchAISettings = useCallback(async () => {
    try {
      const [configRes, modelsRes, ctxRes] = await Promise.all([
        axios.get(`${API}/ai/runtime-config${workspace.path ? `?workspace=${encodeURIComponent(workspace.path)}` : ''}`).catch(() => null),
        axios.get(`${API}/ai/models`).catch(() => null),
        axios.get(`${API}/ai/context-usage${workspace.path ? `?workspace=${encodeURIComponent(workspace.path)}` : ''}`).catch(() => null),
      ]);

      if (configRes?.data) {
        if (configRes.data.activeModel) setActiveModelId(configRes.data.activeModel);
        if (configRes.data.skills?.enabled) setSkillsCount(configRes.data.skills.enabled.length);
        if (configRes.data.tools?.enabled) setToolsCount(configRes.data.tools.enabled.length);
        if (configRes.data.connectors?.enabled) setConnectorsCount(configRes.data.connectors.enabled.length);
      }

      if (modelsRes?.data?.models) {
        setAvailableModels(modelsRes.data.models);
        if (modelsRes.data.activeModel) setActiveModelId(modelsRes.data.activeModel);
      }

      if (ctxRes?.data) {
        setContextUsage(ctxRes.data);
      }
    } catch (e) {
      console.error('[fetchAISettings] error:', e);
    }
  }, [workspace.path]);

  useEffect(() => {
    fetchAISettings();
  }, [fetchAISettings]);

  const handleSelectModel = useCallback(async (modelId: string) => {
    try {
      const res = await axios.post(`${API}/ai/models/select`, {
        modelId,
        workspace: workspace.path || undefined,
      });
      setActiveModelId(modelId);
      if (res.data?.compacted) {
        setFormatterToast({
          text: `Switched to ${modelId}. Context compacted for target window.`,
          type: 'warning',
        });
      } else {
        setFormatterToast({
          text: `Active model switched to ${modelId}`,
          type: 'success',
        });
      }
      fetchAISettings();
    } catch (err: any) {
      setFormatterToast({
        text: `Failed to switch model: ${err.message}`,
        type: 'error',
      });
    }
  }, [workspace.path, fetchAISettings]);

  const handleQuickCompact = useCallback(async () => {
    try {
      const res = await axios.post(`${API}/ai/context/compact`, {
        workspace: workspace.path || undefined,
      });
      setFormatterToast({
        text: `Context compacted: ${res.data.originalTokens} → ${res.data.compactedTokens} tokens`,
        type: 'success',
      });
      fetchAISettings();
    } catch (err: any) {
      setFormatterToast({
        text: `Compaction error: ${err.message}`,
        type: 'error',
      });
    }
  }, [workspace.path, fetchAISettings]);

  const handleOpenAISettings = useCallback((tab?: string) => {
    setAiSettingsInitialTab(tab || 'models');
    setAiSettingsModalOpen(true);
  }, []);

  // --- Monaco Editor Configuration ---
  const handleBeforeMount = useCallback((monaco: any) => {
    try {
      // 1. Configure TypeScript compiler options with JSX support
      const compilerOptions = {
        target: monaco.languages.typescript.ScriptTarget.Latest,
        allowNonTextFiles: true,
        allowJs: true,
        checkJs: false,
        jsx: monaco.languages.typescript.JsxEmit.ReactJSX,
        jsxFactory: 'React.createElement',
        jsxFragmentFactory: 'React.Fragment',
        moduleResolution: monaco.languages.typescript.ModuleResolutionKind.NodeJs,
        module: monaco.languages.typescript.ModuleKind.ESNext,
        noEmit: true,
        esModuleInterop: true,
        allowSyntheticDefaultImports: true,
        isolatedModules: true,
        resolveJsonModule: true,
        skipLibCheck: true,
      };

      monaco.languages.typescript.typescriptDefaults.setCompilerOptions(compilerOptions);
      monaco.languages.typescript.javascriptDefaults.setCompilerOptions(compilerOptions);

      // 2. Disable semantic error squiggles (eliminates missing npm module / missing type red squiggles)
      monaco.languages.typescript.typescriptDefaults.setDiagnosticsOptions({
        noSemanticValidation: true,
        noSyntaxValidation: false,
        noSuggestionDiagnostics: true,
      });

      monaco.languages.typescript.javascriptDefaults.setDiagnosticsOptions({
        noSemanticValidation: true,
        noSyntaxValidation: false,
        noSuggestionDiagnostics: true,
      });

      // 3. Ambient type definitions for React, Next.js, and external packages
      monaco.languages.typescript.typescriptDefaults.addExtraLib(
        `
        declare namespace JSX {
          interface IntrinsicElements {
            [elemName: string]: any;
          }
          interface Element extends any {}
          interface ElementClass extends any {}
        }
        declare var React: any;
        declare module '*';
        declare module 'react';
        declare module 'react/jsx-runtime';
        declare module 'react-dom';
        declare module 'next';
        declare module 'next/*';
        declare module 'next/document';
        declare module 'next/app';
        declare module 'next/head';
        declare module 'next/link';
        declare module 'next/router';
        declare module 'next/image';
        `,
        'file:///node_modules/@types/ambient-declarations/index.d.ts'
      );
    } catch (err) {
      console.warn('[Monaco] Failed to configure typescript defaults:', err);
    }
  }, []);

  // --- Render ---
  return (
    <div className="ide-root">
      {/* LEFT PANEL */}
      <div className="panel-left">
        {/* Header */}
        <div className="panel-header">
          <Bot size={20} className="header-icon" />
          <h1 className="header-title">AI Native Editor</h1>
          <button
            type="button"
            className="panel-header-settings-btn"
            onClick={() => handleOpenAISettings('models')}
            title="Open AI Control Center & Settings"
          >
            <SettingsIcon size={15} />
          </button>
        </div>

        {/* Workspace Indicator */}
        <WorkspaceIndicator
          workspace={workspace}
          onOpenProject={handleOpenProject}
          onNewProject={handleNewProject}
          onCloseProject={handleCloseProject}
        />

        {/* Explorer */}
        <div className="explorer-container">
          <Explorer
            status={explorerStatus}
            projectStructure={projectStructure}
            workspaceName={workspace.name}
            error={explorerError}
            onFileClick={loadFileContent}
            onRetry={loadProjectStructure}
            onOpenProject={handleOpenProject}
            onNewProject={handleNewProject}
            activeFilePath={activeFilePath}
            fileBadges={fileBadges}
          />
        </div>

        {/* Chat Scope Header */}
        <div className="chat-scope-header">
          <div className="chat-scope-info">
            {workspace.path ? (
              <>
                <FolderOpen size={14} className="chat-scope-icon text-amber" />
                <span className="chat-scope-title">
                  Project Chat: <span className="chat-scope-name">{workspace.name}</span>
                </span>
                <span className="chat-scope-pill pill-project">Project Memory</span>
              </>
            ) : (
              <>
                <Bot size={14} className="chat-scope-icon text-blue" />
                <span className="chat-scope-title">Normal Chat</span>
                <span className="chat-scope-pill pill-global">General Agent</span>
              </>
            )}
          </div>
          <div className="chat-scope-actions">
            {(isCurrentWorkspaceSession || messages.some((m) => (m.activities && m.activities.length > 0) || (m.changedFiles && m.changedFiles.length > 0))) && (
              <button
                className="chat-new-task-btn"
                title="Start a new task (clears previous task from view)"
                onClick={handleNewAgentSession}
              >
                <Plus size={12} />
                <span>New Task</span>
              </button>
            )}
            {messages.length > 0 && (
              <button
                className="chat-clear-btn"
                title="Clear this conversation"
                onClick={() => {
                  const key = getWorkspaceKey(workspace.path);
                  setMessages([]);
                  setAgentSession(null);
                  setDiffViewFile(null);
                  setChatsByWorkspace(prev => {
                    const next = { ...prev, [key]: [] };
                    persistChats(next);
                    return next;
                  });
                  axios.post(`${API}/workspace/chat-history`, {
                    workspace: workspace.path || '__global__',
                    messages: [],
                  }).catch(() => { });
                  axios.post(`${API}/ai/agent/reset`, { workspace: key }).catch(() => { });
                }}
              >
                <Trash2 size={13} />
                <span>Clear</span>
              </button>
            )}
          </div>
        </div>

        {/* Chat */}
        <div className="chat-container">
          {messages.length === 0 ? (
            <div className="chat-empty-state">
              <div className="chat-empty-icon">
                {workspace.path ? <FolderOpen size={30} /> : <Bot size={30} />}
              </div>
              <h3 className="chat-empty-title">
                {workspace.path
                  ? `Project Chat: ${workspace.name}`
                  : 'Normal Chat Mode'}
              </h3>
              <p className="chat-empty-desc">
                {workspace.path
                  ? 'Conversation is cached in memory for this project. Ask questions, plan edits, or instruct the agent.'
                  : 'You are chatting normally with the agent outside of any project. Open or create a project to work on code.'}
              </p>
              {!workspace.path && (
                <div className="chat-empty-actions">
                  <button className="empty-action-btn" onClick={handleOpenProject}>
                    <Folder size={14} /> Open Project
                  </button>
                  <button className="empty-action-btn btn-primary" onClick={handleNewProject}>
                    <Sparkles size={14} /> Create Project
                  </button>
                </div>
              )}
            </div>
          ) : (
            <>
              {messages.map((msg, i) => {
                const isLastAgentMessage =
                  msg.role === 'agent' &&
                  !messages.slice(i + 1).some((m) => m.role === 'agent');

                return (
                  <MessageRenderer
                    key={i}
                    msg={msg}
                    isLastAgentMessage={isLastAgentMessage}
                    activeSession={isCurrentWorkspaceSession ? agentSession : null}
                    onSelectDiff={handleSelectDiff}
                    onAcceptChange={handleAcceptChange}
                    onRejectChange={handleRejectChange}
                    onAcceptAll={handleAcceptAll}
                    onRejectAll={handleRejectAll}
                    diffViewFile={diffViewFile}
                    onNewSession={handleNewAgentSession}
                  />
                );
              })}

              {/* While agent is actively thinking/working before the response arrives */}
              {messages.length > 0 &&
                messages[messages.length - 1].role === 'user' &&
                isCurrentWorkspaceSession &&
                agentSession &&
                agentSession.activities &&
                agentSession.activities.length > 0 && (
                  <div className="msg-activities-wrapper msg-activities-active">
                    <AgentActivityTimeline
                      activities={agentSession.activities}
                      session={agentSession}
                      onSelectDiff={handleSelectDiff}
                      onNewSession={handleNewAgentSession}
                      hideHeader={true}
                      inline={true}
                    />
                  </div>
                )}
            </>
          )}
          <div ref={chatEndRef} />
        </div>

        {/* Live Agent Status & Stop Bar (Sections 52, 53) */}
        {isCurrentWorkspaceSession && (isAgentWorking || (agentSession && agentSession.status === 'idle' && (agentSession.changedFiles?.length ?? 0) > 0)) && (
          <div className="agent-live-status-bar">
            <div className="agent-live-status-left">
              {isAgentWorking ? (
                <>
                  <Loader2 size={13} className="text-blue animate-spin" />
                  <span>Agent working... ({agentSession?.status || 'active'})</span>
                </>
              ) : (
                <>
                  <Check size={13} className="text-green" />
                  <span>
                    Agent task completed · {agentSession?.changedFiles?.length || 0} files modified
                  </span>
                </>
              )}
            </div>
            {isAgentWorking && (
              <button
                className="agent-stop-btn"
                onClick={handleStopAgent}
                title="Stop active agent task"
              >
                <Square size={10} fill="currentColor" />
                <span>Stop</span>
              </button>
            )}
          </div>
        )}

        {/* Input */}
        <div className="input-container">
          <div className="input-wrapper">
            <input
              className="chat-input"
              placeholder="Ask anything, @ to mention, / for actions..."
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSend()}
            />
            <button onClick={handleSend} className="send-btn">
              <Send size={18} />
            </button>
          </div>
        </div>
      </div>

      {/* RIGHT PANEL */}
      <div className="panel-right">
        <div className="tab-bar">
          <div className="tab-filename">
            {diffViewFile ? `Diff: ${diffViewFile.path.split('/').pop() || diffViewFile.path}` : fileName}
          </div>

          {diffViewFile ? (
            <div className="diff-viewer-actions">
              <div className="diff-stat-pills">
                <span className="diff-pill additions">+{diffViewFile.additions}</span>
                <span className="diff-pill deletions">-{diffViewFile.deletions}</span>
              </div>
              <button
                className="diff-action-btn btn-accept-diff"
                onClick={() => handleAcceptChange(diffViewFile.path)}
                title="Accept changes in this file"
              >
                <Check size={12} />
                <span>Accept file</span>
              </button>
              <button
                className="diff-action-btn btn-reject-diff"
                onClick={() => handleRejectChange(diffViewFile.path)}
                title="Reject changes and revert this file"
              >
                <RotateCcw size={12} />
                <span>Reject file</span>
              </button>
              <button
                className="diff-action-btn btn-close-diff"
                onClick={handleCloseDiff}
                title="Close diff and return to editor"
              >
                <X size={12} />
                <span>Close Diff</span>
              </button>
            </div>
          ) : (
            activeTab === 'code' && (
              <div className="tab-formatter-group">
                <button
                  className="tab-format-btn"
                  onClick={() => handleFormatDocument()}
                  title="Format Document (Shift+Alt+F)"
                >
                  <Sparkles size={12} />
                  <span>Format</span>
                </button>

                <button
                  className={`tab-formatter-badge ${activeFormatter ? (activeFormatter.installed ? 'installed' : 'unavailable') : ''}`}
                  onClick={() => setFormatterModalOpen(true)}
                  title="Click to configure formatter"
                >
                  <span>
                    {activeLanguage} • {activeFormatter ? activeFormatter.name : 'No Formatter'}{' '}
                    {activeFormatter ? (activeFormatter.installed ? '✓' : '⚠') : ''}
                  </span>
                  <Sliders size={11} className="tab-badge-icon" />
                </button>
              </div>
            )
          )}

          <div className="tab-spacer" />

          {/* Model Selector in Tab Bar */}
          <ModelSelector
            activeModelId={activeModelId}
            models={availableModels}
            onSelectModel={handleSelectModel}
            onOpenSettings={handleOpenAISettings}
            contextPercentage={contextUsage?.percentage || 0}
          />

          <button
            data-tab="code"
            onClick={() => {
              setDiffViewFile(null);
              setActiveTab('code');
            }}
            className={`tab-btn ${activeTab === 'code' && !diffViewFile ? 'tab-active' : ''}`}
          >
            <Code size={14} /> Code
          </button>
          <button
            data-tab="browser"
            onClick={() => {
              setDiffViewFile(null);
              setActiveTab('browser');
            }}
            className={`tab-btn ${activeTab === 'browser' ? 'tab-active' : ''}`}
          >
            <Globe size={14} /> Browser
          </button>
          <button
            data-tab="inspect"
            onClick={() => {
              setDiffViewFile(null);
              setActiveTab('inspect');
            }}
            className={`tab-btn ${activeTab === 'inspect' ? 'tab-active' : ''}`}
          >
            <Activity size={14} /> Inspect
            {inspectErrorCount > 0 && (
              <span className="tab-error-badge">{inspectErrorCount}</span>
            )}
          </button>
          <button
            data-tab="images"
            onClick={() => {
              setDiffViewFile(null);
              setActiveTab('images');
            }}
            className={`tab-btn ${activeTab === 'images' ? 'tab-active' : ''}`}
          >
            <ImageIcon size={14} /> Images
          </button>
          <button
            data-tab="docs"
            onClick={() => {
              setDiffViewFile(null);
              setActiveTab('docs');
            }}
            className={`tab-btn ${activeTab === 'docs' ? 'tab-active' : ''}`}
          >
            <FileText size={14} /> Docs
          </button>
        </div>

        <div className="editor-area">
          <FormatterToast
            toast={formatterToast}
            onDismiss={() => setFormatterToast(null)}
          />

          {/* Context Alert Banner (Section 10) */}
          {!alertDismissed && contextUsage && contextUsage.threshold !== 'normal' && (
            <ContextAlertBanner
              currentModelName={contextUsage.modelName || activeModelId}
              usedTokens={contextUsage.usedTokens}
              maxTokens={contextUsage.maxTokens}
              percentage={contextUsage.percentage}
              threshold={contextUsage.threshold}
              recommendedAlternatives={contextUsage.recommendedAlternatives}
              onSwitchModel={handleSelectModel}
              onCompactContext={handleQuickCompact}
              onDismiss={() => setAlertDismissed(true)}
            />
          )}

          {diffViewFile ? (
            <DiffEditor
              height="100%"
              original={diffViewFile.originalContent}
              modified={diffViewFile.modifiedContent}
              language={getLanguageFromPath(diffViewFile.path)}
              theme="vs-dark"
              options={{
                fontSize: 14,
                readOnly: true,
                automaticLayout: true,
                minimap: { enabled: false },
                renderSideBySide: true,
                scrollBeyondLastLine: false,
              }}
            />
          ) : activeTab === 'code' ? (
            <Editor
              height="100%"
              path={activeFilePath || fileName || 'file.tsx'}
              language={activeLanguage}
              theme="vs-dark"
              value={code}
              onChange={(val) => setCode(val || '')}
              beforeMount={handleBeforeMount}
              options={{
                fontSize: 14,
                minimap: { enabled: false },
                scrollBeyondLastLine: false,
                automaticLayout: true,
                renderValidationDecorations: 'off',
              }}
            />
          ) : activeTab === 'browser' ? (
            <BrowserPanel
              tabs={browserTabs}
              activeTab={activeBrowserTab}
              onSelectTab={selectBrowserTab}
              onCloseTab={closeBrowserTab}
              onAddManualTab={addManualBrowserTab}
              onUpdateTabStatus={updateBrowserTabStatus}
              onRefreshServices={refreshBrowserServices}
            />
          ) : activeTab === 'inspect' ? (
            <InspectPanel
              initialPanel={activeInspectPanel}
              consoleLogs={consoleLogs}
              networkRequests={networkRequests}
              domTree={domTree}
              performanceMetrics={performanceMetrics}
              memoryMetrics={memoryMetrics}
              storageInspection={storageInspection}
              securityInspection={securityInspection}
              onClearConsole={() => setConsoleLogs([])}
              onRefresh={async () => {
                try {
                  const res = await axios.get(`${API}/inspect/state`);
                  if (res.data?.state) {
                    const s = res.data.state;
                    if (s.domTree) setDomTree(s.domTree);
                    if (s.consoleLogs) setConsoleLogs(s.consoleLogs);
                    if (s.networkRequests) setNetworkRequests(s.networkRequests);
                    if (s.performance) setPerformanceMetrics(s.performance);
                    if (s.memory) setMemoryMetrics(s.memory);
                    if (s.storage) setStorageInspection(s.storage);
                    if (s.security) setSecurityInspection(s.security);
                  }
                } catch {}
              }}
            />
          ) : activeTab === 'images' ? (
            <ImagesPanel
              activeImagePath={activeImagePath}
              screenshots={recentScreenshots}
              onSelectImage={(path) => setActiveImagePath(path)}
            />
          ) : activeTab === 'docs' ? (
            <DocsPanel
              activeDocPath={activeDocPath}
            />
          ) : null}
        </div>

        {/* AI Runtime Status Bar (Section 30) */}
        <AIRuntimeStatusBar
          modelName={contextUsage?.modelName || activeModelId}
          usedTokens={contextUsage?.usedTokens || 0}
          maxTokens={contextUsage?.maxTokens || 200000}
          contextPercentage={contextUsage?.percentage || 0}
          threshold={contextUsage?.threshold || 'normal'}
          skillsCount={skillsCount}
          toolsCount={toolsCount}
          connectorsCount={connectorsCount}
          onOpenSettings={handleOpenAISettings}
          onQuickCompact={handleQuickCompact}
        />
      </div>

      {/* Directory Picker Modal */}
      <DirectoryPicker
        isOpen={pickerOpen}
        title={pickerMode === 'new' ? 'Create New Project' : 'Open Project'}
        description={
          pickerMode === 'new'
            ? 'Choose a parent directory for your new project.'
            : 'Select the project directory to open.'
        }
        suggestedName={suggestedProjectName}
        showProjectName={pickerMode === 'new'}
        onSelect={handlePickerSelect}
        onCancel={() => setPickerOpen(false)}
      />

      {/* Formatter Configuration Modal */}
      <FormatterModal
        isOpen={formatterModalOpen}
        onClose={() => setFormatterModalOpen(false)}
        fileName={fileName}
        activeLanguage={activeLanguage}
        activeFormatter={activeFormatter}
        formatOnSave={formatOnSave}
        onToggleFormatOnSave={handleToggleFormatOnSave}
        onFormatDocument={() => {
          setFormatterModalOpen(false);
          handleFormatDocument();
        }}
        onSelectFormatter={handleSelectFormatter}
        allFormatters={allFormatters}
      />

      {/* AI Settings & Control Center Modal */}
      <AISettingsModal
        isOpen={aiSettingsModalOpen}
        onClose={() => setAiSettingsModalOpen(false)}
        initialTab={aiSettingsInitialTab}
        onModelSwitched={(mId) => {
          setActiveModelId(mId);
          fetchAISettings();
        }}
        workspacePath={workspace.path}
      />

      {/* Agent Permission Dialog Modal */}
      <AgentPermissionModal
        request={currentPermissionRequest}
        onSubmit={handlePermissionSubmit}
        onCancel={handlePermissionCancel}
      />

      {/* Visual Agent Cursor & Click Ripple Animation */}
      <AgentCursor cursorState={agentCursor} />
    </div>
  );
}
