import { LLMProvider, Message, LLMResponse } from './types.js';
import { ProviderId, ModelProfile } from '../config/types.js';
import { CredentialStore } from '../config/credentialStore.js';
import { ModelCatalog } from './models.js';
import { OllamaProvider } from './ollama.js';

export interface ProviderOptions {
  reasoningEffort?: 'low' | 'medium' | 'high';
  customHeaders?: Record<string, string>;
}

export class OpenAICompatibleProvider implements LLMProvider {
  constructor(
    private endpoint: string,
    private apiKey: string,
    private modelName: string,
    private options?: ProviderOptions
  ) {}

  async chat(messages: Message[]): Promise<LLMResponse> {
    const url = `${this.endpoint.replace(/\/$/, '')}/chat/completions`;
    const payload: any = {
      model: this.modelName,
      messages,
      stream: false,
    };
    if (this.options?.reasoningEffort) {
      payload.reasoning_effort = this.options.reasoningEffort;
    }

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
        ...(this.options?.customHeaders || {}),
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`OpenAI Provider error (${res.status}): ${errText}`);
    }

    const data = await res.json();
    const content = data.choices?.[0]?.message?.content || '';
    const thinking = data.choices?.[0]?.message?.reasoning_content || undefined;
    return {
      content,
      thinking,
      stopReason: data.choices?.[0]?.finish_reason || 'stop',
    };
  }

  async chatStream(
    messages: Message[],
    onChunk: (chunk: string) => void,
    onThinking?: (thoughtChunk: string) => void
  ): Promise<LLMResponse> {
    const url = `${this.endpoint.replace(/\/$/, '')}/chat/completions`;
    const payload: any = {
      model: this.modelName,
      messages,
      stream: true,
    };
    if (this.options?.reasoningEffort) {
      payload.reasoning_effort = this.options.reasoningEffort;
    }

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
        ...(this.options?.customHeaders || {}),
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`OpenAI Provider error (${res.status}): ${errText}`);
    }

    const reader = res.body?.getReader();
    const decoder = new TextDecoder();
    let full = '';
    let fullThinking = '';

    if (!reader) throw new Error('No reader available from streaming response');

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value, { stream: true });
      const lines = chunk.split('\n');
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith('data:')) continue;
        const jsonStr = trimmed.replace(/^data:\s*/, '');
        if (jsonStr === '[DONE]') break;
        try {
          const parsed = JSON.parse(jsonStr);
          const delta = parsed.choices?.[0]?.delta?.content || '';
          const reasonDelta = parsed.choices?.[0]?.delta?.reasoning_content || '';
          if (reasonDelta) {
            fullThinking += reasonDelta;
            if (onThinking) onThinking(reasonDelta);
          }
          if (delta) {
            full += delta;
            onChunk(delta);
          }
        } catch {
          // ignore partial
        }
      }
    }

    return { content: full, thinking: fullThinking || undefined, stopReason: 'stop' };
  }
}

export class AnthropicProvider implements LLMProvider {
  constructor(
    private apiKey: string,
    private modelName: string
  ) {}

