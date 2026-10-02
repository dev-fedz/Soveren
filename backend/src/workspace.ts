import fs from 'fs/promises';
import path from 'path';
import { WorkspaceContext } from '../../src/context/workspaceContext.js';

// --- Types ---
export type WorkspaceType = 'existing' | 'new' | null;

export interface WorkspaceState {
  path: string | null;
  name: string | null;
  type: WorkspaceType;
  initialized: boolean;
}

// --- Workspace Manager ---
class WorkspaceManager {
  private state: WorkspaceState = {
    path: null,
    name: null,
    type: null,
    initialized: false,
  };

  getState(): WorkspaceState {
    return { ...this.state };
  }

  isActive(): boolean {
    return this.state.path !== null && this.state.initialized;
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
