export type WorkspaceSurface = 'code' | 'browser' | 'inspect' | 'images' | 'docs';

export type InspectorPanelType =
  | 'elements'
  | 'console'
  | 'network'
  | 'performance'
  | 'memory'
  | 'application'
  | 'security';

export type AgentWorkspaceAction =
  | {
      type: 'open_file';
      path?: string;
      target?: string;
      line?: number;
      column?: number;
    }
  | {
      type: 'create_file';
      path?: string;
      target?: string;
      content?: string;
    }
  | {
      type: 'modify_file' | 'edit_file';
      path?: string;
      target?: string;
      line?: number;
      column?: number;
      content?: string;
    }
  | {
      type: 'delete_file';
      path?: string;
      target?: string;
    }
  | {
      type: 'open_browser';
      serviceId?: string;
      url?: string;
      target?: string;
    }
  | {
      type: 'close_browser';
      serviceId?: string;
      url?: string;
      target?: string;
    }
  | {
      type: 'open_image';
      path?: string;
      target?: string;
    }
  | {
      type: 'open_document';
      path?: string;
      target?: string;
      page?: number;
    }
  | {
      type: 'open_inspector';
      panel?: InspectorPanelType;
      target?: string;
    }
  | {
      type: 'focus_console';
      target?: string;
    }
  | {
      type: 'focus_network';
      target?: string;
    };

export type WorkspaceAction = AgentWorkspaceAction;

export type AgentWorkspaceStatus =
  | 'idle'
  | 'working'
  | 'testing'
  | 'waiting_for_user'
  | 'debugging'
  | 'paused'
  | 'completed'
  | 'failed';

export interface AgentWorkspaceState {
  activeSurface: WorkspaceSurface;
  activeFile?: string;
  activeFilePath?: string;
  activeFileLine?: number;
  activeFileColumn?: number;
  activeBrowserService?: string;
  activeBrowserTab?: string;
  activeBrowserUrl?: string;
  activeInspectorPanel?: InspectorPanelType;
  activeInspectPanel?: InspectorPanelType;
  activeImagePath?: string;
  activeDocPath?: string;
  status: AgentWorkspaceStatus;
  inspectStats?: {
    errorsCount: number;
    warningsCount: number;
    networkFailedCount: number;
  };
  fileBadges: Record<string, 'created' | 'modified' | 'deleted' | 'Created' | 'Modified' | 'Deleted'>;
}

export type WorkspaceState = AgentWorkspaceState;

export type PermissionFieldType = 'text' | 'password' | 'number' | 'boolean';

export interface PermissionField {
  name: string;
  label: string;
  type: PermissionFieldType;
  placeholder?: string;
  required?: boolean;
  defaultValue?: string | number | boolean;
}

export type PermissionRequestType =
  | 'credential'
  | 'confirmation'
  | 'external_access'
  | 'destructive_action'
  | 'captcha'
  | 'otp';

export interface AgentPermissionRequest {
  id: string;
  type: PermissionRequestType;
  title: string;
  explanation: string;
  required: boolean;
  fields?: PermissionField[];
  actionPayload?: Record<string, unknown>;
  createdAt: number;
}

export interface AgentPermissionResponse {
  requestId: string;
  approved: boolean;
  values?: Record<string, any>;
  data?: Record<string, any>;
  reason?: string;
}

export type ArtifactType =
  | 'file'
  | 'image'
  | 'document'
  | 'screenshot'
  | 'trace'
  | 'console'
  | 'network'
  | 'test-result';

export interface AgentArtifact {
  id: string;
  taskId: string;
  type: ArtifactType;
  title: string;
  path?: string;
  content?: string;
  metadata?: Record<string, unknown>;
  createdAt: number;
}

export type TestStepAction =
  | 'navigate'
  | 'click'
  | 'fill'
  | 'type'
  | 'select'
  | 'hover'
  | 'scroll'
  | 'wait'
  | 'assert'
  | 'screenshot'
  | 'script';

export interface TestStep {
  action: TestStepAction;
  selector?: string;
  text?: string;
  role?: string;
  placeholder?: string;
  label?: string;
  value?: string;
  expected?: string;
  url?: string;
  timeout?: number;
  timeoutMs?: number;
  description?: string;
}

export interface TestStepResult {
  step: TestStep;
  status: 'passed' | 'failed' | 'skipped';
  durationMs: number;
  error?: string;
  actual?: any;
}

export interface AutomationTestReport {
  id: string;
  name: string;
  success: boolean;
  durationMs: number;
  steps: TestStepResult[];
  screenshotArtifactId?: string;
  failureScreenshotId?: string;
  screenshotPath?: string;
  consoleErrors: ConsoleMessage[];
  networkFailures: NetworkRequestLog[];
  timestamp: number;
}

export interface DOMNodeInfo {
  tag: string;
  id?: string;
  className?: string;
  classes?: string[];
  attributes?: Record<string, string>;
  textContent?: string;
  innerHTML?: string;
  outerHTML?: string;
  xpath?: string;
  cssSelector?: string;
  boundingBox?: { x: number; y: number; width: number; height: number };
  computedStyles?: Record<string, string>;
  accessibility?: { role?: string; label?: string; ariaLabel?: string };
  children?: DOMNodeInfo[];
}

export interface ConsoleMessage {
  id: string;
  level: 'log' | 'info' | 'warn' | 'error';
  text: string;
  timestamp: number;
  source?: string;
  line?: number;
  column?: number;
  stack?: string;
}

export interface NetworkRequestLog {
  id: string;
  url: string;
  method: string;
  status: number;
  statusText?: string;
  durationMs: number;
  type: string;
  requestHeaders?: Record<string, string>;
  responseHeaders?: Record<string, string>;
  requestPayload?: string;
  responsePayload?: string;
  timestamp: number;
  failed: boolean;
  error?: string;
}

export interface PerformanceMetrics {
  navigationTiming?: {
    dnsTime?: number;
    connectTime?: number;
    ttfb?: number;
    domContentLoaded?: number;
    pageLoad?: number;
  };
  resourceCount?: number;
  totalResourceDurationMs?: number;
  resources?: Array<{ name: string; type: string; duration: number; size?: number }>;
  recordedAt: number;
}

export interface MemoryMetrics {
  supported: boolean;
  jsHeapSizeLimit?: number;
  totalJSHeapSize?: number;
  usedJSHeapSize?: number;
  heapUsagePercentage?: number;
  message?: string;
}

export interface StorageInspection {
  localStorage: Record<string, string>;
  sessionStorage: Record<string, string>;
  cookies: Array<{ name: string; value: string; domain?: string; path?: string }>;
}

export interface SecurityInspection {
  protocol: string;
  isHttps: boolean;
  certificateStatus?: string;
  mixedContentDetected: boolean;
  cspConfigured: boolean;
  cspPolicies?: string[];
  corsHeaders?: Record<string, string>;
  securityWarnings: string[];
}
