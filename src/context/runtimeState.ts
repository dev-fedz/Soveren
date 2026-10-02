import { Message } from '../llm/types.js';
import { ModelProfile } from '../config/types.js';
import { ModelCatalog } from '../llm/models.js';
import { ContextCompactor, TaskState } from './compactor.js';

export type ContextThreshold = 'normal' | 'warning' | 'high' | 'critical';

export interface ContextUsageInfo {
  usedTokens: number;
  maxTokens: number;
  percentage: number;
  threshold: ContextThreshold;
  modelId: string;
  modelName: string;
  recommendedAlternatives?: Array<{
    id: string;
    name: string;
    contextWindow: number;
  }>;
}

export interface ModelSwitchResult {
  previousModel: string;
  activeModel: string;
  compacted: boolean;
  tokensBefore: number;
  tokensAfter: number;
  taskState: TaskState;
  messages: Message[];
}

export class RuntimeStateManager {
  private static taskStates = new Map<string, TaskState>();

  static getTaskState(workspaceKey: string): TaskState | undefined {
    return this.taskStates.get(workspaceKey);
  }

  static setTaskState(workspaceKey: string, state: TaskState): void {
    this.taskStates.set(workspaceKey, state);
  }

  /**
   * Calculate context usage for active model and messages
   */
  static async getUsageInfo(
    modelId: string,
    messages: Message[],
    workspaceKey = '__global__'
  ): Promise<ContextUsageInfo> {
    const model = (await ModelCatalog.getModelById(modelId)) || {
      id: modelId,
      name: modelId,
      contextWindow: 128000,
    };

    const usedTokens = ContextCompactor.estimateMessagesTokens(messages);
    const maxTokens = model.contextWindow || 128000;
    const ratio = usedTokens / maxTokens;
    const percentage = Math.min(100, Math.round(ratio * 100));

    let threshold: ContextThreshold = 'normal';
    if (ratio >= 0.95) {
      threshold = 'critical';
    } else if (ratio >= 0.85) {
      threshold = 'high';
    } else if (ratio >= 0.70) {
      threshold = 'warning';
    }

    // If approaching limit, find models with larger context windows
    let recommendedAlternatives: Array<{ id: string; name: string; contextWindow: number }> | undefined;
    if (threshold !== 'normal') {
      const all = await ModelCatalog.getAllModels();
      recommendedAlternatives = all
        .filter(m => m.enabled && m.contextWindow > maxTokens)
        .sort((a, b) => b.contextWindow - a.contextWindow)
        .slice(0, 3)
        .map(m => ({ id: m.id, name: m.name, contextWindow: m.contextWindow }));
    }

    return {
      usedTokens,
      maxTokens,
      percentage,
      threshold,
      modelId: model.id,
      modelName: model.name,
      recommendedAlternatives,
    };
  }

  /**
   * Section 11 & 28: Zero-Loss Model Switcher
   * Switches model without losing current task context. Compacts if destination model has smaller window.
   */
  static async switchModel(
    targetModelId: string,
    currentModelId: string,
    messages: Message[],
    workspaceKey = '__global__'
  ): Promise<ModelSwitchResult> {
    const targetModel = await ModelCatalog.getModelById(targetModelId);
    const targetWindow = targetModel?.contextWindow || 128000;
    const currentTokens = ContextCompactor.estimateMessagesTokens(messages);

    const existingState = this.getTaskState(workspaceKey);
    let finalMessages = [...messages];
    let wasCompacted = false;
    let tokensAfter = currentTokens;
    let taskState: TaskState = existingState || {
      goal: 'General programming assistance',
      requirements: [],
      decisions: [],
      filesModified: [],
      filesReferenced: [],
      pendingActions: [],
      unresolvedErrors: [],
      activeConstraints: [],
    };

    // If current token usage is > 65% of target window, perform structured compaction
    if (currentTokens > targetWindow * 0.65 || messages.length > 20) {
      const compaction = ContextCompactor.compact(messages, workspaceKey, existingState);
      finalMessages = compaction.messages;
      taskState = compaction.taskState;
      this.setTaskState(workspaceKey, taskState);
      wasCompacted = true;
      tokensAfter = compaction.tokensAfter;
    }

    return {
      previousModel: currentModelId,
      activeModel: targetModelId,
      compacted: wasCompacted,
      tokensBefore: currentTokens,
      tokensAfter,
      taskState,
      messages: finalMessages,
    };
  }
}
