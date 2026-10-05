import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import Editor, { DiffEditor } from '@monaco-editor/react';
import { io, Socket } from 'socket.io-client';
import { Send, Code, Globe, Bot, Folder, FolderOpen, Sparkles, Trash2, Sliders, Settings as SettingsIcon, Square, Check, RotateCcw, X, Loader2, Plus, Activity, Image as ImageIcon, FileText, History, Clock, GitCompare, FileCode, MoreVertical } from 'lucide-react';
import axios from 'axios';
import { MessageRenderer, type ChatMessage } from './components/MessageRenderer';
import { Explorer, getFileIcon, type ExplorerStatus, type FileNode } from './components/Explorer';
import { WorkspaceIndicator } from './components/WorkspaceIndicator';
import { DirectoryPicker } from './components/DirectoryPicker';
import { FormatterModal, type FormatterInfo } from './components/FormatterModal';
import { FormatterToast, type ToastMessage } from './components/FormatterToast';
import { AIRuntimeStatusBar } from './components/AIRuntimeStatusBar';
import { ContextAlertBanner } from './components/ContextAlertBanner';
import { AISettingsModal } from './components/AISettingsModal';
import { AgentActivityTimeline } from './components/AgentActivityTimeline';
import { ChangedFilesPanel } from './components/ChangedFilesPanel';
import { AgentSession, AgentActivity, ChangedFile } from './types/agent';
import { useWorkspace } from './hooks/useWorkspace';
import { useBrowserServices, type BrowserTab } from './hooks/useBrowserServices';
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

export interface OpenFileTab {
  path: string;
  name: string;
  content: string;
  savedContent: string;
  isModified: boolean;
  language: string;
}

let socket: Socket;
function getSocket(): Socket {
  if (!socket) {
    socket = io(SOCKET_URL);
  }
  return socket;
}

function sanitizeTaskMessages(messages: any[]): any[] {
  if (!Array.isArray(messages)) return [];
  return messages.map((msg) => {
    if (!msg || typeof msg !== 'object') return msg;
    const reviewTags = { ...(msg.fileReviewTags || {}) };
    let changedFiles = Array.isArray(msg.changedFiles) ? [...msg.changedFiles] : undefined;

    if (changedFiles && changedFiles.length > 0) {
      const reviewed = changedFiles.filter((f: any) => f && (f.status === 'accepted' || f.status === 'rejected'));
      for (const rf of reviewed) {
        if (rf.path) {
          reviewTags[rf.path] = rf.status;
        }
      }
    }

    if (changedFiles && Object.keys(reviewTags).length > 0) {
      changedFiles = changedFiles.filter((f: any) => {
        if (!f || !f.path) return false;
        const isReviewed = Object.keys(reviewTags).some(
          (p) => p === f.path || p.endsWith(f.path) || f.path.endsWith(p)
        );
        return !isReviewed;
      });
      if (changedFiles.length === 0) changedFiles = undefined;
    }

    return {
      ...msg,
      changedFiles,
      fileReviewTags: Object.keys(reviewTags).length > 0 ? reviewTags : undefined,
    };
  });
}

/**
 * Force-finalize ALL changedFiles in a message list.
 * Used when restoring a historical task — past sessions' file changes
 * should NEVER show accept/reject buttons since they can't be acted upon.
 * Any remaining changedFiles are moved to fileReviewTags as 'accepted' (historical).
 */
function finalizeHistoricalMessages(messages: any[]): any[] {
  if (!Array.isArray(messages)) return [];
  return messages.map((msg) => {
    if (!msg || typeof msg !== 'object') return msg;
    const reviewTags = { ...(msg.fileReviewTags || {}) };
    const changedFiles = Array.isArray(msg.changedFiles) ? msg.changedFiles : [];

    // Move ALL remaining changedFiles into reviewTags (they are historical)
    for (const f of changedFiles) {
      if (f && f.path) {
        // Preserve existing review status, default to 'accepted' for historical files
        if (!reviewTags[f.path]) {
          reviewTags[f.path] = f.status === 'rejected' ? 'rejected' : 'accepted';
        }
      }
    }

    return {
      ...msg,
      changedFiles: undefined, // Remove all changedFiles — they are now in reviewTags
      fileReviewTags: Object.keys(reviewTags).length > 0 ? reviewTags : undefined,
    };
  });
}

function updateMessageListWithFileReview(
  msgList: any[],
  filePath: string,
  status: 'accepted' | 'rejected'
): any[] {
  return msgList.map((msg) => {
    const hasFile = msg.changedFiles?.some(
      (f: any) => f.path === filePath || f.path.endsWith(filePath) || filePath.endsWith(f.path)
    );
    if (!hasFile) return msg;
    const remaining = (msg.changedFiles || []).filter(
      (f: any) => f.path !== filePath && !f.path.endsWith(filePath) && !filePath.endsWith(f.path)
    );
    const updatedTags = { ...(msg.fileReviewTags || {}), [filePath]: status };
    return {
      ...msg,
      changedFiles: remaining.length > 0 ? remaining : undefined,
      fileReviewTags: updatedTags,
    };
  });
}

function updateMessageListWithBulkReview(
  msgList: any[],
  paths: string[],
  status: 'accepted' | 'rejected'
): any[] {
  return msgList.map((msg) => {
    const hasAny = msg.changedFiles?.some(
      (f: any) => paths.length === 0 || paths.some((p: string) => f.path === p || f.path.endsWith(p) || p.endsWith(f.path))
    );
    if (!hasAny) return msg;
    const remaining = (msg.changedFiles || []).filter(
      (f: any) => paths.length > 0 && !paths.some((p: string) => f.path === p || f.path.endsWith(p) || p.endsWith(f.path))
    );
    const updatedTags = { ...(msg.fileReviewTags || {}) };
    const affectedFiles = paths.length > 0 ? paths : (msg.changedFiles || []).map((f: any) => f.path);
    for (const p of affectedFiles) {
      updatedTags[p] = status;
    }
    return {
      ...msg,
      changedFiles: remaining.length > 0 ? remaining : undefined,
      fileReviewTags: updatedTags,
    };
  });
}

function sanitizeTaskHistoryList(list: any[]): any[] {
  if (!Array.isArray(list)) return [];
  const sorted = [...list].sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
  const seenIds = new Set<string>();
  const seenKeys = new Set<string>();
  const deduped: any[] = [];
  for (const task of sorted) {
    if (!task || !task.id) continue;
    const msgs = Array.isArray(task.messages) ? task.messages : [];
    // Only recognize as part of history if the user input a chat to the agent
    const firstUserMsg = msgs.find((m: any) => m.role === 'user' && m.content && String(m.content).trim());
    if (!firstUserMsg) continue;
    const dedupKey = `${String(task.title || '').trim().toLowerCase()}::${String(firstUserMsg.content || '').trim().toLowerCase()}`;
    if (!seenIds.has(task.id) && !seenKeys.has(dedupKey)) {
      seenIds.add(task.id);
      seenKeys.add(dedupKey);
      deduped.push({
        ...task,
        messages: finalizeHistoricalMessages(sanitizeTaskMessages(msgs)),
      });
    }
  }
  return deduped;
}