  async chat(messages: Message[]): Promise<LLMResponse> {
    const url = 'https://api.anthropic.com/v1/messages';
    const systemMsg = messages.find(m => m.role === 'system')?.content;
    const userAndAssistant = messages
      .filter(m => m.role !== 'system')
      .map(m => ({ role: m.role, content: m.content }));

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: this.modelName,
        max_tokens: 4096,
        system: systemMsg,
        messages: userAndAssistant,
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Anthropic error (${res.status}): ${errText}`);
    }

    const data = await res.json();
    let thinking: string | undefined;
    let content = '';
    if (Array.isArray(data.content)) {
      for (const block of data.content) {
        if (block.type === 'thinking') {
          thinking = (thinking ? thinking + '\n' : '') + block.thinking;
        } else if (block.type === 'text') {
          content += block.text;
        }
      }
    } else {
      content = data.content?.[0]?.text || '';
    }
    return { content, thinking, stopReason: data.stop_reason || 'stop' };
  }

  async chatStream(
    messages: Message[],
    onChunk: (chunk: string) => void,
    onThinking?: (thoughtChunk: string) => void
  ): Promise<LLMResponse> {
    const response = await this.chat(messages);
    if (response.thinking && onThinking) {
      onThinking(response.thinking);
    }
    onChunk(response.content);
    return response;
  }
}

export class GoogleGeminiProvider implements LLMProvider {
  private primaryProvider: OpenAICompatibleProvider;
  private reasoningEffort?: 'low' | 'medium' | 'high';
  private modelName: string;

  constructor(private apiKey: string, private modelId: string) {
    if (modelId.endsWith('-low')) {
      this.reasoningEffort = 'low';
      this.modelName = modelId.replace(/-low$/, '');
    } else if (modelId.endsWith('-mid')) {
      this.reasoningEffort = 'medium';
      this.modelName = modelId.replace(/-mid$/, '');
    } else if (modelId.endsWith('-high')) {
      this.reasoningEffort = 'high';
      this.modelName = modelId.replace(/-high$/, '');
    } else {
      this.modelName = modelId;
    }

    this.primaryProvider = new OpenAICompatibleProvider(
      'https://generativelanguage.googleapis.com/v1beta/openai',
      apiKey,
      this.modelName,
      { reasoningEffort: this.reasoningEffort }
    );
  }

  private isRecoverableError(msg?: string): boolean {
    if (!msg) return false;
    return msg.includes('not found') ||
      msg.includes('404') ||
      msg.includes('INVALID_ARGUMENT') ||
      msg.includes('503') ||
      msg.includes('UNAVAILABLE') ||
      msg.includes('high demand') ||
      msg.includes('429') ||
      msg.includes('RESOURCE_EXHAUSTED') ||
      msg.includes('quota') ||
      msg.includes('rate limit');
  }

  async chat(messages: Message[]): Promise<LLMResponse> {
    try {
      return await this.primaryProvider.chat(messages);
    } catch (err: any) {
      if (this.isRecoverableError(err?.message)) {
        console.warn(`[GoogleGeminiProvider] Primary model ${this.modelName} unavailable, falling back to gemini-2.5-flash`);
        const fallback = new OpenAICompatibleProvider(
          'https://generativelanguage.googleapis.com/v1beta/openai',
          this.apiKey,
          'gemini-2.5-flash',
          { reasoningEffort: this.reasoningEffort }
        );
        return await fallback.chat(messages);
      }
      throw err;
    }
  }

  async chatStream(
    messages: Message[],
    onChunk: (chunk: string) => void,
    onThinking?: (thoughtChunk: string) => void
  ): Promise<LLMResponse> {
    try {
      return await this.primaryProvider.chatStream(messages, onChunk, onThinking);
    } catch (err: any) {
      if (this.isRecoverableError(err?.message)) {
        console.warn(`[GoogleGeminiProvider] Primary model ${this.modelName} unavailable, falling back to gemini-2.5-flash`);
        const fallback = new OpenAICompatibleProvider(
          'https://generativelanguage.googleapis.com/v1beta/openai',
          this.apiKey,
          'gemini-2.5-flash',
          { reasoningEffort: this.reasoningEffort }
        );
        return await fallback.chatStream(messages, onChunk, onThinking);
      }
      throw err;
    }
  }
}

export class ProviderRegistry {
  static async testConnection(
    providerId: ProviderId,
    apiKey?: string,
    endpoint?: string
  ): Promise<{ success: boolean; message: string; availableModels?: string[] }> {
    try {
      const keyToUse = apiKey || (await CredentialStore.getApiKey(providerId)) || (providerId === 'google' ? (process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY) : undefined);

      if (providerId === 'ollama') {
        let ep = endpoint;
        if (!ep || ((ep.includes('localhost') || ep.includes('127.0.0.1')) && process.env.OLLAMA_HOST)) {
          ep = process.env.OLLAMA_HOST;
        }
        ep = ep || 'http://localhost:11434';
        const res = await fetch(`${ep.replace(/\/$/, '')}/api/tags`, {
          signal: AbortSignal.timeout(3000),
        });
        if (!res.ok) {
          return { success: false, message: `Ollama returned HTTP ${res.status}` };
        }
        const data = await res.json();
        const models = (data.models || []).map((m: any) => m.name);
        return {
          success: true,
          message: `Connected to Ollama! Found ${models.length} local models.`,
          availableModels: models,
        };
      }

      if (!keyToUse) {
        return { success: false, message: 'No API key provided' };
      }

      if (providerId === 'openai') {
        const ep = endpoint || 'https://api.openai.com/v1';
        const res = await fetch(`${ep.replace(/\/$/, '')}/models`, {
          headers: { Authorization: `Bearer ${keyToUse}` },
          signal: AbortSignal.timeout(4000),
        });
        if (res.ok) {
          const data = await res.json();
          const models = (data.data || []).map((m: any) => m.id).slice(0, 10);
          return { success: true, message: 'OpenAI API key verified successfully!', availableModels: models };
        }
        return { success: false, message: `OpenAI authentication failed (${res.status})` };
      }

      if (providerId === 'anthropic') {
        const res = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': keyToUse,
            'anthropic-version': '2023-06-01',
          },
          body: JSON.stringify({
            model: 'claude-3-5-haiku-20241022',
            max_tokens: 1,
            messages: [{ role: 'user', content: 'ping' }],
          }),
          signal: AbortSignal.timeout(4000),
        });

        if (res.ok || res.status === 200) {
          return { success: true, message: 'Anthropic API key verified successfully!' };
        } else if (res.status === 401) {
          return { success: false, message: 'Invalid Anthropic API key' };
        }
        return { success: true, message: 'Anthropic endpoint reached!' };
      }

      if (providerId === 'google') {
        const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${keyToUse}`;
        const res = await fetch(url, { signal: AbortSignal.timeout(4000) });
        if (res.ok) {
          const data = await res.json();
          const models = (data.models || []).map((m: any) => m.name.replace(/^models\//, '')).slice(0, 10);
          return { success: true, message: 'Google Gemini API key verified successfully!', availableModels: models };
        }
        return { success: false, message: `Google Gemini verification failed (${res.status})` };
      }

      if (providerId === 'custom') {
        const ep = endpoint || 'http://localhost:8000/v1';
        const res = await fetch(`${ep.replace(/\/$/, '')}/models`, {
          headers: keyToUse ? { Authorization: `Bearer ${keyToUse}` } : {},
          signal: AbortSignal.timeout(3000),
        });
        if (res.ok) {
          return { success: true, message: 'Custom endpoint connected successfully!' };
        }
        return { success: false, message: `Custom endpoint returned status ${res.status}` };
      }

      return { success: true, message: `${providerId} configuration saved.` };
    } catch (err: any) {
      return { success: false, message: `Connection test error: ${err.message}` };
    }
  }

