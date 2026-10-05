import React, { useState } from 'react';
import { ChangedFile } from '../types/agent';
import {
  FileCode,
  Check,
  X,
  ChevronDown,
  ChevronRight,
  CheckCheck,
  RotateCcw,
  Sparkles,
} from 'lucide-react';

interface ChangedFilesPanelProps {
  changedFiles: ChangedFile[];
  onSelectFile: (file: ChangedFile) => void;
  onAcceptChange: (path: string, file?: ChangedFile) => void;
  onRejectChange: (path: string, file?: ChangedFile) => void;
  onAcceptAll: (files?: ChangedFile[]) => void;
  onRejectAll: (files?: ChangedFile[]) => void;
  selectedFilePath?: string | null;
}

export const ChangedFilesPanel: React.FC<ChangedFilesPanelProps> = ({
  changedFiles,
  onSelectFile,
  onAcceptChange,
  onRejectChange,
  onAcceptAll,
  onRejectAll,
  selectedFilePath,
}) => {
  const [isExpanded, setIsExpanded] = useState(true);

  if (!changedFiles || changedFiles.length === 0) {
    return null;
  }

  const totalAdditions = changedFiles.reduce((acc, f) => acc + (f.additions || 0), 0);
  const totalDeletions = changedFiles.reduce((acc, f) => acc + (f.deletions || 0), 0);
  const pendingCount = changedFiles.filter((f) => f.status === 'pending').length;

  return (
    <div className="changed-files-panel">
      {/* Header bar */}
      <div
        className="changed-files-header"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="changed-files-title-row">
          <span className="expand-chevron">
            {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          </span>
          <span className="changed-files-title">
            {changedFiles.length} {changedFiles.length === 1 ? 'File' : 'Files'} With Changes
          </span>
          <div className="changed-files-totals">
            {totalAdditions > 0 && (
              <span className="diff-pill additions">+{totalAdditions}</span>
            )}
            {totalDeletions > 0 && (
              <span className="diff-pill deletions">-{totalDeletions}</span>
            )}
            {pendingCount > 0 && (
              <span className="diff-pill pending-pill">{pendingCount} pending</span>
            )}
          </div>
        </div>

        {/* Bulk Action Buttons (Section 38: [Reject all] [Accept all ▼]) */}
        <div className="changed-files-bulk-actions" onClick={(e) => e.stopPropagation()}>
          <button
            className="bulk-action-btn btn-reject-all"
            onClick={() => onRejectAll(changedFiles)}
            title="Reject all pending changes and revert files"
          >
            <RotateCcw size={12} />
            <span>Reject all</span>
          </button>
          <button
            className="bulk-action-btn btn-accept-all"
            onClick={() => onAcceptAll(changedFiles)}
            title="Accept all changes"
          >
            <CheckCheck size={12} />
            <span>Accept all ▼</span>
          </button>
        </div>
      </div>

      {/* Expanded File List */}
      {isExpanded && (
        <div className="changed-files-list">
          {changedFiles.map((file) => {
            const isSelected = selectedFilePath === file.path;
            const basename = file.path.split('/').pop() || file.path;

            return (
              <div
                key={file.path}
                className={`changed-file-row ${isSelected ? 'selected' : ''} status-${
                  file.status
                }`}
                onClick={() => onSelectFile(file)}
                title={`Click to view diff for ${file.path}`}
              >
                {/* Diff stats +37 -0 */}
                <div className="file-diff-numbers">
                  <span className="diff-add">+{file.additions}</span>
                  <span className="diff-del">-{file.deletions}</span>
                </div>

                {/* File info */}
                <div className="file-name-col">
                  <FileCode size={13} className="file-icon" />
                  <span className="file-path-text" title={file.path}>
                    <span className="file-basename">{basename}</span>
                    <span className="file-dirname">
                      {file.path.includes('/') ? ` (${file.path})` : ''}
                    </span>
                  </span>
                </div>

                {/* Status badge */}
                <div className="file-status-col">
                  <span className={`file-status-badge status-${file.status}`}>
                    {file.status}
                  </span>
                </div>

                {/* Individual Accept / Reject Buttons */}
                <div
                  className="file-row-actions"
                  onClick={(e) => e.stopPropagation()}
                >
                  <button
                    className={`file-action-btn btn-accept ${
                      file.status === 'accepted' ? 'active' : ''
                    }`}
                    onClick={() => onAcceptChange(file.path, file)}
                    title={`Accept change for ${basename}`}
                  >
                    <Check size={12} />
                  </button>
                  <button
                    className={`file-action-btn btn-reject ${
                      file.status === 'rejected' ? 'active' : ''
                    }`}
                    onClick={() => onRejectChange(file.path, file)}
                    title={`Reject change and revert ${basename}`}
                  >
                    <X size={12} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
