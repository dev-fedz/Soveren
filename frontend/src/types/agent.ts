export type AgentActivityType =
  | 'thinking'
  | 'exploring'
  | 'reading'
  | 'editing'
  | 'command'
  | 'test'
  | 'search'
  | 'planning'
  | 'reasoning'
  | 'review'
  | 'error'
  | 'completed';

export interface AgentActivityModel {
  provider: string;
  name: string;
}

export interface AgentActivityFile {
  path: string;
  additions?: number;
  deletions?: number;
  diff?: string;
  oldContent?: string;
  newContent?: string;
  exploredFiles?: string[];
}

export interface CommandSubItem {
  command: string;
  status: 'running' | 'completed' | 'failed';
  exitCode?: number;
  duration?: number;
}

export interface AgentActivityCommand {
  command: string;
  exitCode?: number;
  stdout?: string;
  stderr?: string;
  duration?: number;
  commands?: CommandSubItem[];
}

export interface AgentActivityTest {
  testFile?: string;
  passed?: number;
  failed?: number;
  output?: string;
}

export interface AgentActivity {
  id: string;
  type: AgentActivityType;
  title: string;
  description?: string;
  status: 'running' | 'completed' | 'failed';
  timestamp: number;
  duration?: number;
  model?: AgentActivityModel;
  file?: AgentActivityFile;
  command?: AgentActivityCommand;
  test?: AgentActivityTest;
  metadata?: Record<string, unknown>;
}

export interface ChangedFile {
  path: string;
  additions: number;
  deletions: number;
  originalContent: string;
  modifiedContent: string;
  diff?: string;
  status: 'pending' | 'accepted' | 'rejected';
}

export type AgentSessionStatus =
  | 'idle'
  | 'planning'
  | 'reasoning'
  | 'coding'
  | 'reviewing'
  | 'testing'
  | 'completed'
  | 'failed';

export interface AgentSession {
  id: string;
  workspace?: string;
  status: AgentSessionStatus;
  taskTitle: string;
  currentModel?: AgentActivityModel;
  activities: AgentActivity[];
  changedFiles: ChangedFile[];
  pendingChanges: ChangedFile[];
}

export type ChangeApprovalMode =
  | 'automatic'
  | 'ask_before_changes'
  | 'review_after_task';

export interface WorkflowRoutingConfig {
  planningModel?: string;
  reasoningModel?: string;
  codingModel?: string;
  reviewModel?: string;
  testingModel?: string;
}