export default function AIIDE() {
  // --- State ---
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [activeTab, setActiveTab] = useState<WorkspaceSurface>('code');
  const activeTabRef = useRef<WorkspaceSurface>(activeTab);
  activeTabRef.current = activeTab;
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

  // Formatter & active file state
  const [activeFilePath, setActiveFilePath] = useState('');
  const activeFilePathRef = useRef<string>('');
  activeFilePathRef.current = activeFilePath;

  // Open File Tabs State
  const [openFiles, setOpenFiles] = useState<OpenFileTab[]>([]);
  const openFilesRef = useRef<OpenFileTab[]>([]);
  openFilesRef.current = openFiles;

  const [openFilesByWorkspace, setOpenFilesByWorkspace] = useState<Record<string, { tabs: OpenFileTab[]; activePath: string }>>(() => {
    try {
      const saved = localStorage.getItem('ai_ide_open_files');
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });

  const persistOpenFiles = useCallback((cache: Record<string, { tabs: OpenFileTab[]; activePath: string }>) => {
    try {
      localStorage.setItem('ai_ide_open_files', JSON.stringify(cache));
    } catch {}
  }, []);

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

  const getWorkspaceKey = useCallback((p: string | null | undefined) => (!p || p === '__global__' ? 'global' : `proj:${p}`), []);

  // Multi-workspace chat cache
  const [chatsByWorkspace, setChatsByWorkspace] = useState<Record<string, ChatMessage[]>>(() => {
    try {
      const saved = localStorage.getItem('ai_ide_project_chats');
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });

  // Active task ID for current session (null = brand new unsaved session)
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);
  const activeTaskIdRef = useRef<string | null>(null);
  activeTaskIdRef.current = activeTaskId;

  // Sanitize and deduplicate task history: a task is ONLY valid if the user input a chat to the agent!
  const sanitizeTaskList = useCallback((list: any[]): any[] => sanitizeTaskHistoryList(list), []);

  // Task History cache per workspace
  const [tasksByWorkspace, setTasksByWorkspace] = useState<Record<string, {
    id: string;
    title: string;
    timestamp: number;
    messages: ChatMessage[];
    workspaceKey: string;
  }[]>>(() => {
    try {
      const saved = localStorage.getItem('ai_ide_task_history');
      if (saved) {
        const parsed = JSON.parse(saved);
        const cleaned: Record<string, any[]> = {};
        for (const [k, v] of Object.entries(parsed)) {
          if (!Array.isArray(v)) continue;
          cleaned[k] = sanitizeTaskHistoryList(v);
        }
        return cleaned;
      }
      return {};
    } catch {
      return {};
    }
  });
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [isChatMenuOpen, setIsChatMenuOpen] = useState(false);
  const historyDropdownRef = useRef<HTMLDivElement>(null);
  const historyButtonRef = useRef<HTMLButtonElement>(null);
  const chatMenuRef = useRef<HTMLDivElement>(null);

  const persistTasks = useCallback((updatedTasks: Record<string, any[]>) => {
    try {
      localStorage.setItem('ai_ide_task_history', JSON.stringify(updatedTasks));
    } catch { /* quota exceeded, etc */ }
  }, []);

  const formatRelativeTime = (ts: number): string => {
    const diffSec = Math.floor((Date.now() - ts) / 1000);
    if (diffSec < 60) return 'Just now';
    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffHr = Math.floor(diffMin / 60);
    if (diffHr < 24) return `${diffHr}h ago`;
    return new Date(ts).toLocaleDateString([], { month: 'short', day: 'numeric' });
  };

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
    navigateTab: navigateBrowserTab,
    updateTabStatus: updateBrowserTabStatus,
    refreshServices: refreshBrowserServices,
  } = useBrowserServices(socketRef);

  const browserTabsRef = useRef<BrowserTab[]>(browserTabs);
  browserTabsRef.current = browserTabs;
  const selectBrowserTabRef = useRef(selectBrowserTab);
  selectBrowserTabRef.current = selectBrowserTab;
  const addManualBrowserTabRef = useRef(addManualBrowserTab);
  addManualBrowserTabRef.current = addManualBrowserTab;
  const navigateBrowserTabRef = useRef(navigateBrowserTab);
  navigateBrowserTabRef.current = navigateBrowserTab;

  const navigateBrowserTo = useCallback((url: string, serviceTitle?: string) => {
    if (!url) return;
    setActiveTab('browser');
    const cleanUrl = url.trim();
    const currentTabs = browserTabsRef.current || [];
    const normalizedTarget = cleanUrl.replace(/\/+$/, '');
    const existing = currentTabs.find(
      (t) =>
        t.url === cleanUrl ||
        t.url.replace(/\/+$/, '') === normalizedTarget ||
        (t.port && cleanUrl.includes(`:${t.port}`))
    );
    if (existing) {
      if (existing.url !== cleanUrl) {
        navigateBrowserTabRef.current(existing.id, cleanUrl);
      } else {
        selectBrowserTabRef.current(existing.id);
      }
    } else {
      addManualBrowserTabRef.current(cleanUrl, serviceTitle || 'Browser');
    }
  }, []);

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

    if (isCurrent && activeTaskIdRef.current) {
      const currentId = activeTaskIdRef.current;
      setTasksByWorkspace(prev => {
        const existing = prev[key] || [];
        let updatedTask: any = null;
        const nextList = existing.map(t => {
          if (t.id === currentId) {
            updatedTask = {
              ...t,
              timestamp: Date.now(),
              messages: [...t.messages, msg],
            };
            return updatedTask;
          }
          return t;
        });
        if (updatedTask) {
          axios.post(`${API}/workspace/tasks`, {
            workspace: workspaceRef.current.path || '__global__',
            task: updatedTask,
          }).catch(() => {});
        }
        persistTasks({ ...prev, [key]: nextList });
        return { ...prev, [key]: nextList };
      });
    }
  }, [getWorkspaceKey, persistChats, persistTasks]);

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

  // --- File Tab Management ---
  const selectTab = useCallback((filePath: string) => {
    const tab = openFilesRef.current.find((t) => t.path === filePath);
    if (!tab) return;
    setActiveFilePath(tab.path);
    setFileName(tab.name);
    setCode(tab.content);
    setDiffViewFile(null);
    setActiveTab('code');
  }, []);

  const closeTab = useCallback((filePathToClose: string, e?: React.MouseEvent) => {
    if (e) {
      e.stopPropagation();
    }
    const currentTabs = openFilesRef.current;
    const closeIdx = currentTabs.findIndex((t) => t.path === filePathToClose);
    if (closeIdx === -1) return;

    const nextTabs = currentTabs.filter((t) => t.path !== filePathToClose);
    setOpenFiles(nextTabs);

    if (activeFilePathRef.current === filePathToClose) {
      if (nextTabs.length > 0) {
        const nextActiveIdx = Math.min(closeIdx, nextTabs.length - 1);
        const nextTab = nextTabs[nextActiveIdx];
        setActiveFilePath(nextTab.path);
        setFileName(nextTab.name);
        setCode(nextTab.content);
      } else {
        setActiveFilePath('');
        setFileName('');
        setCode('');
      }
    }
  }, []);

  const openFile = useCallback(
    async (
      filePath: string,
      customName?: string,
      initialContent?: string,
      shouldActivate: boolean = true
    ) => {
      if (!filePath) return;
      const name = customName || filePath.split('/').pop() || 'file';
      const existingTab = openFilesRef.current.find((t) => t.path === filePath);

      if (existingTab) {
        if (initialContent !== undefined && initialContent !== existingTab.content) {
          setOpenFiles((prev) =>
            prev.map((t) =>
              t.path === filePath
                ? { ...t, content: initialContent, savedContent: initialContent, isModified: false }
                : t
            )
          );
        }
        if (shouldActivate) {
          setActiveFilePath(existingTab.path);
          setFileName(existingTab.name);
          setCode(initialContent !== undefined ? initialContent : existingTab.content);
          setActiveTab('code');
          setDiffViewFile(null);
        }
        return;
      }

      let content = initialContent;
      if (content === undefined) {
        try {
          const res = await axios.get(`${API}/file-content?path=${encodeURIComponent(filePath)}`);
          content = res.data?.content ?? '';
        } catch (e) {
          console.error('[openFile] Failed to fetch content for', filePath, e);
          content = '// Unable to load file content';
        }
      }

      const newTab: OpenFileTab = {
        path: filePath,
        name,
        content,
        savedContent: content,
        isModified: false,
        language: getLanguageFromPath(filePath),
      };

      setOpenFiles((prev) => {
        if (prev.some((t) => t.path === filePath)) return prev;
        return [...prev, newTab];
      });

      if (shouldActivate) {
        setActiveFilePath(filePath);
        setFileName(name);
        setCode(content);
        setActiveTab('code');
        setDiffViewFile(null);
      }
    },
    []
  );

  const handleEditorChange = useCallback((newVal: string | undefined) => {
    const updatedVal = newVal ?? '';
    setCode(updatedVal);
    const curPath = activeFilePathRef.current;
    if (!curPath) return;

    setOpenFiles((prev) =>
      prev.map((tab) => {
        if (tab.path === curPath) {
          return {
            ...tab,
            content: updatedVal,
            isModified: updatedVal !== tab.savedContent,
          };
        }
        return tab;
      })
    );
  }, []);

  // --- Load file content (opens/activates tab) ---
  const loadFileContent = useCallback(
    async (filePath: string, name: string) => {
      await openFile(filePath, name, undefined, true);
    },
    [openFile]
  );

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
      const surface = wsState.activeSurface;
      if (surface) {
        // Only switch away from current non-code surface (browser, inspect, images, docs) to 'code'
        // if an active file was explicitly opened.
        // Never kick the user out of the browser or inspector panel unexpectedly!
        const isCurrentNonCode = activeTabRef.current && activeTabRef.current !== 'code';
        if (!isCurrentNonCode || surface !== 'code' || Boolean(wsState.activeFilePath)) {
          setActiveTab(surface);
        }
      }
      if (wsState.activeFilePath) {
        // CRITICAL: Only activate file tab if activeSurface is explicitly 'code' or unspecified.
        // Never hijack tab away when activeSurface is 'browser', 'inspect', 'images', or 'docs'!
        const shouldActivateFile = !surface || surface === 'code';
        openFile(wsState.activeFilePath, undefined, undefined, shouldActivateFile);
      }
      if (wsState.activeBrowserTab) {
        selectBrowserTabRef.current(wsState.activeBrowserTab);
      } else if (surface === 'browser' && wsState.activeBrowserUrl) {
        navigateBrowserTo(wsState.activeBrowserUrl, wsState.activeBrowserService || 'Backend');
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
          openFile(action.target, undefined, undefined, true);
        }
      } else if (action.type === 'open_browser') {
        triggerAgentCursor('browser', 'Opening Browser');
        setActiveTab('browser');
        const targetUrl = action.url || action.target || '';
        if (targetUrl) {
          navigateBrowserTo(targetUrl, action.serviceId || 'Backend');
        }
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
      const currentActivities = (data.activities && data.activities.length > 0)
        ? data.activities
        : (agentSessionRef.current?.activities ? [...agentSessionRef.current.activities] : undefined);
      const currentChangedFiles = (data.changedFiles && data.changedFiles.length > 0)
        ? data.changedFiles
        : (agentSessionRef.current?.changedFiles ? [...agentSessionRef.current.changedFiles] : undefined);
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

      // Synchronize file operations: if agent is accessing or modifying a file, open/activate tab
      const targetPath = (activity.metadata?.filePath as string) || (activity.metadata?.target as string) || (activity.details?.target as string) || (activity.path as string);
      if (
        targetPath &&
        typeof targetPath === 'string' &&
        !targetPath.startsWith('http://') &&
        !targetPath.startsWith('https://') &&
        (targetPath.includes('.') || targetPath.includes('/'))
      ) {
        const shouldActivate = (activity.type === 'editing' || activity.type === 'creating') && (!activeTabRef.current || activeTabRef.current === 'code');
        openFile(targetPath, undefined, undefined, shouldActivate);
      }
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

      // Synchronize open tabs with agent file changes
      for (const cf of changedFiles) {
        const filePath = cf.path;
        const name = cf.path.split('/').pop() || cf.path;
        const content = cf.modifiedContent || '';

        const existing = openFilesRef.current.find(
          (t) => t.path === filePath || t.path.endsWith(filePath) || filePath.endsWith(t.path)
        );
        if (existing) {
          setOpenFiles((prev) =>
            prev.map((t) =>
              t.path === existing.path
                ? { ...t, content, isModified: true }
                : t
            )
          );
          if (activeFilePathRef.current === existing.path) {
            setCode(content);
          }
        } else {
          const newTab: OpenFileTab = {
            path: filePath,
            name,
            content,
            savedContent: cf.originalContent || '',
            isModified: true,
            language: getLanguageFromPath(filePath),
          };
          setOpenFiles((prev) => {
            if (prev.some((t) => t.path === filePath || t.path.endsWith(filePath) || filePath.endsWith(t.path))) return prev;
            return [...prev, newTab];
          });
          if (!activeFilePathRef.current) {
            setActiveFilePath(filePath);
            setFileName(name);
            setCode(content);
          }
        }
      }
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

      if (oldKey) {
        setOpenFilesByWorkspace((prev) => {
          const updated = {
            ...prev,
            [oldKey]: { tabs: openFilesRef.current, activePath: activeFilePathRef.current },
          };
          persistOpenFiles(updated);
          return updated;
        });
      }
    }

    prevWorkspaceKeyRef.current = newKey;

    // Load open files for active workspace
    const cachedTabsObj = openFilesByWorkspace[newKey];
    if (cachedTabsObj && cachedTabsObj.tabs.length > 0) {
      setOpenFiles(cachedTabsObj.tabs);
      const active = cachedTabsObj.tabs.find((t) => t.path === cachedTabsObj.activePath) || cachedTabsObj.tabs[0];
      setActiveFilePath(active.path);
      setFileName(active.name);
      setCode(active.content);
    } else {
      setOpenFiles([]);
      setActiveFilePath('');
      setFileName('');
      setCode('// Select a file to view code');
    }

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

    // 3. Sync tasks history from backend
    const wsTasksQuery = workspace.path ? `?workspace=${encodeURIComponent(workspace.path)}` : '?workspace=__global__';
    axios
      .get(`${API}/workspace/tasks${wsTasksQuery}`)
      .then(res => {
        if (res.data?.tasks && Array.isArray(res.data.tasks)) {
          setTasksByWorkspace(prev => {
            const currentList = prev[newKey] || [];
            const merged = sanitizeTaskList([...res.data.tasks, ...currentList]);
            merged.sort((a, b) => b.timestamp - a.timestamp);
            const next = { ...prev, [newKey]: merged };
            persistTasks(next);
            return next;
          });
        }
      })
      .catch(() => {});

    loadProjectStructure();
  }, [workspace.path, getWorkspaceKey, loadProjectStructure, persistChats, persistTasks, sanitizeTaskList]);

  // Close 3-dot Chat Menu and Task History dropdown on outside click
  useEffect(() => {
    if (!isHistoryOpen && !isChatMenuOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        chatMenuRef.current &&
        !chatMenuRef.current.contains(target)
      ) {
        setIsChatMenuOpen(false);
        setIsHistoryOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isHistoryOpen, isChatMenuOpen]);

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
          setOpenFiles((prev) =>
            prev.map((t) =>
              t.path === activeFilePath
                ? { ...t, content: result.formatted, isModified: result.formatted !== t.savedContent }
                : t
            )
          );
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

  const handleSaveFile = useCallback(async () => {
    const currentTabs = openFilesRef.current;
    const currentPath = activeFilePathRef.current;
    if (!currentPath) return;
    const tab = currentTabs.find((t) => t.path === currentPath);
    if (!tab) return;

    try {
      await axios.post(`${API}/file-content`, {
        path: tab.path,
        content: tab.content,
      });
      setOpenFiles((prev) =>
        prev.map((t) =>
          t.path === currentPath
            ? { ...t, savedContent: t.content, isModified: false }
            : t
        )
      );
      setFormatterToast({
        type: 'success',
        text: `Saved ${tab.name} ✓`,
      });
      setTimeout(() => {
        setFormatterToast((prev) => (prev?.type === 'success' ? null : prev));
      }, 2000);

      if (formatOnSave) {
        handleFormatDocument();
      }
    } catch (e: any) {
      console.error('Failed to save file:', e);
      setFormatterToast({
        type: 'error',
        text: `Failed to save file: ${e.response?.data?.error || e.message}`,
      });
    }
  }, [formatOnSave, handleFormatDocument]);

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

  const handleInstallFormatter = useCallback(async (id: string) => {
    try {
      const res = await axios.post(`${API}/formatters/install/${id}`);
      if (res.data?.formatters) {
        setAllFormatters(res.data.formatters);
      } else {
        const fRes = await axios.get(`${API}/formatters`);
        if (fRes.data?.formatters) {
          setAllFormatters(fRes.data.formatters);
        }
      }
      setFormatterToast({
        type: 'success',
        text: `Formatter ${id} installed successfully ✓`,
      });
      setTimeout(() => {
        setFormatterToast((prev) => (prev?.type === 'success' ? null : prev));
      }, 3000);
    } catch (err: any) {
      console.error(`[Format] Failed to install formatter ${id}:`, err);
      const errMsg = err?.response?.data?.error || err?.message || 'Installation failed';
      setFormatterToast({
        type: 'error',
        text: `Failed to install ${id}: ${errMsg}`,
      });
      throw err;
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

      // Save (Cmd + S or Ctrl + S)
      if ((e.metaKey || e.ctrlKey) && (e.key === 's' || e.key === 'S')) {
        e.preventDefault();
        handleSaveFile();
        return;
      }

      // Close Tab (Cmd + W or Ctrl + W)
      if ((e.metaKey || e.ctrlKey) && (e.key === 'w' || e.key === 'W')) {
        if (activeFilePathRef.current) {
          e.preventDefault();
          closeTab(activeFilePathRef.current);
          return;
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleFormatDocument, handleSaveFile, closeTab]);

  // --- Handlers ---
  const handleSend = useCallback(async () => {
    if (!input.trim()) return;
    const text = input.trim();
    setInput('');
    const userMsg: ChatMessage = { role: 'user', content: text };
    addMessage(userMsg);

    const wsKey = getWorkspaceKey(workspace.path);

    // CRITICAL: A task is ONLY recognized as part of history when the user inputs a chat to the agent!
    let currentTaskId = activeTaskIdRef.current;
    if (!currentTaskId) {
      currentTaskId = `task_${Date.now()}`;
      activeTaskIdRef.current = currentTaskId;
      setActiveTaskId(currentTaskId);
      const cleanTitle = text.replace(/\n+/g, ' ').trim().slice(0, 50) || 'Task';
      const newTask = {
        id: currentTaskId,
        title: cleanTitle,
        timestamp: Date.now(),
        messages: [userMsg],
        workspaceKey: wsKey,
      };
      setTasksByWorkspace(prev => {
        const existing = prev[wsKey] || [];
        const nextList = [newTask, ...existing.filter(t => t.id !== currentTaskId)].slice(0, 50);
        const next = { ...prev, [wsKey]: nextList };
        persistTasks(next);
        return next;
      });
      axios.post(`${API}/workspace/tasks`, {
        workspace: workspace.path || '__global__',
        task: newTask,
      }).catch(() => {});
    }

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
  }, [input, workspace, messages, addMessage, getWorkspaceKey, persistTasks]);

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
    setMessages(chatsByWorkspace['global'] || chatsByWorkspace['__global__'] || []);
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

      // Record in recent workspaces
      try {
        const finalPath = (pickerMode === 'new' && projectName) ? `${dirPath}/${projectName}` : dirPath;
        const stored = localStorage.getItem('ai_native_recent_workspaces');
        const list = stored ? JSON.parse(stored) : [];
        const name = finalPath.split('/').filter(Boolean).pop() || finalPath;
        const next = [{ path: finalPath, name, lastOpened: Date.now() }, ...list.filter((w: any) => w.path !== finalPath)].slice(0, 20);
        localStorage.setItem('ai_native_recent_workspaces', JSON.stringify(next));
        axios.post(`${API}/workspace/recent`, { path: finalPath }).catch(() => {});
      } catch { /* ignore */ }

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

  const handleAcceptChange = useCallback((filePath: string, fileObj?: ChangedFile) => {
    const targetFile = fileObj || agentSession?.changedFiles?.find(f => f.path === filePath || f.path.endsWith(filePath) || filePath.endsWith(f.path));
    const payload = {
      path: filePath,
      modifiedContent: targetFile?.modifiedContent,
      workspace: workspace.path,
    };
    const sock = socketRef.current || getSocket();
    sock.emit('accept_change', payload);
    axios
      .post(`${API}/ai/agent/accept-change`, payload)
      .then((res) => {
        if (res.data?.session) setAgentSession(res.data.session);
      })
      .catch(() => {});

    const wsKey = getWorkspaceKey(workspace.path);
    const wsTarget = workspace.path || '__global__';

    // 1. Update active messages state & sync chat-history
    setMessages((prev) => {
      const updated = updateMessageListWithFileReview(prev, filePath, 'accepted');
      axios.post(`${API}/workspace/chat-history`, {
        workspace: wsTarget,
        messages: updated,
      }).catch(() => {});
      return updated;
    });

    // 2. Update workspace chats cache & localStorage
    setChatsByWorkspace((prev) => {
      const existing = prev[wsKey] || [];
      const updated = updateMessageListWithFileReview(existing, filePath, 'accepted');
      const next = { ...prev, [wsKey]: updated };
      persistChats(next);
      return next;
    });

    // 3. Update tasks in history & backend
    setTasksByWorkspace((prev) => {
      const existing = prev[wsKey] || [];
      const currentTaskId = activeTaskIdRef.current;
      let anyTaskUpdated = false;
      const nextList = existing.map((t) => {
        const isCurrent = currentTaskId && t.id === currentTaskId;
        const containsFile = t.messages?.some((m: any) =>
          m.changedFiles?.some((f: any) => f.path === filePath || f.path.endsWith(filePath) || filePath.endsWith(f.path))
        );
        if (isCurrent || containsFile) {
          anyTaskUpdated = true;
          const updatedTask = {
            ...t,
            messages: updateMessageListWithFileReview(t.messages || [], filePath, 'accepted'),
          };
          axios.post(`${API}/workspace/tasks`, {
            workspace: wsTarget,
            task: updatedTask,
          }).catch(() => {});
          return updatedTask;
        }
        return t;
      });
      if (anyTaskUpdated) {
        const next = { ...prev, [wsKey]: nextList };
        persistTasks(next);
        return next;
      }
      return prev;
    });

    setAgentSession((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        changedFiles: (prev.changedFiles || []).filter(f => f.path !== filePath && !f.path.endsWith(filePath) && !filePath.endsWith(f.path)),
        pendingChanges: (prev.pendingChanges || []).filter(f => f.path !== filePath && !f.path.endsWith(filePath) && !filePath.endsWith(f.path)),
      };
    });

    // Update open tabs if this file is open
    setOpenFiles((prev) =>
      prev.map((t) => {
        if (t.path === filePath || t.path.endsWith(filePath) || filePath.endsWith(t.path)) {
          return {
            ...t,
            content: targetFile?.modifiedContent ?? t.content,
            savedContent: targetFile?.modifiedContent ?? t.content,
            isModified: false,
          };
        }
        return t;
      })
    );
    if (activeFilePathRef.current === filePath || activeFilePathRef.current.endsWith(filePath) || filePath.endsWith(activeFilePathRef.current)) {
      if (targetFile?.modifiedContent !== undefined) {
        setCode(targetFile.modifiedContent);
      }
    }

    if (diffViewFile?.path === filePath || diffViewFile?.path.endsWith(filePath) || filePath.endsWith(diffViewFile?.path || '')) {
      setDiffViewFile(null);
    }
    loadProjectStructure();
  }, [agentSession, diffViewFile, workspace.path, getWorkspaceKey, persistChats, persistTasks, loadProjectStructure]);

  const handleRejectChange = useCallback((filePath: string, fileObj?: ChangedFile) => {
    const targetFile = fileObj || agentSession?.changedFiles?.find(f => f.path === filePath || f.path.endsWith(filePath) || filePath.endsWith(f.path));
    const payload = {
      path: filePath,
      originalContent: targetFile?.originalContent,
      workspace: workspace.path,
    };
    const sock = socketRef.current || getSocket();
    sock.emit('reject_change', payload);
    axios
      .post(`${API}/ai/agent/reject-change`, payload)
      .then((res) => {
        if (res.data?.session) setAgentSession(res.data.session);
      })
      .catch(() => {});

    const wsKey = getWorkspaceKey(workspace.path);
    const wsTarget = workspace.path || '__global__';

    // 1. Update active messages state & sync chat-history
    setMessages((prev) => {
      const updated = updateMessageListWithFileReview(prev, filePath, 'rejected');
      axios.post(`${API}/workspace/chat-history`, {
        workspace: wsTarget,
        messages: updated,
      }).catch(() => {});
      return updated;
    });

    // 2. Update workspace chats cache & localStorage
    setChatsByWorkspace((prev) => {
      const existing = prev[wsKey] || [];
      const updated = updateMessageListWithFileReview(existing, filePath, 'rejected');
      const next = { ...prev, [wsKey]: updated };
      persistChats(next);
      return next;
    });

    // 3. Update tasks in history & backend
    setTasksByWorkspace((prev) => {
      const existing = prev[wsKey] || [];
      const currentTaskId = activeTaskIdRef.current;
      let anyTaskUpdated = false;
      const nextList = existing.map((t) => {
        const isCurrent = currentTaskId && t.id === currentTaskId;
        const containsFile = t.messages?.some((m: any) =>
          m.changedFiles?.some((f: any) => f.path === filePath || f.path.endsWith(filePath) || filePath.endsWith(f.path))
        );
        if (isCurrent || containsFile) {
          anyTaskUpdated = true;
          const updatedTask = {
            ...t,
            messages: updateMessageListWithFileReview(t.messages || [], filePath, 'rejected'),
          };
          axios.post(`${API}/workspace/tasks`, {
            workspace: wsTarget,
            task: updatedTask,
          }).catch(() => {});
          return updatedTask;
        }
        return t;
      });
      if (anyTaskUpdated) {
        const next = { ...prev, [wsKey]: nextList };
        persistTasks(next);
        return next;
      }
      return prev;
    });

    setAgentSession((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        changedFiles: (prev.changedFiles || []).filter(f => f.path !== filePath && !f.path.endsWith(filePath) && !filePath.endsWith(f.path)),
        pendingChanges: (prev.pendingChanges || []).filter(f => f.path !== filePath && !f.path.endsWith(filePath) && !filePath.endsWith(f.path)),
      };
    });

    // Update open tabs if this file is open
    setOpenFiles((prev) =>
      prev.map((t) => {
        if (t.path === filePath || t.path.endsWith(filePath) || filePath.endsWith(t.path)) {
          return {
            ...t,
            content: targetFile?.originalContent ?? t.content,
            savedContent: targetFile?.originalContent ?? t.content,
            isModified: false,
          };
        }
        return t;
      })
    );
    if (activeFilePathRef.current === filePath || activeFilePathRef.current.endsWith(filePath) || filePath.endsWith(activeFilePathRef.current)) {
      if (targetFile?.originalContent !== undefined) {
        setCode(targetFile.originalContent);
      }
    }

    if (diffViewFile?.path === filePath || diffViewFile?.path.endsWith(filePath) || filePath.endsWith(diffViewFile?.path || '')) {
      setDiffViewFile(null);
    }
    loadProjectStructure();
  }, [agentSession, diffViewFile, workspace.path, getWorkspaceKey, persistChats, persistTasks, loadProjectStructure]);

  const handleAcceptAll = useCallback((filesList?: ChangedFile[]) => {
    const filesToAccept = filesList && filesList.length > 0
      ? filesList
      : (agentSession?.changedFiles && agentSession.changedFiles.length > 0 ? agentSession.changedFiles : []);
    const payload = {
      files: filesToAccept,
      workspace: workspace.path,
    };
    const sock = socketRef.current || getSocket();
    sock.emit('accept_all_changes', payload);
    axios
      .post(`${API}/ai/agent/accept-all`, payload)
      .then((res) => {
        if (res.data?.session) setAgentSession(res.data.session);
      })
      .catch(() => {});

    const paths = filesToAccept.map(f => f.path);
    const wsKey = getWorkspaceKey(workspace.path);
    const wsTarget = workspace.path || '__global__';

    // 1. Update active messages state & sync chat-history
    setMessages((prev) => {
      const updated = updateMessageListWithBulkReview(prev, paths, 'accepted');
      axios.post(`${API}/workspace/chat-history`, {
        workspace: wsTarget,
        messages: updated,
      }).catch(() => {});
      return updated;
    });

    // 2. Update workspace chats cache & localStorage
    setChatsByWorkspace((prev) => {
      const existing = prev[wsKey] || [];
      const updated = updateMessageListWithBulkReview(existing, paths, 'accepted');
      const next = { ...prev, [wsKey]: updated };
      persistChats(next);
      return next;
    });

    // 3. Update tasks in history & backend
    setTasksByWorkspace((prev) => {
      const existing = prev[wsKey] || [];
      const currentTaskId = activeTaskIdRef.current;
      let anyTaskUpdated = false;
      const nextList = existing.map((t) => {
        const isCurrent = currentTaskId && t.id === currentTaskId;
        const containsFile = t.messages?.some((m: any) =>
          m.changedFiles?.some((f: any) => paths.length === 0 || paths.some((p: string) => f.path === p || f.path.endsWith(p) || p.endsWith(f.path)))
        );
        if (isCurrent || containsFile) {
          anyTaskUpdated = true;
          const updatedTask = {
            ...t,
            messages: updateMessageListWithBulkReview(t.messages || [], paths, 'accepted'),
          };
          axios.post(`${API}/workspace/tasks`, {
            workspace: wsTarget,
            task: updatedTask,
          }).catch(() => {});
          return updatedTask;
        }
        return t;
      });
      if (anyTaskUpdated) {
        const next = { ...prev, [wsKey]: nextList };
        persistTasks(next);
        return next;
      }
      return prev;
    });

    setAgentSession((prev) => {
      if (!prev) return prev;
      return { ...prev, changedFiles: [], pendingChanges: [] };
    });

    // Update open tabs
    setOpenFiles((prev) =>
      prev.map((t) => {
        const matching = filesToAccept.find((f) => f.path === t.path || f.path.endsWith(t.path) || t.path.endsWith(f.path));
        if (matching && matching.modifiedContent !== undefined) {
          return {
            ...t,
            content: matching.modifiedContent,
            savedContent: matching.modifiedContent,
            isModified: false,
          };
        }
        return t;
      })
    );
    const activeMatchAccept = filesToAccept.find((f) => f.path === activeFilePathRef.current || f.path.endsWith(activeFilePathRef.current) || activeFilePathRef.current.endsWith(f.path));
    if (activeMatchAccept && activeMatchAccept.modifiedContent !== undefined) {
      setCode(activeMatchAccept.modifiedContent);
    }

    setDiffViewFile(null);
    loadProjectStructure();
  }, [agentSession, workspace.path, getWorkspaceKey, persistChats, persistTasks, loadProjectStructure]);

  const handleRejectAll = useCallback((filesList?: ChangedFile[]) => {
    const filesToReject = filesList && filesList.length > 0
      ? filesList
      : (agentSession?.changedFiles && agentSession.changedFiles.length > 0 ? agentSession.changedFiles : []);
    const payload = {
      files: filesToReject,
      workspace: workspace.path,
    };
    const sock = socketRef.current || getSocket();
    sock.emit('reject_all_changes', payload);
    axios
      .post(`${API}/ai/agent/reject-all`, payload)
      .then((res) => {
        if (res.data?.session) setAgentSession(res.data.session);
      })
      .catch(() => {});

    const paths = filesToReject.map(f => f.path);
    const wsKey = getWorkspaceKey(workspace.path);
    const wsTarget = workspace.path || '__global__';

    // 1. Update active messages state & sync chat-history
    setMessages((prev) => {
      const updated = updateMessageListWithBulkReview(prev, paths, 'rejected');
      axios.post(`${API}/workspace/chat-history`, {
        workspace: wsTarget,
        messages: updated,
      }).catch(() => {});
      return updated;
    });

    // 2. Update workspace chats cache & localStorage
    setChatsByWorkspace((prev) => {
      const existing = prev[wsKey] || [];
      const updated = updateMessageListWithBulkReview(existing, paths, 'rejected');
      const next = { ...prev, [wsKey]: updated };
      persistChats(next);
      return next;
    });

    // 3. Update tasks in history & backend
    setTasksByWorkspace((prev) => {
      const existing = prev[wsKey] || [];
      const currentTaskId = activeTaskIdRef.current;
      let anyTaskUpdated = false;
      const nextList = existing.map((t) => {
        const isCurrent = currentTaskId && t.id === currentTaskId;
        const containsFile = t.messages?.some((m: any) =>
          m.changedFiles?.some((f: any) => paths.length === 0 || paths.some((p: string) => f.path === p || f.path.endsWith(p) || p.endsWith(f.path)))
        );
        if (isCurrent || containsFile) {
          anyTaskUpdated = true;
          const updatedTask = {
            ...t,
            messages: updateMessageListWithBulkReview(t.messages || [], paths, 'rejected'),
          };
          axios.post(`${API}/workspace/tasks`, {
            workspace: wsTarget,
            task: updatedTask,
          }).catch(() => {});
          return updatedTask;
        }
        return t;
      });
      if (anyTaskUpdated) {
        const next = { ...prev, [wsKey]: nextList };
        persistTasks(next);
        return next;
      }
      return prev;
    });

    setAgentSession((prev) => {
      if (!prev) return prev;
      return { ...prev, changedFiles: [], pendingChanges: [] };
    });

    // Update open tabs
    setOpenFiles((prev) =>
      prev.map((t) => {
        const matching = filesToReject.find((f) => f.path === t.path || f.path.endsWith(t.path) || t.path.endsWith(f.path));
        if (matching && matching.originalContent !== undefined) {
          return {
            ...t,
            content: matching.originalContent,
            savedContent: matching.originalContent,
            isModified: false,
          };
        }
        return t;
      })
    );
    const activeMatchReject = filesToReject.find((f) => f.path === activeFilePathRef.current || f.path.endsWith(activeFilePathRef.current) || activeFilePathRef.current.endsWith(f.path));
    if (activeMatchReject && activeMatchReject.originalContent !== undefined) {
      setCode(activeMatchReject.originalContent);
    }

    setDiffViewFile(null);
    loadProjectStructure();
  }, [agentSession, workspace.path, getWorkspaceKey, persistChats, persistTasks, loadProjectStructure]);

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
    const wsKey = getWorkspaceKey(workspace.path);

    // CRITICAL: Creating a new task should NEVER push or archive anything to history!
    // A task should ONLY be recognized as part of history if the user input a chat to the agent.
    activeTaskIdRef.current = null;
    setActiveTaskId(null);
    setMessages([]);
    setAgentSession(null);
    setDiffViewFile(null);
    setIsHistoryOpen(false);

    setChatsByWorkspace(prev => {
      const next = { ...prev, [wsKey]: [] };
      persistChats(next);
      return next;
    });

    try {
      await axios.post(`${API}/workspace/chat-history`, {
        workspace: workspace.path || '__global__',
        messages: [],
      });
      await axios.post(`${API}/ai/agent/reset`, { workspace: wsKey });
      const sock = socketRef.current || getSocket();
      sock.emit('new_agent_session', { workspace: wsKey });
    } catch (e) {
      console.error('Failed to reset session:', e);
    }
  }, [workspace.path, getWorkspaceKey, persistChats]);

  const handleRestoreTask = useCallback((task: any) => {
    const wsKey = getWorkspaceKey(workspace.path);
    // First sanitize (dedup reviewed files), then finalize ALL remaining changedFiles
    // so historical tasks NEVER show accept/reject buttons
    const sanitizedMessages = finalizeHistoricalMessages(sanitizeTaskMessages(task.messages || []));

    // Load selected task into active session without spurious auto-archiving
    activeTaskIdRef.current = task.id;
    setActiveTaskId(task.id);
    setMessages(sanitizedMessages);
    setAgentSession(null);
    setDiffViewFile(null);
    setChatsByWorkspace(prev => {
      const next = { ...prev, [wsKey]: sanitizedMessages };
      persistChats(next);
      return next;
    });

    axios.post(`${API}/workspace/chat-history`, {
      workspace: workspace.path || '__global__',
      messages: sanitizedMessages,
    }).catch(() => {});

    setIsHistoryOpen(false);
  }, [workspace.path, getWorkspaceKey, persistChats]);

  const handleDeleteTask = useCallback((taskId: string) => {
    const wsKey = getWorkspaceKey(workspace.path);
    setTasksByWorkspace(prev => {
      const currentList = prev[wsKey] || [];
      const nextList = currentList.filter(t => t.id !== taskId);
      const next = { ...prev, [wsKey]: nextList };
      persistTasks(next);
      return next;
    });

    // If the active task was deleted, clear current conversation view
    if (activeTaskIdRef.current === taskId) {
      activeTaskIdRef.current = null;
      setActiveTaskId(null);
      setMessages([]);
      setAgentSession(null);
      setDiffViewFile(null);
      setChatsByWorkspace(prev => {
        const next = { ...prev, [wsKey]: [] };
        persistChats(next);
        return next;
      });
      axios.post(`${API}/workspace/chat-history`, {
        workspace: workspace.path || '__global__',
        messages: [],
      }).catch(() => {});
    }

    axios.delete(`${API}/workspace/tasks/${encodeURIComponent(taskId)}?workspace=${encodeURIComponent(workspace.path || '__global__')}`).catch(() => {});
  }, [workspace.path, getWorkspaceKey, persistTasks, persistChats]);

  const handleClearChat = useCallback(async () => {
    const wsKey = getWorkspaceKey(workspace.path);
    activeTaskIdRef.current = null;
    setActiveTaskId(null);
    setMessages([]);
    setAgentSession(null);
    setDiffViewFile(null);
    setChatsByWorkspace(prev => {
      const next = { ...prev, [wsKey]: [] };
      persistChats(next);
      return next;
    });
    try {
      await axios.post(`${API}/workspace/chat-history`, {
        workspace: workspace.path || '__global__',
        messages: [],
      });
      await axios.post(`${API}/ai/agent/reset`, { workspace: wsKey });
    } catch { /* ignore */ }
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
            onClick={() => handleOpenAISettings('routing')}
            title="Open AI Control Center & Settings"
            aria-label="Open AI Settings"
          >
            <SettingsIcon size={16} color="#ffffff" />
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
          <div className="chat-scope-actions" ref={chatMenuRef}>
            {/* 3-Dot Menu Trigger Button */}
            <button
              ref={historyButtonRef}
              type="button"
              className={`chat-menu-trigger-btn ${isChatMenuOpen || isHistoryOpen ? 'active' : ''}`}
              title="Chat Options (History, New Task, Clear)"
              onClick={(e) => {
                e.stopPropagation();
                if (isHistoryOpen) {
                  setIsHistoryOpen(false);
                  setIsChatMenuOpen(false);
                } else {
                  setIsChatMenuOpen(prev => !prev);
                }
              }}
            >
              <MoreVertical size={16} />
              {(tasksByWorkspace[getWorkspaceKey(workspace.path)] || []).length > 0 && (
                <span className="task-count-badge chat-menu-badge">
                  {(tasksByWorkspace[getWorkspaceKey(workspace.path)] || []).length}
                </span>
              )}
            </button>

            {/* 3-Dot Options Dropdown */}
            {isChatMenuOpen && (
              <div
                className="chat-options-dropdown"
                onClick={(e) => e.stopPropagation()}
              >
                {/* 1. History Option */}
                <button
                  type="button"
                  className="chat-menu-item"
                  onClick={() => {
                    setIsChatMenuOpen(false);
                    setIsHistoryOpen(true);
                  }}
                  title="Task History (Load previous tasks)"
                >
                  <div className="chat-menu-item-left">
                    <History size={13} className="text-amber" />
                    <span>History</span>
                  </div>
                  {(tasksByWorkspace[getWorkspaceKey(workspace.path)] || []).length > 0 && (
                    <span className="task-count-badge">
                      {(tasksByWorkspace[getWorkspaceKey(workspace.path)] || []).length}
                    </span>
                  )}
                </button>

                {/* 2. New Task Option */}
                <button
                  type="button"
                  className="chat-menu-item"
                  onClick={() => {
                    setIsChatMenuOpen(false);
                    handleNewAgentSession();
                  }}
                  title="Start a new task"
                >
                  <div className="chat-menu-item-left">
                    <Plus size={13} className="text-blue" />
                    <span>New Task</span>
                  </div>
                </button>

                <div className="chat-menu-divider" />

                {/* 3. Clear Chat Option */}
                <button
                  type="button"
                  className={`chat-menu-item chat-menu-item-danger ${messages.length === 0 ? 'disabled' : ''}`}
                  disabled={messages.length === 0}
                  onClick={() => {
                    if (messages.length === 0) return;
                    setIsChatMenuOpen(false);
                    handleClearChat();
                  }}
                  title="Clear current conversation"
                >
                  <div className="chat-menu-item-left">
                    <Trash2 size={13} />
                    <span>Clear</span>
                  </div>
                </button>
              </div>
            )}

          {/* Task History Dropdown Menu */}
          {isHistoryOpen && (
            <div
              className="task-history-dropdown"
              ref={historyDropdownRef}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="task-history-header">
                <div className="task-history-title">
                  <History size={13} className="text-amber" />
                  <span>Task History</span>
                  <span className="task-history-badge">
                    {(tasksByWorkspace[getWorkspaceKey(workspace.path)] || []).length}
                  </span>
                </div>
                <button
                  type="button"
                  className="task-history-close-btn"
                  onClick={() => setIsHistoryOpen(false)}
                  title="Close History"
                >
                  <X size={13} />
                </button>
              </div>

              <div className="task-history-list">
                {(tasksByWorkspace[getWorkspaceKey(workspace.path)] || []).length === 0 ? (
                  <div className="task-history-empty">
                    <Clock size={24} className="task-history-empty-icon" />
                    <p className="task-history-empty-text">No previous tasks yet</p>
                    <span className="task-history-empty-sub">
                      Tasks are recognized here once you send a chat message to the agent.
                    </span>
                  </div>
                ) : (
                  (tasksByWorkspace[getWorkspaceKey(workspace.path)] || []).map((task) => (
                    <div
                      key={task.id}
                      className={`task-history-item ${activeTaskId === task.id ? 'active' : ''}`}
                      onClick={() => handleRestoreTask(task)}
                      title={`Load previous task: ${task.title}`}
                    >
                      <div className="task-history-item-content">
                        <div className="task-history-item-title">{task.title}</div>
                        <div className="task-history-item-meta">
                          <span className="task-history-item-time">{formatRelativeTime(task.timestamp)}</span>
                          <span className="task-history-item-count">
                            {task.messages.length} msg{task.messages.length === 1 ? '' : 's'}
                          </span>
                        </div>
                      </div>
                      <button
                        type="button"
                        className="task-history-item-del-btn"
                        title="Delete task from history"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteTask(task.id);
                        }}
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>
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
          <div className="surface-info">
            <div className="surface-tag">
              {activeTab === 'code' ? (
                <>
                  <Code size={13} style={{ color: '#569cd6' }} />
                  <span>Editor</span>
                </>
              ) : activeTab === 'browser' ? (
                <>
                  <Globe size={13} style={{ color: '#4ec9b0' }} />
                  <span>Browser Preview</span>
                </>
              ) : activeTab === 'inspect' ? (
                <>
                  <Activity size={13} style={{ color: '#e5c07b' }} />
                  <span>DevTools Inspector</span>
                </>
              ) : activeTab === 'images' ? (
                <>
                  <ImageIcon size={13} style={{ color: '#c586c0' }} />
                  <span>Generated Images</span>
                </>
              ) : (
                <>
                  <FileText size={13} style={{ color: '#9cdcfe' }} />
                  <span>Documentation</span>
                </>
              )}
            </div>
          </div>

          <div className="tab-spacer" />

          <button
            data-tab="code"
            onClick={() => {
              setDiffViewFile(null);
              setActiveTab('code');
            }}
            className={`tab-btn ${activeTab === 'code' ? 'tab-active' : ''}`}
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

          {activeTab === 'code' ? (
            <div className="code-editor-layout">
              {/* TAB BAR INSIDE EDITOR BODY */}
              <div className="editor-file-tabs-bar">
                <div className="editor-tabs-scroll-container">
                  {/* If Diff View is active, render a special diff tab */}
                  {diffViewFile && (
                    <div
                      className="editor-file-tab active diff-active-tab"
                      title={diffViewFile.path}
                    >
                      <GitCompare size={13} className="editor-tab-icon" style={{ color: '#d19a66' }} />
                      <span className="editor-tab-name">Diff: {diffViewFile.path.split('/').pop() || diffViewFile.path}</span>
                      <button
                        className="editor-tab-close-btn"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleCloseDiff();
                        }}
                        title="Close Diff"
                      >
                        <X size={12} />
                      </button>
                    </div>
                  )}

                  {/* Open File Tabs */}
                  {openFiles.map((tab) => {
                    const isActive = !diffViewFile && tab.path === activeFilePath;
                    return (
                      <div
                        key={tab.path}
                        className={`editor-file-tab ${isActive ? 'active' : ''}`}
                        onClick={() => selectTab(tab.path)}
                        title={tab.path}
                      >
                        <span className="editor-tab-icon">
                          {getFileIcon(tab.name)}
                        </span>
                        <span className="editor-tab-name">{tab.name}</span>
                        {tab.isModified && (
                          <span className="editor-tab-dirty-indicator" title="Unsaved changes">●</span>
                        )}
                        <button
                          className="editor-tab-close-btn"
                          onClick={(e) => closeTab(tab.path, e)}
                          title="Close tab (Cmd+W)"
                        >
                          <X size={12} />
                        </button>
                      </div>
                    );
                  })}
                </div>

                {/* Right actions inside editor tab bar */}
                {diffViewFile ? (
                  <div className="diff-viewer-actions">
                    <div className="diff-stat-pills">
                      <span className="diff-pill additions">+{diffViewFile.additions}</span>
                      <span className="diff-pill deletions">-{diffViewFile.deletions}</span>
                    </div>
                    {diffViewFile.status === 'pending' && (
                      <>
                        <button
                          className="diff-action-btn btn-accept-diff"
                          onClick={() => handleAcceptChange(diffViewFile.path, diffViewFile)}
                          title="Accept changes in this file"
                        >
                          <Check size={12} />
                          <span>Accept file</span>
                        </button>
                        <button
                          className="diff-action-btn btn-reject-diff"
                          onClick={() => handleRejectChange(diffViewFile.path, diffViewFile)}
                          title="Reject changes and revert this file"
                        >
                          <RotateCcw size={12} />
                          <span>Reject file</span>
                        </button>
                      </>
                    )}
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
                )}
              </div>

              {/* EDITOR CONTENT WRAPPER */}
              <div className="editor-content-wrapper">
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
                ) : openFiles.length === 0 ? (
                  <div className="editor-empty-state">
                    <div className="editor-empty-icon-box">
                      <FileCode size={32} />
                    </div>
                    <div className="editor-empty-title">No File Open</div>
                    <div className="editor-empty-sub">
                      Select a file from the explorer on the left or ask the AI agent to edit or create a file.
                    </div>
                    <div className="editor-empty-hint">
                      Tip: Use <kbd>Cmd</kbd> + <kbd>S</kbd> to save changes, <kbd>Cmd</kbd> + <kbd>W</kbd> to close tabs.
                    </div>
                  </div>
                ) : (
                  <Editor
                    height="100%"
                    path={activeFilePath || fileName || 'file.tsx'}
                    language={activeLanguage}
                    theme="vs-dark"
                    value={code}
                    onChange={handleEditorChange}
                    beforeMount={handleBeforeMount}
                    options={{
                      fontSize: 14,
                      minimap: { enabled: false },
                      scrollBeyondLastLine: false,
                      automaticLayout: true,
                      renderValidationDecorations: 'off',
                    }}
                  />
                )}
              </div>
            </div>
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
        onInstallFormatter={handleInstallFormatter}
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
