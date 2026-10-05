import { EventEmitter } from 'events';
import fs from 'fs/promises';
import path from 'path';
import {
  AgentActivity,
  AgentActivityType,
  AgentActivityModel,
  AgentSession,
  AgentSessionStatus,
  ChangedFile,
  ChangeApprovalMode,
} from './types.js';
import { WorkspaceContext } from '../context/workspaceContext.js';

export function calculateLineDiff(oldContent: string, newContent: string): { additions: number; deletions: number; diff: string } {
  const oldLines = oldContent ? oldContent.split('\n') : [];
  const newLines = newContent ? newContent.split('\n') : [];

  let additions = 0;
  let deletions = 0;
  const diffLines: string[] = [];

  // Simple and fast line diff computation
  let i = 0;
  let j = 0;

  while (i < oldLines.length || j < newLines.length) {
    if (i < oldLines.length && j < newLines.length && oldLines[i] === newLines[j]) {
      diffLines.push(` ${oldLines[i]}`);
      i++;
      j++;
    } else {
      // Look ahead for match
      let matchInNew = -1;
      let matchInOld = -1;

      for (let look = 1; look <= 10; look++) {
        if (j + look < newLines.length && i < oldLines.length && oldLines[i] === newLines[j + look]) {
          matchInNew = j + look;
          break;
        }
        if (i + look < oldLines.length && j < newLines.length && oldLines[i + look] === newLines[j]) {
          matchInOld = i + look;
          break;
        }
      }

      if (matchInNew !== -1) {
        while (j < matchInNew) {
          diffLines.push(`+${newLines[j]}`);
          additions++;
          j++;
        }
      } else if (matchInOld !== -1) {
        while (i < matchInOld) {
          diffLines.push(`-${oldLines[i]}`);
          deletions++;
          i++;
        }
      } else {
        if (i < oldLines.length) {
          diffLines.push(`-${oldLines[i]}`);
          deletions++;
          i++;
        }
        if (j < newLines.length) {
          diffLines.push(`+${newLines[j]}`);
          additions++;
          j++;
        }
      }
    }
  }

  return {
    additions,
    deletions,
    diff: diffLines.join('\n'),
  };
}

export class ActivityTracker extends EventEmitter {
  private session: AgentSession;
  private isStopped = false;
  private approvalMode: ChangeApprovalMode = 'automatic';

  constructor() {
    super();
    this.session = this.createEmptySession('Task Workflow');
  }

  private createEmptySession(taskTitle = 'Task Workflow', workspace = '__global__'): AgentSession {
    return {
      id: `session_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      workspace,
      status: 'idle',
      taskTitle,
      activities: [],
      changedFiles: [],
      pendingChanges: [],
    };
  }

  resetSession(taskTitle = 'Task Workflow', workspace = '__global__'): AgentSession {
    this.isStopped = false;
    this.session = this.createEmptySession(taskTitle, workspace);
    this.emit('session_update', this.session);
    return this.session;
  }

  setApprovalMode(mode: ChangeApprovalMode) {
    this.approvalMode = mode;
  }

  getApprovalMode(): ChangeApprovalMode {
    return this.approvalMode;
  }

  startSession(taskTitle: string, initialModel?: AgentActivityModel, workspace?: string): AgentSession {
    this.isStopped = false;
    this.session = {
      id: `session_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      workspace: workspace || '__global__',
      status: 'planning',
      taskTitle: taskTitle || 'Reviewing Task Project File',
      currentModel: initialModel || { provider: 'Ollama', name: 'qwen2.5-coder:7b' },
      activities: [],
      changedFiles: [],
      pendingChanges: [],
    };
    this.emit('session_update', this.session);
    return this.session;
  }

  getSession(): AgentSession {
    return { ...this.session };
  }

  isAborted(): boolean {
    return this.isStopped;
  }

  abort(): AgentSession {
    return this.stopSession();
  }

  stopSession(): AgentSession {
    this.isStopped = true;
    this.session.status = 'idle';
    this.emit('session_update', this.session);
    return this.session;
  }

  setSessionStatus(status: AgentSessionStatus) {
    this.session.status = status;
    this.emit('session_update', this.session);
  }

  setCurrentModel(model: AgentActivityModel) {
    this.session.currentModel = model;
    this.emit('session_update', this.session);
  }

