import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import {
  AIRuntimeConfig,
  ModelProfile,
  ProviderConfig,
  SkillDefinition,
  SkillProfile,
  ToolDefinition,
  PluginDefinition,
  ConnectorDefinition,
  ProjectAISettings,
  ProviderId,
  ToolPermissionLevel,
} from './types.js';
import { CredentialStore } from './credentialStore.js';

export const DEFAULT_MODELS: ModelProfile[] = [
  {
    id: 'claude-3-7-sonnet-20250219',
    providerId: 'anthropic',
    name: 'Claude 3.7 Sonnet',
    contextWindow: 200000,
    capabilities: { text: true, vision: true, tools: true, structuredOutput: true, streaming: true },
    authentication: { type: 'api_key' },
    limits: { maxOutputTokens: 8192 },
    inputCost: 3.0,
    outputCost: 15.0,
    enabled: true,
    status: 'ready',
  },
  {
    id: 'claude-3-5-haiku-20241022',
    providerId: 'anthropic',
    name: 'Claude 3.5 Haiku',
    contextWindow: 200000,
    capabilities: { text: true, vision: true, tools: true, structuredOutput: true, streaming: true },
    authentication: { type: 'api_key' },
    limits: { maxOutputTokens: 8192 },
    inputCost: 0.8,
    outputCost: 4.0,
    enabled: true,
    status: 'ready',
  },
  {
    id: 'gpt-4o',
    providerId: 'openai',
    name: 'GPT-4o',
    contextWindow: 128000,
    capabilities: { text: true, vision: true, tools: true, structuredOutput: true, streaming: true },
    authentication: { type: 'api_key' },
    limits: { maxOutputTokens: 4096 },
    inputCost: 2.5,
    outputCost: 10.0,
    enabled: true,
    status: 'ready',
  },
  {
    id: 'gpt-4o-mini',
    providerId: 'openai',
    name: 'GPT-4o Mini',
    contextWindow: 128000,
    capabilities: { text: true, vision: true, tools: true, structuredOutput: true, streaming: true },
    authentication: { type: 'api_key' },
    limits: { maxOutputTokens: 4096 },
    inputCost: 0.15,
    outputCost: 0.6,
    enabled: true,
    status: 'ready',
  },
  {
    id: 'o3-mini',
    providerId: 'openai',
    name: 'o3-mini',
    contextWindow: 200000,
    capabilities: { text: true, vision: false, tools: true, structuredOutput: true, streaming: true },
    authentication: { type: 'api_key' },
    limits: { maxOutputTokens: 100000 },
    inputCost: 1.1,
    outputCost: 4.4,
    enabled: true,
    status: 'ready',
  },
  {
    id: 'gemini-3.8-flash-low',
    providerId: 'google',
    name: 'Gemini 3.8 Flash (Low)',
    contextWindow: 1048576,
    capabilities: { text: true, vision: true, audio: true, tools: true, structuredOutput: true, streaming: true },
    authentication: { type: 'api_key' },
    limits: { maxOutputTokens: 65536 },
    inputCost: 0.15,
    outputCost: 0.6,
    enabled: true,
    status: 'ready',
    statusMessage: 'Low reasoning effort • Fast response',
  },
  {
    id: 'gemini-3.8-flash-mid',
    providerId: 'google',
    name: 'Gemini 3.8 Flash (Mid)',
    contextWindow: 1048576,
    capabilities: { text: true, vision: true, audio: true, tools: true, structuredOutput: true, streaming: true },
    authentication: { type: 'api_key' },
    limits: { maxOutputTokens: 65536 },
    inputCost: 0.15,
    outputCost: 0.6,
    enabled: true,
    status: 'ready',
    statusMessage: 'Medium reasoning effort • Balanced',
  },
  {
    id: 'gemini-3.8-flash-high',
    providerId: 'google',
    name: 'Gemini 3.8 Flash (High)',
    contextWindow: 1048576,
    capabilities: { text: true, vision: true, audio: true, tools: true, structuredOutput: true, streaming: true },
    authentication: { type: 'api_key' },
    limits: { maxOutputTokens: 65536 },
    inputCost: 0.15,
    outputCost: 0.6,
    enabled: true,
    status: 'ready',
    statusMessage: 'High reasoning effort • Deep thinking',
  },
  {
    id: 'gemini-3.8-flash',
    providerId: 'google',
    name: 'Gemini 3.8 Flash',
    contextWindow: 1048576,
    capabilities: { text: true, vision: true, audio: true, tools: true, structuredOutput: true, streaming: true },
    authentication: { type: 'api_key' },
    limits: { maxOutputTokens: 65536 },
    inputCost: 0.15,
    outputCost: 0.6,
    enabled: true,
    status: 'ready',
    statusMessage: 'Dynamic reasoning • General purpose',
  },
  {
    id: 'gemini-2.5-pro',
    providerId: 'google',
    name: 'Gemini 2.5 Pro',
    contextWindow: 1000000,
    capabilities: { text: true, vision: true, audio: true, tools: true, structuredOutput: true, streaming: true },
    authentication: { type: 'api_key' },
    limits: { maxOutputTokens: 8192 },
    inputCost: 1.25,
    outputCost: 5.0,
    enabled: true,
    status: 'ready',
  },
  {
    id: 'gemini-2.0-flash',
    providerId: 'google',
    name: 'Gemini 2.0 Flash',
    contextWindow: 1000000,
    capabilities: { text: true, vision: true, audio: true, tools: true, structuredOutput: true, streaming: true },
    authentication: { type: 'api_key' },
    limits: { maxOutputTokens: 8192 },
    inputCost: 0.1,
    outputCost: 0.4,
    enabled: true,
    status: 'ready',
  },
  {
    id: 'ollama-claude',
    providerId: 'ollama',
    name: 'Ollama: Claude (Local)',
    contextWindow: 32768,
    capabilities: { text: true, vision: false, tools: true, streaming: true },
    authentication: { type: 'local' },
    inputCost: 0,
    outputCost: 0,
    enabled: true,
    status: 'ready',
  },
  {
    id: 'custom-model',
    providerId: 'custom',
    name: 'Custom OpenAI-Compatible Model',
    contextWindow: 65536,
    capabilities: { text: true, vision: false, tools: true, streaming: true },
    authentication: { type: 'custom_endpoint' },
    enabled: false,
    status: 'not_configured',
    isCustom: true,
  }
];

