import { LLMProvider } from '../llm/types.js';
import { ProviderRegistry } from '../llm/providerRegistry.js';
import { SettingsManager } from '../config/settingsManager.js';
import { AgentActivityModel } from './types.js';
import { OllamaProvider } from '../llm/ollama.js';

export type WorkflowPhase =
  | 'planning'
  | 'reasoning'
  | 'coding'
  | 'review'
  | 'testing'
  | 'general';

export interface RoutedModel {
  provider: LLMProvider;
  modelInfo: AgentActivityModel;
}

export class WorkflowRouter {
  static defaultAssignments: Record<WorkflowPhase, string> = {
    general: 'qwen2.5-coder:7b',
    planning: 'gemma4:31b-cloud',
    reasoning: 'gemma4:31b-cloud',
    coding: 'qwen2.5-coder:7b',
    review: 'qwen2.5-coder:7b',
    testing: 'qwen2.5-coder:7b',
  };

  private customRouting: Record<string, string> = {};

  static resolveModelForPhase(phase: WorkflowPhase, customRouting?: any, activeModel?: string): string {
    const routing = customRouting || this.defaultAssignments;
    let resolved = this.defaultAssignments.general;
    let hasExplicitConfig = false;

    switch (phase) {
      case 'planning':
        if (routing.planningModel || routing.planning) {
          resolved = routing.planningModel || routing.planning;
          hasExplicitConfig = true;
        } else {
          resolved = this.defaultAssignments.planning;
        }
        break;
      case 'reasoning':
        if (routing.reasoningModel || routing.reasoning) {
          resolved = routing.reasoningModel || routing.reasoning;
          hasExplicitConfig = true;
        } else {
          resolved = this.defaultAssignments.reasoning;
        }
        break;
      case 'coding':
        if (routing.codingModel || routing.coding) {
          resolved = routing.codingModel || routing.coding;
          hasExplicitConfig = true;
        } else {
          resolved = this.defaultAssignments.coding;
        }
        break;
      case 'review':
        if (routing.reviewModel || routing.review) {
          resolved = routing.reviewModel || routing.review;
          hasExplicitConfig = true;
        } else {
          resolved = this.defaultAssignments.review;
        }
        break;
      case 'testing':
        if (routing.testingModel || routing.testing) {
          resolved = routing.testingModel || routing.testing;
          hasExplicitConfig = true;
        } else {
          resolved = this.defaultAssignments.testing;
        }
        break;
      case 'general':
      default:
        if (routing.generalChat) {
          resolved = routing.generalChat;
          hasExplicitConfig = true;
        } else {
          resolved = this.defaultAssignments.general;
        }
        break;
    }

    // If activeModel is provided and this phase did not have an explicit custom assignment
    // (or was left on a default placeholder), use the user's activeModel!
    if (activeModel && (!hasExplicitConfig || resolved === 'gemma4:31b-cloud' || (resolved === 'qwen2.5-coder:7b' && activeModel !== 'qwen2.5-coder:7b' && !activeModel.includes('qwen2.5-coder')))) {
      resolved = activeModel;
    }

    return resolved;
  }

  resolveModelForPhase(phase: WorkflowPhase): string {
    return WorkflowRouter.resolveModelForPhase(phase, this.customRouting);
  }

  setWorkflowRouting(routing: Record<string, string>) {
    this.customRouting = { ...this.customRouting, ...routing };
  }

  static async getModelForPhase(phase: WorkflowPhase): Promise<RoutedModel> {
    try {
      const config = await SettingsManager.getGlobalConfig();
      const routing = config.workflowRouting || this.defaultAssignments;

      let modelId = this.resolveModelForPhase(phase, routing, config.activeModel);

      // Sanitize placeholder models that cannot be run directly in cloud or need fallback
      if (modelId === 'gemma4:31b-cloud' || modelId === 'ollama-claude' || modelId === 'claude') {
        modelId = config.activeModel && config.activeModel !== modelId ? config.activeModel : 'qwen2.5-coder:14b';
      }

      // Try creating provider for assigned model
      try {
        const provider = await ProviderRegistry.createProviderForModel(modelId);
        const providerName = modelId.includes('claude')
          ? 'Anthropic'
          : modelId.includes('gpt') || modelId.startsWith('o3') || modelId.startsWith('o1')
            ? 'OpenAI'
            : modelId.includes('gemini')
              ? 'Google'
              : 'Ollama';

        return {
          provider,
          modelInfo: {
            provider: providerName,
            name: modelId.replace(/^ollama-/, ''),
          },
        };
      } catch (err) {
        console.warn(`[WorkflowRouter] Target model ${modelId} failed, falling back to local responsive model:`, err);
      }
    } catch (err) {
      console.warn('[WorkflowRouter] Error fetching config:', err);
    }

    // Default Fallback: local fast qwen2.5-coder:7b
    const fallbackModel = 'qwen2.5-coder:7b';
    return {
      provider: new OllamaProvider(fallbackModel),
      modelInfo: {
        provider: 'Ollama',
        name: fallbackModel,
      },
    };
  }
}
