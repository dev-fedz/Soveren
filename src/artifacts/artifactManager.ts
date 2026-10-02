import { EventEmitter } from 'events';
import fs from 'fs/promises';
import fsSync from 'fs';
import path from 'path';
import crypto from 'crypto';
import { AgentArtifact, ArtifactType } from '../workspace/types.js';
import { WorkspaceContext } from '../context/workspaceContext.js';

export class ArtifactManager extends EventEmitter {
  private static instance: ArtifactManager;
  private artifacts = new Map<string, AgentArtifact>();

  constructor() {
    super();
  }

  static getInstance(): ArtifactManager {
    if (!ArtifactManager.instance) {
      ArtifactManager.instance = new ArtifactManager();
    }
    return ArtifactManager.instance;
  }

  getArtifactDirectory(taskId?: string): string {
    const wsRoot = WorkspaceContext.getRoot() || process.cwd();
    const base = path.join(wsRoot, '.artifacts');
    return taskId ? path.join(base, taskId) : base;
  }

  async saveArtifact(
    taskId: string,
    type: ArtifactType,
    title: string,
    options: {
      fileName?: string;
      content?: string | Buffer;
      sourcePath?: string;
      metadata?: Record<string, unknown>;
    } = {}
  ): Promise<AgentArtifact> {
    const id = `art_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    let savedPath = options.sourcePath;

    if (options.content) {
      const artDir = this.getArtifactDirectory(taskId);
      if (!fsSync.existsSync(artDir)) {
        fsSync.mkdirSync(artDir, { recursive: true });
      }

      const defaultFileName = options.fileName || `${type}_${Date.now()}.${this.getExtensionForType(type)}`;
      savedPath = path.join(artDir, defaultFileName);

      if (Buffer.isBuffer(options.content)) {
        await fs.writeFile(savedPath, options.content);
      } else {
        await fs.writeFile(savedPath, options.content, 'utf8');
      }
    }

    const artifact: AgentArtifact = {
      id,
      taskId,
      type,
      title,
      path: savedPath,
      content: typeof options.content === 'string' ? options.content.slice(0, 10000) : undefined,
      metadata: options.metadata || {},
      createdAt: Date.now(),
    };

    this.artifacts.set(id, artifact);
    this.emit('artifact_created', artifact);
    return artifact;
  }

  private getExtensionForType(type: ArtifactType): string {
    switch (type) {
      case 'screenshot':
      case 'image':
        return 'png';
      case 'console':
        return 'log';
      case 'network':
      case 'test-result':
        return 'json';
      case 'trace':
        return 'json';
      case 'document':
        return 'txt';
      default:
        return 'dat';
    }
  }

  getArtifact(id: string): AgentArtifact | undefined {
    return this.artifacts.get(id);
  }

  getArtifactsForTask(taskId: string): AgentArtifact[] {
    return Array.from(this.artifacts.values()).filter((a) => a.taskId === taskId);
  }

  getAllArtifacts(): AgentArtifact[] {
    return Array.from(this.artifacts.values());
  }

  getArtifactsByType(type: ArtifactType): AgentArtifact[] {
    return Array.from(this.artifacts.values()).filter((a) => a.type === type);
  }

  clear(): void {
    this.artifacts.clear();
  }
}

export const artifactManager = ArtifactManager.getInstance();