export const DEFAULT_PROVIDERS: Record<ProviderId, ProviderConfig> = {
  anthropic: {
    id: 'anthropic',
    name: 'Anthropic',
    endpoint: 'https://api.anthropic.com/v1',
    authType: 'api_key',
    enabled: true,
    status: 'not_configured',
    models: ['claude-3-7-sonnet-20250219', 'claude-3-5-haiku-20241022'],
  },
  openai: {
    id: 'openai',
    name: 'OpenAI',
    endpoint: 'https://api.openai.com/v1',
    authType: 'api_key',
    enabled: true,
    status: 'not_configured',
    models: ['gpt-4o', 'gpt-4o-mini', 'o3-mini'],
  },
  google: {
    id: 'google',
    name: 'Google Gemini',
    endpoint: 'https://generativelanguage.googleapis.com',
    authType: 'api_key',
    enabled: true,
    status: 'not_configured',
    models: [
      'gemini-3.8-flash-low',
      'gemini-3.8-flash-mid',
      'gemini-3.8-flash-high',
      'gemini-3.8-flash',
      'gemini-2.5-pro',
      'gemini-2.0-flash',
    ],
  },
  ollama: {
    id: 'ollama',
    name: 'Ollama (Local)',
    endpoint: process.env.OLLAMA_HOST || 'http://localhost:11434',
    authType: 'local',
    enabled: true,
    status: 'connected',
    models: ['ollama-claude'],
  },
  mistral: {
    id: 'mistral',
    name: 'Mistral AI',
    endpoint: 'https://api.mistral.ai/v1',
    authType: 'api_key',
    enabled: false,
    status: 'not_configured',
  },
  xai: {
    id: 'xai',
    name: 'xAI (Grok)',
    endpoint: 'https://api.x.ai/v1',
    authType: 'api_key',
    enabled: false,
    status: 'not_configured',
  },
  openrouter: {
    id: 'openrouter',
    name: 'OpenRouter',
    endpoint: 'https://openrouter.ai/api/v1',
    authType: 'api_key',
    enabled: false,
    status: 'not_configured',
  },
  custom: {
    id: 'custom',
    name: 'Custom / OpenAI-Compatible',
    endpoint: 'http://localhost:8000/v1',
    authType: 'custom_endpoint',
    enabled: false,
    status: 'not_configured',
  },
};

