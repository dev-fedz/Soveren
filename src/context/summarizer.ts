import { Message } from '../llm/types.js';

export class ContextSummarizer {
  /**
   * Summarizes a set of messages to reduce token count while preserving critical info.
   * In Phase 8, we use a simple heuristic: keep the system prompt, the first user request,
   * and summarize the intermediate tool-use cycles.
   */
  static async summarize(messages: Message[], provider: any): Promise<Message[]> {
    if (messages.length < 10) return messages;

    const systemPrompt = messages.find(m => m.role === 'system');
    const firstUserRequest = messages.find(m => m.role === 'user');
    
    // We keep the system prompt and first request.
    // We summarize everything else.
    const toSummarize = messages.filter(m => m !== systemPrompt && m !== firstUserRequest);
    const contentToSummarize = toSummarize.map(m => `${m.role}: ${m.content}`).join('\n');

    const summaryRequest: Message[] = [
      { 
        role: 'system', 
        content: 'Summarize the following conversation history. Preserve key decisions, changed files, and test results. Keep it concise.' 
      },
      { 
        role: 'user', 
        content: contentToSummarize 
      }
    ];

    try {
      const response = await provider.chat(summaryRequest);
      const summaryMessage: Message = { 
        role: 'system', 
        content: `Summary of previous interaction: ${response.content}` 
      };

      return [
        ...(systemPrompt ? [systemPrompt] : []),
        ...(firstUserRequest ? [firstUserRequest] : []),
        summaryMessage
      ];
    } catch (e) {
      console.error('Summarization failed, returning original messages', e);
      return messages;
    }
  }
}
