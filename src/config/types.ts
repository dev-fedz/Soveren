export type ProviderId =
  | 'openai'
  | 'anthropic'
  | 'google'
  | 'mistral'
  | 'xai'
  | 'openrouter'
  | 'ollama'
  | 'custom';

export type AuthType = 'api_key' | 'oauth' | 'local' | 'none' | 'custom_endpoint';

export interface ModelCapabilities {
  text: boolean;
  vision: boolean;
  audio?: boolean;
  tools: boolean;
  structuredOutput?: boolean;
  streaming?: boolean;
}

export interface ModelLimits {
  maxOutputTokens?: number;
  requestsPerMinute?: number;
  tokensPerMinute?: number;
}

export interface ModelAuthentication {
  type: AuthType;
  credentialId?: string;
}

export interface ModelProfile {
  id: string;
  providerId: ProviderId;
  name: string;
  contextWindow: number;
  capabilities: ModelCapabilities;
  authentication: ModelAuthentication;
  limits?: ModelLimits;
  inputCost?: number; // USD per 1M tokens
  outputCost?: number; // USD per 1M tokens
  enabled: boolean;
  status?: 'connected' | 'ready' | 'context_high' | 'rate_limited' | 'auth_error' | 'unavailable' | 'not_configured';
  statusMessage?: string;
  isCustom?: boolean;
}

export interface ProviderConfig {
  id: ProviderId;
  name: string;
  endpoint?: string;
  authType: AuthType;
  hasKey?: boolean;
  maskedKey?: string;
  enabled: boolean;
  status: 'connected' | 'not_configured' | 'error' | 'testing';
  statusMessage?: string;
  customHeaders?: Record<string, string>;
  models?: string[]; // Model IDs supported by this provider
}

export interface SkillDefinition {
  id: string;
  name: string;
  description: string;
  category?: 'development' | 'project' | 'documentation' | 'testing' | 'custom';
  version?: string;
  requiredTools?: string[];
  requiredConnectors?: string[];
  enabled: boolean;
}

export interface SkillProfile {
  id: string;
  name: string;
  description: string;
  skills: string[]; // Skill IDs
}

export type ToolPermissionLevel = 'allow' | 'ask' | 'workspace' | 'deny';

export interface ToolDefinition {
  id: string;
  name: string;
  description: string;
  category?: string;
  inputSchema?: unknown;
  permissions: {
    default: ToolPermissionLevel;
    destructive?: boolean;
  };
  enabled: boolean;
}

export interface PluginDefinition {
  id: string;
  name: string;
  description: string;
  installed: boolean;
  enabled: boolean;
  tools?: string[];
  skills?: string[];
  connectors?: string[];
  permissions?: Record<string, boolean>;
}

export interface ConnectorDefinition {
  id: string;
  name: string;
  category: 'development' | 'communication' | 'productivity' | 'cloud' | 'databases';
  description: string;
  connected: boolean;
  enabled: boolean;
  status: 'connected' | 'disconnected' | 'error';
  permissions: Record<string, boolean>;
  availableResources?: string[];
}

export interface ContextWindowConfig {
  autoCompact: boolean;
  warningThreshold: number; // e.g. 0.70 (70%)
  highThreshold: number; // e.g. 0.85 (85%)
  criticalThreshold: number; // e.g. 0.95 (95%)
}

export interface ModelRoutingConfig {
  enabled: boolean;
  strategy: 'capability' | 'context' | 'cost' | 'speed' | 'user';
  rules?: Array<{
    taskType: string;
    targetModel: string;
  }>;
}

export interface ModelFallbackConfig {
  enabled: boolean;
  models: string[]; // Model IDs in fallback order
}

export interface WorkflowRoutingConfig {
  generalChat: string;
  planning: string;
  reasoning: string;
  coding: string;
  review: string;
  testing: string;
}

export type ChangeApprovalMode = 'automatic' | 'ask_before_changes' | 'review_after_task';

export interface AIRuntimeConfig {
  activeModel: string;
  models: ModelProfile[];
  providers: Record<ProviderId, ProviderConfig>;
  skills: {
    enabled: string[];
    activeProfile?: string;
  };
  tools: {
    enabled: string[];
    permissions: Record<string, ToolPermissionLevel>;
  };
  plugins: {
    enabled: string[];
  };
  connectors: {
    enabled: string[];
    permissions: Record<string, Record<string, boolean>>;
  };
  context: ContextWindowConfig;
  routing: ModelRoutingConfig;
  fallback: ModelFallbackConfig;
  workflowRouting?: WorkflowRoutingConfig;
  approvalMode?: ChangeApprovalMode;
}

export interface ProjectAISettings {
  preferredModel?: string;
  skills?: string[];
  tools?: string[];
  permissions?: Record<string, ToolPermissionLevel>;
}