export const DEFAULT_SKILLS: SkillDefinition[] = [
  { id: 'code-generation', name: 'Code Generation', description: 'Generate robust code, modules, and boilerplate', category: 'development', enabled: true },
  { id: 'code-review', name: 'Code Review', description: 'Review code quality, conventions, and style', category: 'development', enabled: true },
  { id: 'debugging', name: 'Debugging', description: 'Diagnose runtime errors and fix logic defects', category: 'development', enabled: true },
  { id: 'refactoring', name: 'Refactoring', description: 'Improve structure without altering behavior', category: 'development', enabled: true },
  { id: 'performance-opt', name: 'Performance Optimization', description: 'Analyze performance bottlenecks and optimize resources', category: 'development', enabled: false },

  { id: 'project-analysis', name: 'Project Analysis', description: 'Analyze architecture and file hierarchies', category: 'project', enabled: true },
  { id: 'dependency-analysis', name: 'Dependency Analysis', description: 'Audit package manifests and compatibility', category: 'project', enabled: true },
  { id: 'architecture-analysis', name: 'Architecture Analysis', description: 'High-level system design patterns evaluation', category: 'project', enabled: false },

  { id: 'doc-generation', name: 'Documentation Generation', description: 'Generate READMEs, JSDocs, and guides', category: 'documentation', enabled: true },
  { id: 'api-doc', name: 'API Documentation', description: 'Generate OpenAPI/Swagger specifications', category: 'documentation', enabled: false },

  { id: 'test-generation', name: 'Test Generation', description: 'Generate unit, integration, and E2E tests', category: 'testing', enabled: true },
  { id: 'test-debugging', name: 'Test Debugging', description: 'Analyze and resolve failing test suites', category: 'testing', enabled: true },
  { id: 'property-testing', name: 'Property-Based Testing', description: 'Generate generative property tests', category: 'testing', enabled: false },
];

export const DEFAULT_SKILL_PROFILES: SkillProfile[] = [
  {
    id: 'web-dev',
    name: 'Web Development',
    description: 'React, Next.js, TypeScript, styling, and client-side testing',
    skills: ['code-generation', 'code-review', 'debugging', 'refactoring', 'test-generation', 'doc-generation'],
  },
  {
    id: 'backend-dev',
    name: 'Backend Development',
    description: 'APIs, database models, services, architecture, and robust testing',
    skills: ['code-generation', 'debugging', 'refactoring', 'project-analysis', 'dependency-analysis', 'architecture-analysis', 'test-generation', 'test-debugging'],
  },
  {
    id: 'minimal',
    name: 'Minimal',
    description: 'Core code editing and generation only with low overhead',
    skills: ['code-generation', 'debugging'],
  },
  {
    id: 'full-stack',
    name: 'Full Stack Suite',
    description: 'All development, testing, analysis, and documentation skills enabled',
    skills: DEFAULT_SKILLS.map(s => s.id),
  }
];

