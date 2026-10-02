import { LLMProvider, Message, LLMResponse } from './types.js';
import dotenv from 'dotenv';

dotenv.config();

export class OllamaProvider implements LLMProvider {
  private host: string;
  private model: string;

  constructor(model?: string, host?: string) {
    this.host = host || process.env.OLLAMA_HOST || 'http://localhost:11434';
    this.model = model || process.env.OLLAMA_MODEL || 'qwen2.5-coder:7b';
  }

  async chat(messages: Message[]): Promise<LLMResponse> {
    const response = await fetch(`${this.host}/api/chat`, {
      method: 'POST',
      body: JSON.stringify({
        model: this.model,
        messages: messages,
        stream: false,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Ollama API error (${response.status}): ${errText || response.statusText}`);
    }

    const data = await response.json();
    let content = data.message?.content || '';
    const thinking = data.message?.thinking || data.message?.reasoning_content || undefined;

    // If Ollama parsed native tool_calls, synthesize the tool call instruction format
    if (data.message?.tool_calls && Array.isArray(data.message.tool_calls) && data.message.tool_calls.length > 0) {
      for (const call of data.message.tool_calls) {
        if (call.function?.name) {
          const fnName = call.function.name.replace(/[:\s]+$/, '');
          const args = typeof call.function.arguments === 'object'
            ? JSON.stringify(call.function.arguments)
            : (call.function.arguments || '{}');
          content += (content ? '\n' : '') + `[${fnName}: ${args}]`;
        }
      }
    }

    return {
      content,
      thinking,
      stopReason: data.done ? 'stop' : 'length',
    };
  }

  async chatStream(
    messages: Message[],
    onChunk: (chunk: string) => void,
    onThinking?: (thoughtChunk: string) => void
  ): Promise<LLMResponse> {
    const response = await fetch(`${this.host}/api/chat`, {
      method: 'POST',
      body: JSON.stringify({
        model: this.model,
        messages: messages,
        stream: true,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Ollama API error (${response.status}): ${errText || response.statusText}`);
    }

    const reader = response.body?.getReader();
    const decoder = new TextDecoder();
    let fullContent = '';
    let fullThinking = '';

    if (!reader) {
      throw new Error('Failed to get reader from response body');
    }

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value, { stream: true });
      const lines = chunk.split('\n');

      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const json = JSON.parse(line);
          const thinkingChunk = json.message?.thinking || json.message?.reasoning_content;
          if (thinkingChunk) {
            fullThinking += thinkingChunk;
            if (onThinking) onThinking(thinkingChunk);
          }
          if (json.message?.content) {
            const content = json.message.content;
            fullContent += content;
            onChunk(content);
          }
          if (json.message?.tool_calls && Array.isArray(json.message.tool_calls)) {
            for (const call of json.message.tool_calls) {
              if (call.function?.name) {
                const fnName = call.function.name.replace(/[:\s]+$/, '');
                const args = typeof call.function.arguments === 'object'
                  ? JSON.stringify(call.function.arguments)
                  : (call.function.arguments || '{}');
                const toolStr = (fullContent ? '\n' : '') + `[${fnName}: ${args}]`;
                fullContent += toolStr;
                onChunk(toolStr);
              }
            }
          }
          if (json.done) {
            return {
              content: fullContent,
              thinking: fullThinking || undefined,
              stopReason: 'stop',
            };
          }
        } catch (e) {
          // Ignore partial JSON lines
        }
      }
    }

    return {
      content: fullContent,
      thinking: fullThinking || undefined,
      stopReason: 'stop',
    };
  }

  async generateEmbedding(text: string): Promise<number[]> {
    const response = await fetch(`${this.host}/api/embeddings`, {
      method: 'POST',
      body: JSON.stringify({
        model: this.model,
        prompt: text,
      }),
    });

    if (!response.ok) {
      throw new Error(`Ollama Embedding API error: ${response.statusText}`);
    }

    const data = await response.json();
    return data.embedding;
  }
}
