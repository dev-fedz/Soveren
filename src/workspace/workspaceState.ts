import { EventEmitter } from 'events';
import path from 'path';
import {
  AgentWorkspaceAction,
  AgentWorkspaceState,
  AgentWorkspaceStatus,
  InspectorPanelType,
  WorkspaceSurface,
} from './types.js';

export type FileViewerType = 'code' | 'images' | 'docs' | 'binary' | 'unsupported';

export class FileTypeRegistry {
  private static codeExtensions = new Set([
    'ts', 'tsx', 'js', 'jsx', 'mjs', 'cjs', 'py', 'java', 'go', 'rs', 'c', 'cpp', 'h',
    'hpp', 'cs', 'php', 'rb', 'swift', 'kt', 'kts', 'dart', 'scala', 'sh', 'bash', 'zsh',
    'sql', 'html', 'htm', 'css', 'scss', 'sass', 'less', 'json', 'jsonc', 'yaml', 'yml',
    'toml', 'xml', 'dockerfile', 'graphql', 'gql', 'prisma', 'vue', 'svelte', 'env',
  ]);

  private static imageExtensions = new Set([
    'png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'ico', 'avif',
  ]);

  private static docExtensions = new Set([
    'pdf', 'docx', 'doc', 'xlsx', 'xls', 'csv', 'tsv', 'txt', 'md', 'markdown', 'rtf',
  ]);

  static getViewerForPath(filePath: string): FileViewerType {
    const ext = path.extname(filePath).replace(/^\./, '').toLowerCase();
    const basename = path.basename(filePath).toLowerCase();

    if (basename === 'dockerfile' || basename.startsWith('dockerfile.')) return 'code';
    if (basename === '.env' || basename.startsWith('.env.')) return 'code';
    if (basename.endsWith('ignore') || basename.endsWith('rc')) return 'code';

    if (this.imageExtensions.has(ext)) return 'images';
    if (this.docExtensions.has(ext)) {
      if (ext === 'md' || ext === 'markdown') return 'docs'; // Can be viewed in Docs or Code
      return 'docs';
    }
    if (this.codeExtensions.has(ext)) return 'code';

    return 'code'; // fallback to code/text
  }

  static isImage(filePath: string): boolean {
    const ext = path.extname(filePath).replace(/^\./, '').toLowerCase();
    return this.imageExtensions.has(ext);
  }

  static isDocument(filePath: string): boolean {
    const ext = path.extname(filePath).replace(/^\./, '').toLowerCase();
    return this.docExtensions.has(ext);
  }
}

export class WorkspaceStateManager extends EventEmitter {
  private state: AgentWorkspaceState = {
    activeSurface: 'code',
    status: 'idle',
    inspectStats: {
      errorsCount: 0,
      warningsCount: 0,
      networkFailedCount: 0,
    },
    fileBadges: {},
  };

  constructor() {
    super();
  }

  resolveSurfaceForFile(filePath: string): FileViewerType {
    return FileTypeRegistry.getViewerForPath(filePath);
  }

  onAction(listener: (action: AgentWorkspaceAction) => void): () => void {
    this.on('action', listener);
    return () => this.off('action', listener);
  }

  subscribe(listener: (state: AgentWorkspaceState) => void): () => void {
    this.on('state_change', listener);
    return () => this.off('state_change', listener);
  }

  getState(): AgentWorkspaceState {
    return { ...this.state, fileBadges: { ...this.state.fileBadges } };
  }

  dispatch(action: AgentWorkspaceAction): AgentWorkspaceState {
    return this.dispatchAction(action);
  }