export const DEFAULT_TOOLS: ToolDefinition[] = [
  { id: 'read_file', name: 'File Read', description: 'Read file contents from the workspace', category: 'Files', permissions: { default: 'allow' }, enabled: true },
  { id: 'write_file', name: 'File Write', description: 'Create new files or overwrite content', category: 'Files', permissions: { default: 'workspace', destructive: true }, enabled: true },
  { id: 'edit_file', name: 'File Edit', description: 'Apply diffs or precise targeted line edits', category: 'Files', permissions: { default: 'workspace' }, enabled: true },
  { id: 'search_files', name: 'Search Files', description: 'Find files by glob or pattern', category: 'Navigation', permissions: { default: 'allow' }, enabled: true },
  { id: 'search_text', name: 'Search Text', description: 'Ripgrep search across workspace files', category: 'Navigation', permissions: { default: 'allow' }, enabled: true },
  { id: 'shell', name: 'Terminal / Shell', description: 'Execute CLI commands in workspace', category: 'System', permissions: { default: 'ask', destructive: true }, enabled: true },
  { id: 'git', name: 'Git Operations', description: 'Inspect git status, commits, and diffs', category: 'Version Control', permissions: { default: 'ask' }, enabled: true },
  { id: 'formatter', name: 'Code Formatter', description: 'Format source files via Prettier, Black, etc.', category: 'Quality', permissions: { default: 'allow' }, enabled: true },
  { id: 'lint', name: 'Code Diagnostics', description: 'Run linters and type checkers', category: 'Quality', permissions: { default: 'allow' }, enabled: true },
  { id: 'test_runner', name: 'Test Runner', description: 'Execute unit and integration tests', category: 'Testing', permissions: { default: 'ask' }, enabled: true },
  { id: 'browser', name: 'Browser Subagent', description: 'Automate browser navigation and testing', category: 'Web', permissions: { default: 'ask' }, enabled: false },
  { id: 'web_search', name: 'Web Search', description: 'Query external technical documentation', category: 'Web', permissions: { default: 'ask' }, enabled: false },
  { id: 'http_request', name: 'HTTP Request', description: 'Make arbitrary REST or HTTP requests', category: 'Network', permissions: { default: 'ask' }, enabled: false },
  { id: 'package_manager', name: 'Package Manager', description: 'Install or update project dependencies', category: 'Dependencies', permissions: { default: 'ask', destructive: true }, enabled: false },
];

export const DEFAULT_PLUGINS: PluginDefinition[] = [
  {
    id: 'github',
    name: 'GitHub Integration',
    description: 'Inspect repositories, issues, PRs, and branch workflows',
    installed: true,
    enabled: true,
    tools: ['git'],
    permissions: {
      'read_repositories': true,
      'read_issues': true,
      'create_issues': false,
      'modify_pull_requests': false,
      'merge_pull_requests': false,
    },
  },
  {
    id: 'database-tools',
    name: 'Database Tools',
    description: 'Inspect schemas, run queries, and validate migrations',
    installed: true,
    enabled: true,
    permissions: {
      'read_schemas': true,
      'execute_readonly_queries': true,
      'execute_mutations': false,
      'run_migrations': false,
    },
  },
  {
    id: 'docker',
    name: 'Docker Tools',
    description: 'Inspect containers, view logs, and format Dockerfiles',
    installed: true,
    enabled: true,
    permissions: {
      'read_containers': true,
      'view_logs': true,
      'start_stop_containers': false,
      'build_images': false,
    },
  },
  {
    id: 'kubernetes',
    name: 'Kubernetes',
    description: 'Cluster inspection and manifest verification',
    installed: false,
    enabled: false,
  },
  {
    id: 'jira',
    name: 'Jira Software',
    description: 'Sync tickets and track development progress',
    installed: false,
    enabled: false,
  },
];

export const DEFAULT_CONNECTORS: ConnectorDefinition[] = [
  {
    id: 'github-connector',
    name: 'GitHub',
    category: 'development',
    description: 'Connect to GitHub user repositories and pulls',
    connected: false,
    enabled: true,
    status: 'disconnected',
    permissions: { 'read_code': true, 'read_issues': true, 'write_code': false },
    availableResources: ['Repositories', 'Issues', 'Pull Requests'],
  },
  {
    id: 'slack-connector',
    name: 'Slack',
    category: 'communication',
    description: 'Send notifications and collaborate with team members',
    connected: false,
    enabled: false,
    status: 'disconnected',
    permissions: { 'post_messages': false, 'read_channels': false },
  },
  {
    id: 'discord-connector',
    name: 'Discord',
    category: 'communication',
    description: 'Discord channel bot and pairing controls',
    connected: false,
    enabled: false,
    status: 'disconnected',
    permissions: { 'post_messages': false, 'read_messages': false },
  },
  {
    id: 'notion-connector',
    name: 'Notion',
    category: 'productivity',
    description: 'Read specifications and sync documentation pages',
    connected: false,
    enabled: false,
    status: 'disconnected',
    permissions: { 'read_pages': false, 'write_pages': false },
  },
  {
    id: 'google-drive-connector',
    name: 'Google Drive',
    category: 'productivity',
    description: 'Access design documents and project assets',
    connected: false,
    enabled: false,
    status: 'disconnected',
    permissions: { 'read_files': false, 'write_files': false },
  },
  {
    id: 'postgres-connector',
    name: 'PostgreSQL',
    category: 'databases',
    description: 'Connect to Postgres database for schema inspection',
    connected: false,
    enabled: false,
    status: 'disconnected',
    permissions: { 'read_schema': true, 'run_queries': false },
  },
  {
    id: 'sqlite-connector',
    name: 'SQLite',
    category: 'databases',
    description: 'Direct local SQLite database query reader',
    connected: true,
    enabled: true,
    status: 'connected',
    permissions: { 'read_schema': true, 'run_queries': true },
  },
];

