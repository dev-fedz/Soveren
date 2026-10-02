import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { ProviderId } from './types.js';

export class CredentialStore {
  private static credentials: Map<ProviderId, string> = new Map();
  private static initialized: boolean = false;
  private static configDir: string = path.join(os.homedir(), '.ai-native-editor');
  private static credentialsFile: string = path.join(os.homedir(), '.ai-native-editor', 'credentials.json');

  static async initialize(): Promise<void> {
    if (this.initialized) return;

    // 1. Initialize from environment variables first (if present)
    if (process.env.OPENAI_API_KEY) this.credentials.set('openai', process.env.OPENAI_API_KEY);
    if (process.env.ANTHROPIC_API_KEY) this.credentials.set('anthropic', process.env.ANTHROPIC_API_KEY);
    if (process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY) {
      this.credentials.set('google', (process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY)!);
    }
    if (process.env.MISTRAL_API_KEY) this.credentials.set('mistral', process.env.MISTRAL_API_KEY);
    if (process.env.XAI_API_KEY) this.credentials.set('xai', process.env.XAI_API_KEY);
    if (process.env.OPENROUTER_API_KEY) this.credentials.set('openrouter', process.env.OPENROUTER_API_KEY);

    // 2. Load from secure local user config file
    try {
      await fs.mkdir(this.configDir, { recursive: true, mode: 0o700 });
      const content = await fs.readFile(this.credentialsFile, 'utf-8');
      const saved = JSON.parse(content);
      if (typeof saved === 'object' && saved !== null) {
        for (const [provider, key] of Object.entries(saved)) {
          if (typeof key === 'string' && key.trim()) {
            this.credentials.set(provider as ProviderId, key.trim());
          }
        }
      }
    } catch {
      // Credentials file might not exist yet; that is normal
    }

    this.initialized = true;
  }

  private static async persist(): Promise<void> {
    try {
      await fs.mkdir(this.configDir, { recursive: true, mode: 0o700 });
      const record: Record<string, string> = {};
      for (const [provider, key] of this.credentials.entries()) {
        record[provider] = key;
      }
      await fs.writeFile(this.credentialsFile, JSON.stringify(record, null, 2), {
        encoding: 'utf-8',
        mode: 0o600, // strict permissions
      });
    } catch (err) {
      console.error('[CredentialStore] Failed to save credentials securely:', err);
    }
  }

  static async setApiKey(providerId: ProviderId, apiKey: string): Promise<void> {
    await this.initialize();
    const trimmed = apiKey.trim();
    if (!trimmed) {
      await this.deleteApiKey(providerId);
      return;
    }
    this.credentials.set(providerId, trimmed);
    await this.persist();
  }

  static async getApiKey(providerId: ProviderId): Promise<string | undefined> {
    await this.initialize();
    return this.credentials.get(providerId);
  }

  static async hasApiKey(providerId: ProviderId): Promise<boolean> {
    await this.initialize();
    const key = this.credentials.get(providerId);
    return Boolean(key && key.trim().length > 0);
  }

  static async deleteApiKey(providerId: ProviderId): Promise<void> {
    await this.initialize();
    if (this.credentials.has(providerId)) {
      this.credentials.delete(providerId);
      await this.persist();
    }
  }

  static maskKey(rawKey?: string): string {
    if (!rawKey) return '';
    const trimmed = rawKey.trim();
    if (trimmed.length <= 8) {
      return '••••••••';
    }
    const prefix = trimmed.slice(0, 4);
    const suffix = trimmed.slice(-4);
    return `${prefix}••••••••••••${suffix}`;
  }

  static async getMaskedApiKey(providerId: ProviderId): Promise<string> {
    await this.initialize();
    const raw = this.credentials.get(providerId);
    return this.maskKey(raw);
  }

  static async getAllMasked(): Promise<Record<ProviderId, { hasKey: boolean; maskedKey: string }>> {
    await this.initialize();
    const providers: ProviderId[] = [
      'openai',
      'anthropic',
      'google',
      'mistral',
      'xai',
      'openrouter',
      'ollama',
      'custom',
    ];

    const result = {} as Record<ProviderId, { hasKey: boolean; maskedKey: string }>;
    for (const p of providers) {
      const raw = this.credentials.get(p);
      result[p] = {
        hasKey: Boolean(raw && raw.trim().length > 0),
        maskedKey: this.maskKey(raw),
      };
    }
    return result;
  }
}
