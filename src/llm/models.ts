import { ModelProfile, ProviderId } from '../config/types.js';
import { SettingsManager, DEFAULT_MODELS } from '../config/settingsManager.js';
import { CredentialStore } from '../config/credentialStore.js';

export interface OllamaModelTag {
  name: string;
  model: string;
  size?: number;
  details?: {
    format?: string;
    family?: string;
    parameter_size?: string;
    context_length?: number;
  };
  capabilities?: string[];
}

export class ModelCatalog {
  private static cachedOllamaModels: ModelProfile[] = [];
  private static lastOllamaCheck = 0;

  static async fetchOllamaModels(endpoint?: string): Promise<ModelProfile[]> {
    let host = endpoint;
    if (!host || ((host.includes('localhost') || host.includes('127.0.0.1')) && process.env.OLLAMA_HOST)) {
      host = process.env.OLLAMA_HOST;
    }
    host = host || 'http://localhost:11434';
    const now = Date.now();
    // Cache for 15 seconds to avoid spamming local endpoint
    if (this.cachedOllamaModels.length > 0 && now - this.lastOllamaCheck < 15000) {
      return this.cachedOllamaModels;
    }

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 2000);
      const res = await fetch(`${host.replace(/\/$/, '')}/api/tags`, {
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (!res.ok) {
        return this.cachedOllamaModels;
      }

      const data = (await res.json()) as { models?: OllamaModelTag[] };
      if (!data.models || !Array.isArray(data.models)) {
        return this.cachedOllamaModels;
      }

      const discovered: ModelProfile[] = data.models.map(m => {
        const contextLen = m.details?.context_length || 32768;
        const hasTools = m.capabilities?.includes('tools') ?? true;
        const hasVision = m.capabilities?.includes('vision') ?? false;

        return {
          id: `ollama-${m.name}`,
          providerId: 'ollama' as ProviderId,
          name: `Ollama: ${m.name}`,
          contextWindow: contextLen,
          capabilities: {
            text: true,
            vision: hasVision,
            tools: hasTools,
            streaming: true,
          },
          authentication: { type: 'local' },
          inputCost: 0,
          outputCost: 0,
          enabled: true,
          status: 'ready',
          statusMessage: `${m.details?.parameter_size || 'Local'} • ${Math.round(contextLen / 1024)}K Context`,
        };
      });

      this.cachedOllamaModels = discovered;
      this.lastOllamaCheck = now;
      return discovered;
    } catch {
      // Ollama not reachable or offline
      return this.cachedOllamaModels;
    }
  }

  static async getAllModels(): Promise<ModelProfile[]> {
    const config = await SettingsManager.getGlobalConfig();
    const staticModels = config.models || DEFAULT_MODELS;
    const ollamaModels = await this.fetchOllamaModels(config.providers.ollama?.endpoint);

    // Filter out duplicate IDs
    const seen = new Set<string>();
    const combined: ModelProfile[] = [];

    // Add configured models first
    for (const m of staticModels) {
      if (!seen.has(m.id)) {
        seen.add(m.id);
        combined.push(m);
      }
    }

    // Add dynamically discovered Ollama models
    for (const om of ollamaModels) {
      if (!seen.has(om.id)) {
        seen.add(om.id);
        combined.push(om);
      }
    }

    // Update connection status based on credentials
    const credentials = await CredentialStore.getAllMasked();
    for (const m of combined) {
      if (m.providerId === 'ollama') {
        const isRealOllamaModel = ollamaModels.some(
          om => om.id === m.id || om.id.replace(/^ollama-/, '') === m.id.replace(/^ollama-/, '')
        );
        m.status = isRealOllamaModel ? 'ready' : 'unavailable';
      } else if (m.providerId === 'custom') {
        m.status = m.enabled ? 'ready' : 'not_configured';
      } else {
        const cred = credentials[m.providerId];
        if (cred?.hasKey) {
          m.status = 'ready';
        } else {
          m.status = 'unavailable';
          m.statusMessage = 'API key required';
        }
      }
    }

    return combined;
  }

  static async getModelById(modelId: string): Promise<ModelProfile | undefined> {
    const all = await this.getAllModels();
    const cleanId = modelId.toLowerCase().trim();
    const strippedId = cleanId.replace(/^ollama-/, '');

    return all.find(m => {
      const mClean = m.id.toLowerCase().trim();
      const mStripped = mClean.replace(/^ollama-/, '');
      return mClean === cleanId || mClean === `ollama-${cleanId}` || mStripped === strippedId;
    });
  }
}