export class SettingsManager {
  private static configDir = path.join(os.homedir(), '.ai-native-editor');
  private static globalSettingsFile = path.join(os.homedir(), '.ai-native-editor', 'settings.json');
  private static cachedGlobalConfig: AIRuntimeConfig | null = null;

  static getDefaultConfig(): AIRuntimeConfig {
    const toolPermissions: Record<string, ToolPermissionLevel> = {};
    DEFAULT_TOOLS.forEach(t => {
      toolPermissions[t.id] = t.permissions.default;
    });

    const connectorPermissions: Record<string, Record<string, boolean>> = {};
    DEFAULT_CONNECTORS.forEach(c => {
      connectorPermissions[c.id] = { ...c.permissions };
    });

    return {
      activeModel: 'claude-3-7-sonnet-20250219',
      models: [...DEFAULT_MODELS],
      providers: { ...DEFAULT_PROVIDERS },
      skills: {
        enabled: DEFAULT_SKILLS.filter(s => s.enabled).map(s => s.id),
        activeProfile: 'web-dev',
      },
      tools: {
        enabled: DEFAULT_TOOLS.filter(t => t.enabled).map(t => t.id),
        permissions: toolPermissions,
      },
      plugins: {
        enabled: DEFAULT_PLUGINS.filter(p => p.enabled).map(p => p.id),
      },
      connectors: {
        enabled: DEFAULT_CONNECTORS.filter(c => c.enabled).map(c => c.id),
        permissions: connectorPermissions,
      },
      context: {
        autoCompact: true,
        warningThreshold: 0.70,
        highThreshold: 0.85,
        criticalThreshold: 0.95,
      },
      routing: {
        enabled: false,
        strategy: 'capability',
        rules: [
          { taskType: 'Code Generation', targetModel: 'claude-3-7-sonnet-20250219' },
          { taskType: 'Large Codebase Analysis', targetModel: 'gemini-2.5-pro' },
          { taskType: 'Quick Question', targetModel: 'gpt-4o-mini' },
          { taskType: 'Local / Offline', targetModel: 'ollama-claude' },
        ],
      },
      fallback: {
        enabled: true,
        models: ['gpt-4o', 'gemini-2.5-pro', 'ollama-claude'],
      },
      workflowRouting: {
        generalChat: 'qwen2.5-coder:7b',
        planning: 'gemma4:31b-cloud',
        reasoning: 'gemma4:31b-cloud',
        coding: 'qwen2.5-coder:7b',
        review: 'qwen2.5-coder:7b',
        testing: 'qwen2.5-coder:7b',
      },
      approvalMode: 'automatic',
    };
  }

