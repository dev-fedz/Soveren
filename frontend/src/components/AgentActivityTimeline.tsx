import React, { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  AgentActivity,
  AgentSession,
  ChangedFile,
} from '../types/agent';
import {
  Check,
  CheckCircle2,
  XCircle,
  Loader2,
  ChevronDown,
  ChevronRight,
  Brain,
  Terminal,
  FileCode,
  FileSearch,
  BookOpen,
  FlaskConical,
  ClipboardList,
  SearchCheck,
  AlertCircle,
  Plus,
  RotateCcw,
  Sparkles,
  ExternalLink,
} from 'lucide-react';

interface AgentActivityTimelineProps {
  session?: AgentSession | null;
  activities?: AgentActivity[];
  fileReviewTags?: Record<string, 'accepted' | 'rejected'>;
  onNewSession?: () => void;
  onSelectDiff?: (file: ChangedFile) => void;
  onRefresh?: () => void;
  hideHeader?: boolean;
  inline?: boolean;
}

export const AgentActivityTimeline: React.FC<AgentActivityTimelineProps> = ({
  session,
  activities,
  fileReviewTags,
  onNewSession,
  onSelectDiff,
  onRefresh,
  hideHeader = false,
  inline = false,
}) => {
  const [expandedIds, setExpandedIds] = useState<Record<string, boolean>>({});

  const toggleExpand = (id: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setExpandedIds((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const activitiesToRender = activities || session?.activities || [];
  if (activitiesToRender.length === 0) {
    return null;
  }

  const renderStatusIcon = (status: 'running' | 'completed' | 'failed') => {
    switch (status) {
      case 'running':
        return <Loader2 size={13} className="timeline-spinner text-blue animate-spin" />;
      case 'completed':
        return <Check size={13} className="timeline-status-icon text-green" />;
      case 'failed':
        return <XCircle size={13} className="timeline-status-icon text-red" />;
      default:
        return null;
    }
  };

  const renderModelBadge = (model?: { provider: string; name: string }) => {
    if (!model) return null;
    return (
      <span className="activity-model-badge">
        {model.name} · {model.provider}
      </span>
    );
  };

  return (
    <div className={`agent-timeline-container ${inline ? 'inline' : ''}`}>
      {/* Task Header (Section 51) */}
      {!hideHeader && session && (
        <div className="agent-task-header">
          <div className="agent-task-info">
            <Sparkles size={14} className="agent-task-icon text-purple" />
            <span className="agent-task-title" title={session.taskTitle}>
              {session.taskTitle || 'Agent Task'}
            </span>
            {session.status && (
              <span className={`agent-session-status-badge status-${session.status}`}>
                {session.status === 'coding' || session.status === 'planning' || session.status === 'testing' || session.status === 'reasoning' ? (
                  <>
                    <span className="pulsing-dot" />
                    {session.status}
                  </>
                ) : (
                  session.status
                )}
              </span>
            )}
          </div>
          <div className="agent-task-actions">
            {onRefresh && (
              <button
                className="agent-header-btn"
                onClick={onRefresh}
                title="Refresh session state"
              >
                <RotateCcw size={12} />
              </button>
            )}
            {onNewSession && (
              <button
                className="agent-header-btn btn-new-session"
                onClick={onNewSession}
                title="Start a new agent session"
              >
                <Plus size={13} />
                <span>New Task</span>
              </button>
            )}
          </div>
        </div>
      )}

      {/* Activity Timeline List (Section 31-48, 58) */}
      <div className="agent-activities-list">
        {activitiesToRender.map((activity) => {
          const isExpanded = expandedIds[activity.id] !== undefined
            ? !!expandedIds[activity.id]
            : (activity.status === 'running' && (activity.type === 'reasoning' || activity.type === 'thinking'));
          const hasDetails =
            !!activity.model ||
            !!activity.description ||
            (activity.file?.exploredFiles && activity.file.exploredFiles.length > 0) ||
            (activity.command?.commands && activity.command.commands.length > 0) ||
            !!activity.command?.stdout ||
            !!activity.command?.stderr ||
            !!activity.test?.output;

          return (
            <div
              key={activity.id}
              className={`timeline-activity-item type-${activity.type} status-${activity.status} ${
                isExpanded ? 'expanded' : ''
              }`}
            >
              <div
                className={`timeline-activity-main ${hasDetails ? 'clickable' : ''}`}
                onClick={() => hasDetails && toggleExpand(activity.id)}
              >
                {/* Status indicator */}
                <div className="timeline-icon-col">
                  {activity.status === 'running' ? (
                    <Loader2 size={13} className="timeline-spinner text-blue animate-spin" />
                  ) : activity.type === 'completed' ? (
                    <CheckCircle2 size={13} className="activity-type-icon text-green" />
                  ) : activity.type === 'planning' ? (
                    <ClipboardList size={13} className="activity-type-icon text-cyan" />
                  ) : activity.type === 'reasoning' || activity.type === 'thinking' ? (
                    <Brain size={13} className="activity-type-icon text-purple" />
                  ) : activity.type === 'exploring' ? (
                    <FileSearch size={13} className="activity-type-icon text-blue" />
                  ) : activity.type === 'reading' ? (
                    <BookOpen size={13} className="activity-type-icon text-amber" />
                  ) : activity.type === 'editing' ? (
                    <FileCode size={13} className="activity-type-icon text-orange" />
                  ) : activity.type === 'command' ? (
                    <Terminal size={13} className="activity-type-icon text-gray" />
                  ) : activity.type === 'test' ? (
                    <FlaskConical size={13} className="activity-type-icon text-green" />
                  ) : activity.type === 'review' ? (
                    <SearchCheck size={13} className="activity-type-icon text-purple" />
                  ) : (
                    renderStatusIcon(activity.status)
                  )}
                </div>

                {/* Content */}
                <div className="timeline-content-col">
                  <div className="activity-header-line">
                    <span className="activity-title">{activity.title}</span>

                    {/* Diff line stats for editing */}
                    {activity.type === 'editing' && activity.file && (() => {
                      const fPath = activity.file.path || '';
                      const reviewStatus = fileReviewTags?.[fPath] ||
                        (fileReviewTags && Object.entries(fileReviewTags).find(([k]) => fPath.endsWith(k) || k.endsWith(fPath))?.[1]);

                      return (
                        <div className="diff-stat-pills">
                          {(activity.file.additions ?? 0) > 0 && (
                            <span className="diff-pill additions">+{activity.file.additions}</span>
                          )}
                          {(activity.file.deletions ?? 0) > 0 && (
                            <span className="diff-pill deletions">-{activity.file.deletions}</span>
                          )}
                          {reviewStatus && (
                            <span className={`diff-pill tag-${reviewStatus}`}>
                              {reviewStatus === 'accepted' ? 'accepted' : 'rejected'}
                            </span>
                          )}
                          {onSelectDiff && reviewStatus !== 'rejected' && (
                            <button
                              className="view-diff-link-btn"
                              title="Open unified diff viewer"
                              onClick={(e) => {
                                e.stopPropagation();
                                const matched = session?.changedFiles?.find(
                                  (cf) => cf.path === activity.file?.path
                                );
                                if (matched) {
                                  onSelectDiff(matched);
                                } else if (activity.file) {
                                  onSelectDiff({
                                    path: activity.file.path,
                                    additions: activity.file.additions || 0,
                                    deletions: activity.file.deletions || 0,
                                    originalContent: activity.file.oldContent || '',
                                    modifiedContent: activity.file.newContent || '',
                                    diff: activity.file.diff,
                                    status: (reviewStatus || 'accepted') as any,
                                  });
                                }
                              }}
                            >
                              <ExternalLink size={11} />
                              <span>Diff</span>
                            </button>
                          )}
                        </div>
                      );
                    })()}

                    {/* Test summary pills */}
                    {activity.type === 'test' && activity.test && (
                      <div className="test-stat-pills">
                        {activity.test.passed !== undefined && (
                          <span className="diff-pill test-passed">
                            {activity.test.passed} passed
                          </span>
                        )}
                        {activity.test.failed !== undefined && activity.test.failed > 0 && (
                          <span className="diff-pill test-failed">
                            {activity.test.failed} failed
                          </span>
                        )}
                      </div>
                    )}

                    {/* Duration */}
                    {activity.duration !== undefined && activity.duration > 0 && (
                      <span className="activity-duration">{activity.duration}s</span>
                    )}

                    {/* Expand icon */}
                    {hasDetails && (
                      <span className="expand-chevron">
                        {isExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Expanded details */}
              {isExpanded && (
                <div className="timeline-activity-details">
                  {/* Model badge when expanded */}
                  {activity.model && (
                    <div className="activity-model-line-expanded">
                      {renderModelBadge(activity.model)}
                    </div>
                  )}

                  {/* Description / details text when expanded */}
                  {activity.description && (
                    <div className="activity-desc-detail">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>
                        {activity.description}
                      </ReactMarkdown>
                      {activity.status === 'running' && (
                        <div className="activity-live-reasoning-badge">
                          <span className="live-thinking-dot" />
                          <span>Thinking live...</span>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Explored files list (Section 33) */}
                  {activity.file?.exploredFiles && activity.file.exploredFiles.length > 0 && (
                    <div className="explored-files-list">
                      <div className="details-heading">Explored:</div>
                      {activity.file.exploredFiles.map((file, idx) => (
                        <div key={idx} className="file-detail-row">
                          <FileCode size={11} className="text-gray" />
                          <span>{file}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Sub-commands list (Section 42: Command Grouping) */}
                  {activity.command?.commands && activity.command.commands.length > 0 && (
                    <div className="command-subitems-list">
                      <div className="details-heading">
                        Commands ({activity.command.commands.length}):
                      </div>
                      {activity.command.commands.map((sub, idx) => (
                        <div key={idx} className={`subitem-row status-${sub.status}`}>
                          <span className="subitem-status">
                            {sub.status === 'completed' ? (
                              <Check size={11} className="text-green" />
                            ) : sub.status === 'failed' ? (
                              <XCircle size={11} className="text-red" />
                            ) : (
                              <Loader2 size={11} className="text-blue animate-spin" />
                            )}
                          </span>
                          <code className="subitem-cmd">{sub.command}</code>
                          {sub.duration && (
                            <span className="subitem-duration">{sub.duration}s</span>
                          )}
                          {sub.exitCode !== undefined && (
                            <span
                              className={`subitem-exit exit-${
                                sub.exitCode === 0 ? 'zero' : 'error'
                              }`}
                            >
                              exit {sub.exitCode}
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Command output (stdout/stderr) */}
                  {activity.command && (activity.command.stdout || activity.command.stderr) && (
                    <div className="terminal-output-block">
                      {activity.command.exitCode !== undefined && (
                        <div className="terminal-exit-code">
                          Exit code: {activity.command.exitCode}
                        </div>
                      )}
                      {activity.command.stdout && (
                        <pre className="terminal-stdout">{activity.command.stdout}</pre>
                      )}
                      {activity.command.stderr && (
                        <pre className="terminal-stderr">{activity.command.stderr}</pre>
                      )}
                    </div>
                  )}

                  {/* Test output */}
                  {activity.test?.output && (
                    <div className="test-output-block">
                      <pre className="terminal-stdout">{activity.test.output}</pre>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
