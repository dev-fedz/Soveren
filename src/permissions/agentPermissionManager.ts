import { EventEmitter } from 'events';
import crypto from 'crypto';
import {
  AgentPermissionRequest,
  AgentPermissionResponse,
  PermissionField,
  PermissionRequestType,
} from '../workspace/types.js';
import { globalWorkspaceState } from '../workspace/workspaceState.js';

export class AgentPermissionManager extends EventEmitter {
  private static instance: AgentPermissionManager;
  private pendingRequests = new Map<
    string,
    {
      request: AgentPermissionRequest;
      resolve: (response: AgentPermissionResponse) => void;
      reject: (err: Error) => void;
    }
  >();

  // Secure credential store: keeps sensitive values in memory without exposing them to LLM context
  private credentialVault = new Map<string, any>();

  // Configurable auto-approval in test / automated environments
  private autoApproveMockValues: Record<string, any> | null = null;

  constructor() {
    super();
  }

  static getInstance(): AgentPermissionManager {
    if (!AgentPermissionManager.instance) {
      AgentPermissionManager.instance = new AgentPermissionManager();
    }
    return AgentPermissionManager.instance;
  }

  setAutoApprove(mockValues: Record<string, any> | null) {
    this.autoApproveMockValues = mockValues;
  }

  /**
   * Request human interaction / credentials / approval.
   * Pauses agent execution until the user submits the response or cancels.
   */
  async requestPermission(options: {
    type: PermissionRequestType;
    title: string;
    explanation: string;
    required?: boolean;
    fields?: PermissionField[];
    actionPayload?: Record<string, unknown>;
  }): Promise<AgentPermissionResponse> {
    const id = `perm_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    const request: AgentPermissionRequest = {
      id,
      type: options.type,
      title: options.title,
      explanation: options.explanation,
      required: options.required ?? true,
      fields: options.fields || [],
      actionPayload: options.actionPayload,
      createdAt: Date.now(),
    };

    // If auto-approve mock is set (e.g. in automated unit tests)
    if (this.autoApproveMockValues) {
      return {
        requestId: id,
        approved: true,
        values: this.autoApproveMockValues,
      };
    }

    // Update workspace status to waiting_for_user
    globalWorkspaceState.setStatus('waiting_for_user');

    return new Promise<AgentPermissionResponse>((resolve, reject) => {
      this.pendingRequests.set(id, { request, resolve, reject });
      this.emit('permission_requested', request);
    });
  }

  onRequest(listener: (req: AgentPermissionRequest) => void): () => void {
    this.on('permission_requested', listener);
    return () => this.off('permission_requested', listener);
  }

  onResolved(listener: (res: AgentPermissionResponse) => void): () => void {
    this.on('permission_resolved', listener);
    return () => this.off('permission_resolved', listener);
  }

  /**
   * User submitted approval / credentials or cancelled from the UI modal.
   */
  respond(requestId: string, approved: boolean, values?: Record<string, any>, reason?: string): boolean {
    const pending = this.pendingRequests.get(requestId);
    if (!pending) return false;

    this.pendingRequests.delete(requestId);

    const sanitizedValues: Record<string, any> = {};

    // If credentials were provided, store them in the secure vault and mask passwords
    if (approved && values) {
      for (const [k, v] of Object.entries(values)) {
        this.credentialVault.set(k, v);
        this.credentialVault.set(`${requestId}_${k}`, v);

        // Mask secrets/passwords before returning to the model / UI logs
        if (k.toLowerCase().includes('password') || k.toLowerCase().includes('secret') || k.toLowerCase().includes('token')) {
          sanitizedValues[k] = '••••••••';
        } else {
          sanitizedValues[k] = v;
        }
      }
    }

    // Resume workspace state
    globalWorkspaceState.setStatus('working');

    const response: AgentPermissionResponse = {
      requestId,
      approved,
      values: sanitizedValues,
      data: sanitizedValues,
      reason,
    };

    this.emit('permission_resolved', response);
    pending.resolve(response);
    return true;
  }

  /**
   * Cancel a pending request
   */
  cancelRequest(requestId: string, reason = 'Cancelled by user'): boolean {
    const pending = this.pendingRequests.get(requestId);
    if (!pending) return false;

    this.pendingRequests.delete(requestId);
    globalWorkspaceState.setStatus('working');

    const response: AgentPermissionResponse = {
      requestId,
      approved: false,
      reason,
    };

    this.emit('permission_cancelled', response);
    pending.resolve(response);
    return true;
  }

  getPendingRequests(): AgentPermissionRequest[] {
    return Array.from(this.pendingRequests.values()).map((p) => p.request);
  }

  getSecureCredential(key: string): any {
    return this.credentialVault.get(key);
  }

  getVaultedCredential(key: string): any {
    return this.credentialVault.get(key);
  }

  clearCredentials(): void {
    this.credentialVault.clear();
  }
}

export const agentPermissionManager = AgentPermissionManager.getInstance();
