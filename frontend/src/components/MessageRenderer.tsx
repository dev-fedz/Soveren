import React, { Component, type ReactNode } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

import { AgentActivityTimeline } from './AgentActivityTimeline';
import { ChangedFilesPanel } from './ChangedFilesPanel';
import { AgentActivity, AgentSession, ChangedFile } from '../types/agent';
import { FileCode } from 'lucide-react';

// --- Types ---
interface ChatMessage {
  role: 'user' | 'agent' | 'system';
  content: string;
  type?: 'step' | 'response' | 'error';
  activities?: AgentActivity[];
  changedFiles?: ChangedFile[];
  fileReviewTags?: Record<string, 'accepted' | 'rejected'>;
}

// --- Error Boundary ---
interface ErrorBoundaryProps {
  fallbackContent: string;
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

class RenderErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('[MessageRenderer] Render failure:', {
      error: error.message,
      stack: error.stack,
      componentStack: errorInfo.componentStack,
    });
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="render-error">
          <div className="render-error-label">Unable to render formatted message. Showing plain text instead.</div>
          <div className="render-error-content">{this.props.fallbackContent}</div>
        </div>
      );
    }
    return this.props.children;
  }
}

// --- Message Content Renderer ---
function MessageContent({ content }: { content: string }) {
  // Ensure content is a valid string
  const safeContent = typeof content === 'string' ? content : String(content ?? '');

  if (!safeContent.trim()) {
    return <span className="msg-empty">(empty message)</span>;
  }

  return (
    <RenderErrorBoundary fallbackContent={safeContent}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          // Custom code block renderer
          code({ node, className, children, ...props }) {
            const isInline = !className;
            if (isInline) {
              return <code className="inline-code" {...props}>{children}</code>;
            }
            return (
              <pre className="code-block">
                <code className={className} {...props}>{children}</code>
              </pre>
            );
          },
        }}
      >
        {safeContent}
      </ReactMarkdown>
    </RenderErrorBoundary>
  );
}

// --- Main Message Renderer ---
export function MessageRenderer({
  msg,
  isLastAgentMessage,
  activeSession,
  onSelectDiff,
  onAcceptChange,
  onRejectChange,
  onAcceptAll,
  onRejectAll,
  diffViewFile,
  onNewSession,
}: {
  msg: ChatMessage;
  isLastAgentMessage?: boolean;
  activeSession?: AgentSession | null;
  onSelectDiff?: (file: ChangedFile) => void;
  onAcceptChange?: (path: string, file?: ChangedFile) => void;
  onRejectChange?: (path: string, file?: ChangedFile) => void;
  onAcceptAll?: (files?: ChangedFile[]) => void;
  onRejectAll?: (files?: ChangedFile[]) => void;
  diffViewFile?: ChangedFile | null;
  onNewSession?: () => void;
}) {
  const isUser = msg.role === 'user';
  const isStep = msg.type === 'step' || (typeof msg.content === 'string' && msg.content.startsWith('Calling tool:'));
  const isError = msg.type === 'error';

  // Step messages should never be shown as chat bubbles
  if (isStep) {
    return null;
  }

  // For agent messages, show activities before the reply bubble:
  // Use msg.activities if attached, or fallback to activeSession?.activities if this is the last agent message
  const activitiesToShow = !isUser
    ? msg.activities || (isLastAgentMessage ? activeSession?.activities : undefined)
    : undefined;

  const changedFilesToShow = !isUser
    ? msg.changedFiles || (isLastAgentMessage ? activeSession?.changedFiles : undefined)
    : undefined;

  // Normalize content
  const content = typeof msg.content === 'string'
    ? msg.content
    : typeof msg.content === 'object'
      ? JSON.stringify(msg.content, null, 2)
      : String(msg.content ?? '');

  return (
    <div className={`msg-block ${isUser ? 'msg-block-user' : 'msg-block-agent'}`}>
      {/* Agent activities (thought, task completed, tools, etc.) rendered AFTER the chat and BEFORE the reply */}
      {!isUser && activitiesToShow && activitiesToShow.length > 0 && (
        <div className="msg-activities-wrapper">
          <AgentActivityTimeline
            activities={activitiesToShow}
            session={activeSession}
            fileReviewTags={msg.fileReviewTags}
            onSelectDiff={onSelectDiff}
            onNewSession={onNewSession}
            hideHeader={true}
            inline={true}
          />
        </div>
      )}

      {/* Changed files panel rendered inline before the reply if present */}
      {!isUser && changedFilesToShow && changedFilesToShow.length > 0 && (
        <div className="msg-changed-files-wrapper">
          <ChangedFilesPanel
            changedFiles={changedFilesToShow}
            onSelectFile={onSelectDiff || (() => {})}
            onAcceptChange={onAcceptChange || (() => {})}
            onRejectChange={onRejectChange || (() => {})}
            onAcceptAll={onAcceptAll || (() => {})}
            onRejectAll={onRejectAll || (() => {})}
            selectedFilePath={diffViewFile?.path}
          />
        </div>
      )}

      {/* Review status tags once files are accepted or rejected */}
      {!isUser && msg.fileReviewTags && Object.keys(msg.fileReviewTags).length > 0 && (
        <div className="msg-review-tags-wrapper">
          {Object.entries(msg.fileReviewTags).map(([fPath, status]) => {
            const basename = fPath.split('/').pop() || fPath;
            return (
              <div key={fPath} className={`file-review-tag tag-${status}`}>
                <FileCode size={13} className="tag-file-icon" />
                <span className="tag-file-name">{basename}</span>
                <span className={`tag-status-badge badge-${status}`}>
                  {status === 'accepted' ? 'accepted' : 'rejected'}
                </span>
              </div>
            );
          })}
        </div>
      )}

      <div className={`msg-row ${isUser ? 'msg-row-user' : 'msg-row-agent'}`}>
        {!isUser && (
          <div className="msg-avatar msg-avatar-ai">AI</div>
        )}
        <div className={`msg-bubble ${
          isStep ? 'msg-step' :
          isError ? 'msg-error' :
          isUser ? 'msg-user' : 'msg-agent'
        }`}>
          {isStep ? (
            <span className="msg-step-text">{content}</span>
          ) : (
            <MessageContent content={content} />
          )}
        </div>
        {isUser && (
          <div className="msg-avatar msg-avatar-user">Me</div>
        )}
      </div>
    </div>
  );
}

export type { ChatMessage };