  startActivity(
    partialOrType:
      | AgentActivityType
      | {
          type: AgentActivityType;
          title: string;
          description?: string;
          model?: AgentActivityModel;
          file?: AgentActivity['file'];
          command?: AgentActivity['command'];
          test?: AgentActivity['test'];
          metadata?: Record<string, unknown>;
        },
    title?: string,
    extra?: Partial<AgentActivity>
  ): AgentActivity {
    let partial: {
      type: AgentActivityType;
      title: string;
      description?: string;
      model?: AgentActivityModel;
      file?: AgentActivity['file'];
      command?: AgentActivity['command'];
      test?: AgentActivity['test'];
      metadata?: Record<string, unknown>;
    };

    if (typeof partialOrType === 'string') {
      partial = {
        type: partialOrType,
        title: title || partialOrType,
        ...extra,
      };
    } else {
      partial = partialOrType;
    }

    const activity: AgentActivity = {
      id: `act_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      type: partial.type,
      title: partial.title,
      description: partial.description,
      status: (partial as any).status || 'running',
      timestamp: Date.now(),
      model: partial.model || this.session.currentModel,
      file: partial.file,
      command: partial.command,
      test: partial.test,
      metadata: { workspace: this.session.workspace, ...(partial.metadata || {}) },
    };

    this.session.activities.push(activity);
    this.emit('activity_start', activity);
    this.emit('session_update', this.session);
    return activity;
  }

  updateActivity(id: string, updates: Partial<AgentActivity>): AgentActivity | null {
    const act = this.session.activities.find(a => a.id === id);
    if (!act) return null;

    Object.assign(act, updates);
    this.emit('activity_update', act);
    this.emit('session_update', this.session);
    return act;
  }

  completeActivity(id: string, finalData?: Partial<AgentActivity>): AgentActivity | null {
    const act = this.session.activities.find(a => a.id === id);
    if (!act) return null;

    if (finalData) {
      Object.assign(act, finalData);
    }
    act.status = 'completed';
    act.duration = Math.max(1, Math.round((Date.now() - act.timestamp) / 1000));

    this.emit('activity_complete', act);
    this.emit('session_update', this.session);
    return act;
  }

  failActivity(id: string, errorMsg?: string): AgentActivity | null {
    const act = this.session.activities.find(a => a.id === id);
    if (!act) return null;

    act.status = 'failed';
    act.duration = Math.max(1, Math.round((Date.now() - act.timestamp) / 1000));
    if (errorMsg) {
      act.description = errorMsg;
    }

    this.emit('activity_fail', act);
    this.emit('session_update', this.session);
    return act;
  }

  // --- File Change Management & Approval Lifecycle ---

  recordFileChange(filePath: string, oldContent: string, newContent: string, isPending?: boolean): ChangedFile {
    const relPath = path.isAbsolute(filePath)
      ? path.relative(WorkspaceContext.getRoot(), filePath)
      : filePath;

    const { additions, deletions, diff } = calculateLineDiff(oldContent, newContent);
    const pending = isPending !== undefined ? isPending : this.approvalMode !== 'automatic';

    const change: ChangedFile = {
      path: relPath,
      additions,
      deletions,
      originalContent: oldContent,
      modifiedContent: newContent,
      diff,
      status: pending ? 'pending' : 'accepted',
    };

    // Remove existing entry for same path if already present
    this.session.changedFiles = this.session.changedFiles.filter(f => f.path !== relPath);
    this.session.changedFiles.push(change);

    if (pending) {
      this.session.pendingChanges = this.session.pendingChanges.filter(f => f.path !== relPath);
      this.session.pendingChanges.push(change);
    } else {
      this.session.pendingChanges = this.session.pendingChanges.filter(f => f.path !== relPath);
    }

    this.emit('file_changes', this.session.changedFiles);
    this.emit('session_update', this.session);
    return change;
  }

  async acceptChange(relPath: string, fallbackModifiedContent?: string): Promise<boolean> {
    const item = this.session.changedFiles.find(
      f => f.path === relPath || f.path.endsWith(relPath) || relPath.endsWith(f.path)
    );
    const contentToWrite = item?.modifiedContent ?? fallbackModifiedContent;

    // Ensure modified content is saved to disk
    if (contentToWrite !== undefined) {
      try {
        const fullPath = WorkspaceContext.resolvePath(relPath);
        await fs.writeFile(fullPath, contentToWrite, 'utf-8');
      } catch (err) {
        console.error(`[ActivityTracker] Error writing accepted file ${relPath}:`, err);
      }
    }

    // Remove file from changed and pending list
    this.session.changedFiles = this.session.changedFiles.filter(
      f => f.path !== relPath && !f.path.endsWith(relPath) && !relPath.endsWith(f.path)
    );
    this.session.pendingChanges = this.session.pendingChanges.filter(
      f => f.path !== relPath && !f.path.endsWith(relPath) && !relPath.endsWith(f.path)
    );

    this.emit('file_changes', this.session.changedFiles);
    this.emit('session_update', this.session);
    return true;
  }

  async rejectChange(relPath: string, fallbackOriginalContent?: string): Promise<boolean> {
    const item = this.session.changedFiles.find(
      f => f.path === relPath || f.path.endsWith(relPath) || relPath.endsWith(f.path)
    );
    const origContent = item?.originalContent ?? fallbackOriginalContent;

    // Revert to original content on disk
    try {
      const fullPath = WorkspaceContext.resolvePath(relPath);
      if (origContent !== undefined && origContent !== null && origContent !== '') {
        await fs.writeFile(fullPath, origContent, 'utf-8');
      } else if (item && !item.originalContent) {
        // If file was newly created and has no original content, remove it
        await fs.unlink(fullPath).catch(() => {});
      }
    } catch (err) {
      console.error(`[ActivityTracker] Error reverting rejected file ${relPath}:`, err);
    }

    // Remove file from changed and pending list
    this.session.changedFiles = this.session.changedFiles.filter(
      f => f.path !== relPath && !f.path.endsWith(relPath) && !relPath.endsWith(f.path)
    );
    this.session.pendingChanges = this.session.pendingChanges.filter(
      f => f.path !== relPath && !f.path.endsWith(relPath) && !relPath.endsWith(f.path)
    );

    this.emit('file_changes', this.session.changedFiles);
    this.emit('session_update', this.session);
    return true;
  }

  async acceptAllChanges(filesList?: ChangedFile[]): Promise<void> {
    const targets = filesList && filesList.length > 0 ? filesList : [...this.session.changedFiles];
    for (const item of targets) {
      await this.acceptChange(item.path, item.modifiedContent);
    }
  }

  async rejectAllChanges(filesList?: ChangedFile[]): Promise<void> {
    const targets = filesList && filesList.length > 0 ? filesList : [...this.session.changedFiles];
    for (const item of targets) {
      await this.rejectChange(item.path, item.originalContent);
    }
  }
}

export const globalActivityTracker = new ActivityTracker();
