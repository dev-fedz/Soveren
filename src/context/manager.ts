import { Message } from '../llm/types.js';
import { ContextSummarizer } from './summarizer.js';

export class ContextManager {
  private histories: Map<string, Message[]> = new Map();
  private currentKey: string = '__global__';
  private maxMessages: number = 20;

  constructor(private provider: any) {
    this.histories.set('__global__', []);
  }

  setWorkspace(workspaceKey: string | null) {
    this.currentKey = workspaceKey || '__global__';
    if (!this.histories.has(this.currentKey)) {
      this.histories.set(this.currentKey, []);
    }
  }

  getCurrentKey(): string {
    return this.currentKey;
  }

  addMessage(message: Message, workspaceKey?: string | null) {
    const key = workspaceKey !== undefined ? (workspaceKey || '__global__') : this.currentKey;
    if (!this.histories.has(key)) {
      this.histories.set(key, []);
    }
    const history = this.histories.get(key)!;
    history.push(message);
    this.manageContext(key);
  }

  async manageContext(key: string = this.currentKey) {
    const history = this.histories.get(key) || [];
    if (history.length > this.maxMessages) {
      const summarized = await ContextSummarizer.summarize(history, this.provider);
      this.histories.set(key, summarized);
    }
  }

  getHistory(workspaceKey?: string | null): Message[] {
    const key = workspaceKey !== undefined ? (workspaceKey || '__global__') : this.currentKey;
    return this.histories.get(key) || [];
  }

  clear(workspaceKey?: string | null) {
    const key = workspaceKey !== undefined ? (workspaceKey || '__global__') : this.currentKey;
    this.histories.set(key, []);
  }

  setHistory(messages: Message[], workspaceKey?: string | null) {
    const key = workspaceKey !== undefined ? (workspaceKey || '__global__') : this.currentKey;
    this.histories.set(key, [...messages]);
  }
}

