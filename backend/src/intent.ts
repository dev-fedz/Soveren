// --- Types ---
export type ProjectIntent = 'CHAT' | 'NEW_PROJECT' | 'EXISTING_PROJECT';

export interface IntentResult {
  intent: ProjectIntent;
  confidence: number; // 0-1
  reason: string;
}

// --- Pattern Definitions ---
const NEW_PROJECT_PATTERNS = [
  /\b(build|create|make|start|generate|scaffold|bootstrap|initialize|init|setup|spin up)\b.*\b(app|application|project|site|website|webapp|web app|dashboard|api|backend|frontend|service|platform|portfolio|blog|ecommerce|e-commerce|store|tool)\b/i,
  /\b(new)\b.*\b(project|app|application|site|website)\b/i,
  /\bfrom scratch\b/i,
];

const EXISTING_PROJECT_PATTERNS = [
  /\b(fix|debug|refactor|update|upgrade|modify|change|edit|patch|improve|optimize|clean|restructure)\b.*\b(bug|error|issue|code|file|component|function|method|class|module|page|route|style|test|tests|config|api|navbar|header|footer)\b/i,
  /\b(add|implement|integrate)\b.*\b(feature|page|component|route|endpoint|middleware|test|tests|auth|authentication|authorization|login|signup|register|dark mode|search|filter|pagination|notification|validation|dashboard|settings|navbar|header)\b/i,
  /\b(fix|debug|resolve|investigate)\b.*\b(bug|error|crash|issue|problem|warning|failure)\b/i,
  /\b(fix the|update the|change the|modify the|refactor the|improve the|add a|add the|remove the|delete the)\b/i,
  /\bcontinue\s+(working|building|coding|developing)\b/i,
  /\bwork on (my|the|this)\b/i,
  /\b(my|the|this) (project|app|application|codebase|code|repo|repository)\b/i,
];

const CHAT_PATTERNS = [
  /^(hi|hello|hey|howdy|greetings|sup|yo|good morning|good afternoon|good evening)\b/i,
  /\b(what is|what are|explain|describe|tell me about|how does|how do|what does|why is|why do|when should|can you explain|help me understand)\b/i,
  /\b(what framework|which language|which library|best practice|recommend|suggestion|comparison|difference between|pros and cons|vs\b)/i,
  /\bthank(s| you)\b/i,
  /^(yes|no|ok|okay|sure|got it|I see|understood)\b/i,
];

// --- Intent Detection ---
export function detectIntent(
  message: string,
  hasActiveWorkspace: boolean,
  conversationHistory: Array<{ role: string; content: string }> = [],
): IntentResult {
  const trimmed = message.trim();

  // Very short messages are almost always chat
  if (trimmed.length < 4) {
    return { intent: 'CHAT', confidence: 0.95, reason: 'Very short message' };
  }

  // Check explicit chat patterns first
  for (const pattern of CHAT_PATTERNS) {
    if (pattern.test(trimmed)) {
      // But check for follow-up: "okay, build it" after a discussion
      const isFollowUpBuild = /\b(okay|ok|sure|yes|alright|go ahead|let'?s do it|build it|create it|make it|do it)\b/i.test(trimmed);
      if (isFollowUpBuild && conversationHistory.length > 0) {
        // Check if previous messages discussed a project type
        const recentContext = conversationHistory
          .slice(-4)
          .map(m => m.content)
          .join(' ');

        if (/\b(app|application|project|website|dashboard)\b/i.test(recentContext)) {
          return {
            intent: 'NEW_PROJECT',
            confidence: 0.7,
            reason: 'Follow-up confirmation to create a project discussed in conversation',
          };
        }
      }
      return { intent: 'CHAT', confidence: 0.9, reason: 'Matches conversational pattern' };
    }
  }

  // If a workspace is active and the message looks action-oriented, assume existing project
  if (hasActiveWorkspace) {
    const activeProjectActions = /\b(add|fix|update|change|remove|delete|create|move|rename|install|run|start|launch|test|deploy|push|commit|list|show|browse|read|view|navigate|open)\b/i;
    if (activeProjectActions.test(trimmed)) {
      return {
        intent: 'EXISTING_PROJECT',
        confidence: 0.85,
        reason: 'Action-oriented message with active workspace',
      };
    }
  }

  // Check new project patterns
  for (const pattern of NEW_PROJECT_PATTERNS) {
    if (pattern.test(trimmed)) {
      return {
        intent: 'NEW_PROJECT',
        confidence: 0.85,
        reason: 'Matches new project creation pattern',
      };
    }
  }

  // Check existing project patterns
  for (const pattern of EXISTING_PROJECT_PATTERNS) {
    if (pattern.test(trimmed)) {
      return {
        intent: 'EXISTING_PROJECT',
        confidence: 0.85,
        reason: 'Matches existing project modification pattern',
      };
    }
  }

  // Default to chat
  return { intent: 'CHAT', confidence: 0.5, reason: 'No strong project-related signal detected' };
}