  dispatchAction(action: AgentWorkspaceAction): AgentWorkspaceState {
    this.emit('action', action);
    const targetPath = (action as any).path || action.target || '';

    switch (action.type) {
      case 'open_file': {
        const viewer = FileTypeRegistry.getViewerForPath(targetPath);
        if (viewer === 'images') {
          return this.openImage(targetPath);
        }
        if (viewer === 'docs' && !targetPath.endsWith('.md')) {
          return this.openDocument(targetPath);
        }
        this.state = {
          ...this.state,
          activeSurface: 'code',
          activeFile: targetPath,
          activeFilePath: targetPath,
          activeFileLine: action.line,
          activeFileColumn: action.column,
        };
        break;
      }

      case 'create_file': {
        const viewer = FileTypeRegistry.getViewerForPath(targetPath);
        this.state = {
          ...this.state,
          activeSurface: viewer === 'images' ? 'images' : viewer === 'docs' ? 'docs' : 'code',
          activeFile: targetPath,
          activeFilePath: targetPath,
          activeFileLine: 1,
          fileBadges: {
            ...this.state.fileBadges,
            [targetPath]: 'created',
          },
        };
        this.emit('file_created', { path: targetPath, content: action.content });
        break;
      }

      case 'modify_file':
      case 'edit_file': {
        const viewer = FileTypeRegistry.getViewerForPath(targetPath);
        this.state = {
          ...this.state,
          activeSurface: viewer === 'images' ? 'images' : viewer === 'docs' ? 'docs' : 'code',
          activeFile: targetPath,
          activeFilePath: targetPath,
          activeFileLine: action.line,
          activeFileColumn: action.column,
          fileBadges: {
            ...this.state.fileBadges,
            [targetPath]: 'modified',
          },
        };
        this.emit('file_modified', { path: targetPath, content: action.content });
        break;
      }

      case 'delete_file': {
        this.state = {
          ...this.state,
          fileBadges: {
            ...this.state.fileBadges,
            [targetPath]: 'deleted',
          },
        };
        this.emit('file_deleted', { path: targetPath });
        break;
      }

      case 'open_browser': {
        this.state = {
          ...this.state,
          activeSurface: 'browser',
          activeFile: undefined,
          activeFilePath: undefined,
          activeBrowserService: action.serviceId || this.state.activeBrowserService,
          activeBrowserUrl: action.url || action.target || this.state.activeBrowserUrl,
        };
        break;
      }

      case 'close_browser': {
        const matchesTarget = !action.url && !action.serviceId
          || (action.url && this.state.activeBrowserUrl && this.state.activeBrowserUrl.includes(action.url))
          || (action.serviceId && this.state.activeBrowserService === action.serviceId);

        if (matchesTarget || !action.url && !action.serviceId) {
          this.state = {
            ...this.state,
            activeBrowserService: undefined,
            activeBrowserUrl: undefined,
            activeBrowserTab: undefined,
          };
        }
        break;
      }

      case 'open_image': {
        this.state = {
          ...this.state,
          activeSurface: 'images',
          activeFile: targetPath,
          activeImagePath: targetPath,
        };
        break;
      }

      case 'open_document': {
        this.state = {
          ...this.state,
          activeSurface: 'docs',
          activeFile: targetPath,
          activeDocPath: targetPath,
        };
        break;
      }

      case 'open_inspector': {
        this.state = {
          ...this.state,
          activeSurface: 'browser',
          activeInspectorPanel: action.panel || 'console',
          activeInspectPanel: action.panel || 'console',
        };
        break;
      }

      case 'focus_console': {
        this.state = {
          ...this.state,
          activeSurface: 'browser',
          activeInspectorPanel: 'console',
          activeInspectPanel: 'console',
        };
        break;
      }

      case 'focus_network': {
        this.state = {
          ...this.state,
          activeSurface: 'browser',
          activeInspectorPanel: 'network',
          activeInspectPanel: 'network',
        };
        break;
      }
    }

    this.emit('state_change', this.state);
    return this.getState();
  }

  setSurface(surface: WorkspaceSurface): AgentWorkspaceState {
    this.state.activeSurface = surface;
    this.emit('state_change', this.state);
    return this.getState();
  }

  openFile(filePath: string, line?: number, column?: number): AgentWorkspaceState {
    return this.dispatchAction({
      type: 'open_file',
      path: filePath,
      line,
      column,
    });
  }

  createFile(filePath: string, content?: string): AgentWorkspaceState {
    return this.dispatchAction({
      type: 'create_file',
      path: filePath,
      content,
    });
  }

  openBrowser(serviceId?: string, url?: string): AgentWorkspaceState {
    return this.dispatchAction({
      type: 'open_browser',
      serviceId,
      url,
    });
  }

  closeBrowser(serviceId?: string, url?: string): AgentWorkspaceState {
    return this.dispatchAction({
      type: 'close_browser',
      serviceId,
      url,
    });
  }

  openImage(imagePath: string): AgentWorkspaceState {
    return this.dispatchAction({
      type: 'open_image',
      path: imagePath,
    });
  }

  openDocument(docPath: string, page?: number): AgentWorkspaceState {
    return this.dispatchAction({
      type: 'open_document',
      path: docPath,
      page,
    });
  }

  openInspector(panel: InspectorPanelType = 'console', target?: string): AgentWorkspaceState {
    return this.dispatchAction({
      type: 'open_inspector',
      panel,
      target,
    });
  }

  setStatus(status: AgentWorkspaceStatus): AgentWorkspaceState {
    this.state.status = status;
    this.emit('state_change', this.state);
    return this.getState();
  }

  setAgentStatus(status: AgentWorkspaceStatus): AgentWorkspaceState {
    return this.setStatus(status);
  }

  updateInspectStats(errorsCount: number, warningsCount: number, networkFailedCount: number): AgentWorkspaceState {
    this.state.inspectStats = {
      errorsCount,
      warningsCount,
      networkFailedCount,
    };
    this.emit('state_change', this.state);
    return this.getState();
  }

  reset(): void {
    this.state = {
      activeSurface: 'code',
      status: 'idle',
      inspectStats: {
        errorsCount: 0,
        warningsCount: 0,
        networkFailedCount: 0,
      },
      fileBadges: {},
    };
    this.emit('state_change', this.state);
  }
}

export const globalWorkspaceState = new WorkspaceStateManager();