  static async getGlobalConfig(): Promise<AIRuntimeConfig> {
    if (this.cachedGlobalConfig) {
      return this.cachedGlobalConfig;
    }

    try {
      await fs.mkdir(this.configDir, { recursive: true, mode: 0o700 });
      const content = await fs.readFile(this.globalSettingsFile, 'utf-8');
      const loaded = JSON.parse(content);
      const defaults = this.getDefaultConfig();
      // Deep merge models: ensure all default models exist even if loaded has a previous models list
      const mergedModelsMap = new Map<string, ModelProfile>();
      for (const m of defaults.models) {
        mergedModelsMap.set(m.id, m);
      }
      for (const m of (loaded.models || [])) {
        mergedModelsMap.set(m.id, { ...(mergedModelsMap.get(m.id) || {}), ...m });
      }

      // Deep merge to ensure all new keys exist
      this.cachedGlobalConfig = {
        ...defaults,
        ...loaded,
        models: Array.from(mergedModelsMap.values()),
        providers: {
          ...defaults.providers,
          ...(loaded.providers || {}),
          google: {
            ...defaults.providers.google,
            ...(loaded.providers?.google || {}),
            models: Array.from(new Set([
              ...(defaults.providers.google.models || []),
              ...(loaded.providers?.google?.models || [])
            ])),
          },
        },
        context: { ...defaults.context, ...(loaded.context || {}) },
        skills: { ...defaults.skills, ...(loaded.skills || {}) },
        tools: { ...defaults.tools, ...(loaded.tools || {}) },
        plugins: { ...defaults.plugins, ...(loaded.plugins || {}) },
        connectors: { ...defaults.connectors, ...(loaded.connectors || {}) },
        routing: { ...defaults.routing, ...(loaded.routing || {}) },
        fallback: { ...defaults.fallback, ...(loaded.fallback || {}) },
        workflowRouting: { ...defaults.workflowRouting, ...(loaded.workflowRouting || {}) },
        approvalMode: loaded.approvalMode || defaults.approvalMode || 'automatic',
      };
    } catch {
      this.cachedGlobalConfig = this.getDefaultConfig();
      await this.saveGlobalConfig(this.cachedGlobalConfig);
    }

    return this.cachedGlobalConfig!;
  }

  static async saveGlobalConfig(config: AIRuntimeConfig): Promise<void> {
    try {
      await fs.mkdir(this.configDir, { recursive: true, mode: 0o700 });
      await fs.writeFile(this.globalSettingsFile, JSON.stringify(config, null, 2), {
        encoding: 'utf-8',
        mode: 0o600,
      });
      this.cachedGlobalConfig = config;
    } catch (err) {
      console.error('[SettingsManager] Failed to save global config:', err);
    }
  }

  static async updateGlobalConfig(updates: Partial<AIRuntimeConfig>): Promise<AIRuntimeConfig> {
    const current = await this.getGlobalConfig();
    const updated: AIRuntimeConfig = {
      ...current,
      ...updates,
      context: { ...current.context, ...(updates.context || {}) },
      skills: { ...current.skills, ...(updates.skills || {}) },
      tools: { ...current.tools, ...(updates.tools || {}) },
      plugins: { ...current.plugins, ...(updates.plugins || {}) },
      connectors: { ...current.connectors, ...(updates.connectors || {}) },
      routing: { ...current.routing, ...(updates.routing || {}) },
      fallback: { ...current.fallback, ...(updates.fallback || {}) },
    };
    await this.saveGlobalConfig(updated);
    return updated;
  }

  // --- PROJECT SETTINGS HIERARCHY ---
  static getProjectConfigPath(workspacePath: string): string {
    return path.join(workspacePath, '.ai', 'settings.json');
  }

  static async getProjectSettings(workspacePath: string): Promise<ProjectAISettings | null> {
    try {
      const p = this.getProjectConfigPath(workspacePath);
      const content = await fs.readFile(p, 'utf-8');
      return JSON.parse(content) as ProjectAISettings;
    } catch {
      return null;
    }
  }

  static async saveProjectSettings(workspacePath: string, settings: ProjectAISettings): Promise<void> {
    try {
      const aiDir = path.join(workspacePath, '.ai');
      await fs.mkdir(aiDir, { recursive: true });
      const p = this.getProjectConfigPath(workspacePath);
      await fs.writeFile(p, JSON.stringify(settings, null, 2), 'utf-8');
    } catch (err) {
      console.error(`[SettingsManager] Failed to save project settings in ${workspacePath}:`, err);
    }
  }

