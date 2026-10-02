export interface Message {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface LLMResponse {
  content: string;
  thinking?: string;
  stopReason: string;
}

export interface LLMProvider {
  chat(messages: Message[]): Promise<LLMResponse>;
  chatStream(
    messages: Message[],
    onChunk: (chunk: string) => void,
    onThinking?: (thoughtChunk: string) => void
  ): Promise<LLMResponse>;
}
