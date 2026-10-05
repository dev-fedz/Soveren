import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { WorkspaceContext } from '../../src/context/workspaceContext.js';

// --- Types ---
export type WorkspaceType = 'existing' | 'new' | null;

export interface WorkspaceState {
  path: string | null;
  name: string | null;
  type: WorkspaceType;
  initialized: boolean;
}

export interface RecentWorkspace {
  path: string;
  name: string;
  lastOpened: number;
}

// --- Workspace Manager ---
class WorkspaceManager {
  private state: WorkspaceState = {
    path: null,
    name: null,
    type: null,
    initialized: false,
  };
  private recentWorkspacesFile = path.join(os.homedir(), '.ai-native-editor', 'recent_workspaces.json');
  private recentWorkspaces: RecentWorkspace[] = [];
  private recentLoaded = false;

  getState(): WorkspaceState {
    return { ...this.state };
  }

  isActive(): boolean {
    return this.state.path !== null && this.state.initialized;
  }

  async getRecentWorkspaces(): Promise<RecentWorkspace[]> {
    if (!this.recentLoaded) {
      await this.loadRecentWorkspaces();
    }
    return [...this.recentWorkspaces];
  }

  async loadRecentWorkspaces(): Promise<void> {
    try {
      const content = await fs.readFile(this.recentWorkspacesFile, 'utf-8');
      const data = JSON.parse(content);
      if (Array.isArray(data)) {
        this.recentWorkspaces = data.filter(
          item => item && typeof item.path === 'string' && typeof item.name === 'string' && item.path !== '/app' && item.path !== '/' && !WorkspaceContext.isAgentRoot(item.path)
        );
      }
    } catch {
      this.recentWorkspaces = [];
    }
    this.recentLoaded = true;

    // Seed with current project or known existing project if empty
    if (this.recentWorkspaces.length === 0) {
      const candidates = [
        '/host/Desktop/projects/personal/Soveren',
        '/host/Desktop/projects/personal',
      ];
      for (const c of candidates) {
        try {
          const st = await fs.stat(c);
          if (st.isDirectory()) {
            this.recentWorkspaces.push({
              path: c,
              name: path.basename(c),
              lastOpened: Date.now(),
            });
            break;
          }
        } catch {}
      }
      if (this.recentWorkspaces.length > 0) {
        await this.saveRecentWorkspaces();
      }
    }
  }

  async addRecentWorkspace(dirPath: string): Promise<RecentWorkspace[]> {
    const resolved = path.resolve(dirPath);
    if (WorkspaceContext.isAgentRoot(resolved)) return this.getRecentWorkspaces();

    if (!this.recentLoaded) {
      await this.loadRecentWorkspaces();
    }

    const name = path.basename(resolved);
    this.recentWorkspaces = this.recentWorkspaces.filter(ws => ws.path !== resolved);
    this.recentWorkspaces.unshift({
      path: resolved,
      name,
      lastOpened: Date.now(),
    });
    if (this.recentWorkspaces.length > 20) {
      this.recentWorkspaces = this.recentWorkspaces.slice(0, 20);
    }
    await this.saveRecentWorkspaces();
    return [...this.recentWorkspaces];
  }

  async removeRecentWorkspace(dirPath: string): Promise<RecentWorkspace[]> {
    if (!this.recentLoaded) {
      await this.loadRecentWorkspaces();
    }
    const resolved = path.resolve(dirPath);
    this.recentWorkspaces = this.recentWorkspaces.filter(
      ws => ws.path !== resolved && ws.path !== dirPath && path.resolve(ws.path) !== resolved
    );
    await this.saveRecentWorkspaces();
    return [...this.recentWorkspaces];
  }

  private async saveRecentWorkspaces(): Promise<void> {
    try {
      await fs.mkdir(path.dirname(this.recentWorkspacesFile), { recursive: true });
      await fs.writeFile(this.recentWorkspacesFile, JSON.stringify(this.recentWorkspaces, null, 2), 'utf-8');
    } catch (err) {
      console.warn('[WorkspaceManager] Failed to save recent workspaces:', err);
    }
  }

  async select(dirPath: string): Promise<WorkspaceState> {
    const resolved = path.resolve(dirPath);
    if (WorkspaceContext.isAgentRoot(resolved)) {
      throw new Error("Access denied: Reading or selecting the AI agent's root project is strictly prohibited to prevent confusion. Please select a project from your local machine.");
    }
    await this.validatePath(resolved);

    const name = path.basename(resolved);
    this.state = {
      path: resolved,
      name,
      type: 'existing',
      initialized: true,
    };

    WorkspaceContext.setWorkspace(resolved, name);
    await this.addRecentWorkspace(resolved);
    return this.getState();
  }

  async create(parentDir: string, projectName: string): Promise<WorkspaceState> {
    const safeName = this.sanitizeProjectName(projectName);
    const resolved = path.resolve(parentDir);
    if (WorkspaceContext.isAgentRoot(resolved)) {
      throw new Error("Access denied: Creating projects inside the AI agent's root directory is prohibited. Please choose a directory on your local machine.");
    }
    const projectPath = path.join(resolved, safeName);

    // Validate parent exists
    await this.validatePath(resolved);

    // Check if project dir already exists
    try {
      await fs.access(projectPath);
      // Directory exists
      return {
        path: projectPath,
        name: safeName,
        type: 'new',
        initialized: false, // signal: already exists, needs user decision
      };
    } catch {
      // Does not exist — create it
      await fs.mkdir(projectPath, { recursive: true });
    }

    this.state = {
      path: projectPath,
      name: safeName,
      type: 'new',
      initialized: true,
    };

    WorkspaceContext.setWorkspace(projectPath, safeName);
    await this.addRecentWorkspace(projectPath);
    return this.getState();
  }

  clear(): WorkspaceState {
    this.state = {
      path: null,
      name: null,
      type: null,
      initialized: false,
    };
    WorkspaceContext.setWorkspace(null);
    return this.getState();
  }

  // --- Path Security ---
  validatePathSecurity(targetPath: string): boolean {
    if (!this.state.path) return false;
    return WorkspaceContext.isWithinWorkspace(targetPath);
  }

  // --- Helpers ---
  sanitizeProjectName(input: string): string {
    return input
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')  // remove unsafe chars
      .replace(/\s+/g, '-')           // spaces to hyphens
      .replace(/-+/g, '-')            // collapse consecutive hyphens
      .replace(/^-|-$/g, '')          // trim leading/trailing hyphens
      .slice(0, 64)                   // reasonable length
      || 'untitled-project';
  }

  generateProjectName(userRequest: string): string {
    // Extract meaningful words, filter out noise
    const stopWords = new Set([
      'a', 'an', 'the', 'me', 'my', 'i', 'please', 'can', 'you',
      'build', 'create', 'make', 'start', 'new', 'want', 'need',
      'would', 'like', 'with', 'using', 'use', 'for', 'and', 'or',
    ]);

    const words = userRequest
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, '')
      .split(/\s+/)
      .filter(w => w.length > 1 && !stopWords.has(w))
      .slice(0, 5);

    if (words.length === 0) return 'untitled-project';

    return this.sanitizeProjectName(words.join(' '));
  }

  private async validatePath(dirPath: string): Promise<void> {
    try {
      const stats = await fs.stat(dirPath);
      if (!stats.isDirectory()) {
        throw new Error(`Path is not a directory: ${dirPath}`);
      }
    } catch (err: any) {
      if (err.code === 'ENOENT') {
        throw new Error(`Directory does not exist: ${dirPath}`);
      }
      throw err;
    }
  }
}

export const workspaceManager = new WorkspaceManager();