  // --- RESOLVED RUNTIME CONFIG (Global -> Workspace -> Project -> Task Overrides) ---
  static async getResolvedConfig(
    workspacePath?: string | null,
    taskOverrides?: Partial<AIRuntimeConfig>
  ): Promise<AIRuntimeConfig> {
    const base = await this.getGlobalConfig();
    let resolved: AIRuntimeConfig = JSON.parse(JSON.stringify(base));

    // Apply project-level settings if workspace is provided
    if (workspacePath && workspacePath !== '__global__') {
      const projectSettings = await this.getProjectSettings(workspacePath);
      if (projectSettings) {
        if (projectSettings.preferredModel) {
          resolved.activeModel = projectSettings.preferredModel;
        }
        if (projectSettings.skills) {
          resolved.skills.enabled = projectSettings.skills;
        }
        if (projectSettings.tools) {
          resolved.tools.enabled = projectSettings.tools;
        }
        if (projectSettings.permissions) {
          resolved.tools.permissions = {
            ...resolved.tools.permissions,
            ...projectSettings.permissions,
          };
        }
      }
    }

    // Apply task-specific overrides if provided
    if (taskOverrides) {
      resolved = {
        ...resolved,
        ...taskOverrides,
        context: { ...resolved.context, ...(taskOverrides.context || {}) },
        skills: { ...resolved.skills, ...(taskOverrides.skills || {}) },
        tools: { ...resolved.tools, ...(taskOverrides.tools || {}) },
      };
    }

    // Populate credentials status without exposing actual keys
    const maskedKeys = await CredentialStore.getAllMasked();
    for (const [pId, pConf] of Object.entries(resolved.providers) as [ProviderId, ProviderConfig][]) {
      const cred = maskedKeys[pId];
      if (pId === 'ollama') {
        pConf.status = 'connected';
        pConf.hasKey = true;
      } else if (cred?.hasKey) {
        pConf.hasKey = true;
        pConf.maskedKey = cred.maskedKey;
        pConf.status = 'connected';
      } else {
        pConf.hasKey = false;
        pConf.status = 'not_configured';
      }
    }

    return resolved;
  }

  // --- RESET CATEGORY ---
  static async resetCategory(category: string): Promise<AIRuntimeConfig> {
    const defaults = this.getDefaultConfig();
    const current = await this.getGlobalConfig();

    switch (category) {
      case 'models':
        current.models = [...defaults.models];
        current.activeModel = defaults.activeModel;
        break;
      case 'providers':
        current.providers = { ...defaults.providers };
        break;
      case 'skills':
        current.skills = { ...defaults.skills };
        break;
      case 'tools':
        current.tools = { ...defaults.tools };
        break;
      case 'plugins':
        current.plugins = { ...defaults.plugins };
        break;
      case 'connectors':
        current.connectors = { ...defaults.connectors };
        break;
      case 'context':
        current.context = { ...defaults.context };
        break;
      case 'routing':
        current.routing = { ...defaults.routing };
        current.fallback = { ...defaults.fallback };
        break;
      case 'all':
        await this.saveGlobalConfig(defaults);
        return defaults;
    }

    await this.saveGlobalConfig(current);
    return current;
  }

  // --- EXPORT / IMPORT (NON-SECRET) ---
  static async exportConfig(): Promise<string> {
    const config = await this.getGlobalConfig();
    // Return clean configuration without any credentials or sensitive information
    const clean = {
      version: '1.0.0',
      exportedAt: new Date().toISOString(),
      activeModel: config.activeModel,
      models: config.models.map(m => ({ ...m, authentication: { type: m.authentication.type } })),
      skills: config.skills,
      tools: config.tools,
      plugins: config.plugins,
      connectors: config.connectors,
      context: config.context,
      routing: config.routing,
      fallback: config.fallback,
    };
    return JSON.stringify(clean, null, 2);
  }

  static async importConfig(jsonString: string): Promise<AIRuntimeConfig> {
    const parsed = JSON.parse(jsonString);
    if (!parsed || typeof parsed !== 'object') {
      throw new Error('Invalid settings JSON format');
    }
    const current = await this.getGlobalConfig();
    const merged: AIRuntimeConfig = {
      ...current,
      activeModel: parsed.activeModel || current.activeModel,
      models: parsed.models || current.models,
      skills: parsed.skills || current.skills,
      tools: parsed.tools || current.tools,
      plugins: parsed.plugins || current.plugins,
      connectors: parsed.connectors || current.connectors,
      context: parsed.context || current.context,
      routing: parsed.routing || current.routing,
      fallback: parsed.fallback || current.fallback,
    };
    await this.saveGlobalConfig(merged);
    return merged;
  }
}