  static async createProviderForModel(modelId: string): Promise<LLMProvider> {
    const model = await ModelCatalog.getModelById(modelId);
    if (!model) {
      let raw = modelId.replace(/^ollama-/, '');
      if (raw === 'claude') {
        raw = 'qwen2.5-coder:14b';
      }
      return new OllamaProvider(raw);
    }

    if (model.providerId === 'ollama') {
      let rawModelName = model.id.startsWith('ollama-') ? model.id.replace('ollama-', '') : model.id;
      if (rawModelName === 'claude') {
        rawModelName = 'qwen2.5-coder:14b';
      }
      return new OllamaProvider(rawModelName);
    }

    const key = await CredentialStore.getApiKey(model.providerId);
    const anthropicKey = key || process.env.ANTHROPIC_API_KEY;
    const openaiKey = key || process.env.OPENAI_API_KEY;
    const googleKey = key || process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;

    if (model.providerId === 'anthropic' && anthropicKey) {
      return new AnthropicProvider(anthropicKey, model.id);
    }

    if (model.providerId === 'openai' && openaiKey) {
      return new OpenAICompatibleProvider('https://api.openai.com/v1', openaiKey, model.id);
    }

    if (model.providerId === 'google' && googleKey) {
      return new GoogleGeminiProvider(googleKey, model.id);
    }


    if (model.providerId === 'custom') {
      return new OpenAICompatibleProvider(
        process.env.CUSTOM_LLM_ENDPOINT || 'http://localhost:8000/v1',
        key || '',
        model.id
      );
    }

    // If cloud API key is missing, warn and fall back to local qwen2.5-coder:7b so agent remains operational
    console.warn(`[ProviderRegistry] No API key configured for ${model.providerId} (${model.id}). Falling back to local responsive model qwen2.5-coder:7b.`);
    return new OllamaProvider('qwen2.5-coder:7b');
  }
}
