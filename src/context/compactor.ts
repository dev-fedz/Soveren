import { Message } from '../llm/types.js';

export interface TaskState {
  goal: string;
  requirements: string[];
  decisions: string[];
  filesModified: string[];
  filesReferenced: string[];
  pendingActions: string[];
  unresolvedErrors: string[];
  activeConstraints: string[];
  lastCompactedAt?: number;
}

export interface CompactedContext {
  taskState: TaskState;
  summaryText: string;
  originalMessageCount: number;
  compactedMessageCount: number;
  tokensBefore: number;
  tokensAfter: number;
  messages: Message[];
}

export class ContextCompactor {
  /**
   * Approximate token count for arbitrary text (standard 4 chars per token rule of thumb)
   */
  static estimateTokens(text: string): number {
    if (!text) return 0;
    return Math.ceil(text.length / 3.8);
  }

  static estimateMessagesTokens(messages: Message[]): number {
    return messages.reduce((acc, m) => acc + this.estimateTokens(m.content) + 4, 0);
  }

  /**
   * High-fidelity context compaction adhering to Section 12 of specification.
   * Extracts essential requirements, decisions, files, errors, and constraints.
   */
  static compact(
    messages: Message[],
    workspaceContext?: string,
    existingTaskState?: Partial<TaskState>
  ): CompactedContext {
    const tokensBefore = this.estimateMessagesTokens(messages);
    const requirements: Set<string> = new Set(existingTaskState?.requirements || []);
    const decisions: Set<string> = new Set(existingTaskState?.decisions || []);
    const filesModified: Set<string> = new Set(existingTaskState?.filesModified || []);
    const filesReferenced: Set<string> = new Set(existingTaskState?.filesReferenced || []);
    const unresolvedErrors: Set<string> = new Set(existingTaskState?.unresolvedErrors || []);
    const pendingActions: Set<string> = new Set(existingTaskState?.pendingActions || []);
    const activeConstraints: Set<string> = new Set(existingTaskState?.activeConstraints || []);

    let goal = existingTaskState?.goal || '';

    // Regex scanners for structured extraction
    const fileRegex = /([a-zA-Z0-9_\-\.\/]+\.(?:ts|tsx|js|jsx|json|css|html|md|py|go|rs|sh|sql))/gi;

    for (let i = 0; i < messages.length; i++) {
      const msg = messages[i];
      const text = msg.content;

      // Extract goal from initial user messages
      if (msg.role === 'user' && !goal && text.length > 5) {
        goal = text.slice(0, 160).replace(/\n/g, ' ');
      }

      // Discover file references
      const matches = text.match(fileRegex);
      if (matches) {
        for (const f of matches) {
          if (!f.includes('node_modules') && !f.includes('dist/')) {
            filesReferenced.add(f);
          }
        }
      }

      // Track code edits / writes
      if (text.includes('write_to_file') || text.includes('replace_file_content') || text.includes('edit_file')) {
        const fileMatch = text.match(/(?:TargetFile|filePath|path)["':\s]+([^\s"',}]+)/i);
        if (fileMatch && fileMatch[1]) {
          filesModified.add(fileMatch[1]);
        }
      }

      // Track errors being resolved
      if (text.toLowerCase().includes('error:') || text.toLowerCase().includes('fail') || text.toLowerCase().includes('exception')) {
        const errorLines = text.split('\n').filter(l => /error|fail|exception/i.test(l)).slice(0, 2);
        errorLines.forEach(el => unresolvedErrors.add(el.trim().slice(0, 120)));
      }

      // Track key user requirements
      if (msg.role === 'user') {
        const lines = text.split('\n').map(l => l.trim()).filter(l => l.startsWith('-') || l.startsWith('*') || l.length > 10);
        lines.slice(0, 3).forEach(l => requirements.add(l.slice(0, 140)));
      }

      // Track decisions
      if (msg.role === 'assistant' && (text.includes('decided') || text.includes('implemented') || text.includes('created'))) {
        const decisionLines = text.split('\n').filter(l => /decided|implemented|created/i.test(l)).slice(0, 2);
        decisionLines.forEach(dl => decisions.add(dl.trim().slice(0, 140)));
      }
    }

    const taskState: TaskState = {
      goal: goal || 'Ongoing coding and workspace assistance',
      requirements: Array.from(requirements).slice(0, 8),
      decisions: Array.from(decisions).slice(0, 8),
      filesModified: Array.from(filesModified).slice(0, 10),
      filesReferenced: Array.from(filesReferenced).slice(0, 15),
      pendingActions: Array.from(pendingActions).slice(0, 5),
      unresolvedErrors: Array.from(unresolvedErrors).slice(0, 5),
      activeConstraints: Array.from(activeConstraints).slice(0, 5),
      lastCompactedAt: Date.now(),
    };

    // Build synthesized compact memory system prompt
    const stateSummaryLines: string[] = [
      `[COMPACTED TASK CONTEXT]`,
      `Goal: ${taskState.goal}`,
    ];

    if (taskState.requirements.length > 0) {
      stateSummaryLines.push(`Key Requirements:\n` + taskState.requirements.map(r => ` - ${r}`).join('\n'));
    }
    if (taskState.decisions.length > 0) {
      stateSummaryLines.push(`Decisions & Progress:\n` + taskState.decisions.map(d => ` - ${d}`).join('\n'));
    }
    if (taskState.filesModified.length > 0) {
      stateSummaryLines.push(`Modified Files: ${taskState.filesModified.join(', ')}`);
    }
    if (taskState.unresolvedErrors.length > 0) {
      stateSummaryLines.push(`Errors to Address:\n` + taskState.unresolvedErrors.map(e => ` - ${e}`).join('\n'));
    }

    const compactSummaryText = stateSummaryLines.join('\n\n');

    // Keep the most recent 3 messages verbatim for immediate conversational flow
    const recentMessages = messages.slice(-3);

    const compactedMessages: Message[] = [
      {
        role: 'system',
        content: compactSummaryText,
      },
      ...recentMessages,
    ];

    const tokensAfter = this.estimateMessagesTokens(compactedMessages);

    return {
      taskState,
      summaryText: compactSummaryText,
      originalMessageCount: messages.length,
      compactedMessageCount: compactedMessages.length,
      tokensBefore,
      tokensAfter,
      messages: compactedMessages,
    };
  }
}
