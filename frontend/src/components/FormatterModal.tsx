import React, { useState } from 'react';
import {
  Sparkles,
  Check,
  X,
  Sliders,
  ChevronDown,
} from 'lucide-react';

export interface FormatterInfo {
  id: string;
  name: string;
  languages: string[];
  command: string;
  installed: boolean;
  installHelp?: string;
}

export interface FormatterModalProps {
  isOpen: boolean;
  onClose: () => void;
  fileName: string;
  activeLanguage: string;
  activeFormatter?: FormatterInfo;
  formatOnSave: boolean;
  onToggleFormatOnSave: (enabled: boolean) => void;
  onFormatDocument: () => void;
  onSelectFormatter: (language: string, formatterId: string) => void;
  onInstallFormatter?: (id: string) => Promise<any>;
  allFormatters: FormatterInfo[];
}

export function FormatterModal({
  isOpen,
  onClose,
  fileName,
  activeLanguage,
  activeFormatter,
  formatOnSave,
  onToggleFormatOnSave,
  onFormatDocument,
  onSelectFormatter,
  allFormatters,
}: FormatterModalProps) {
  const [showAllFormatters, setShowAllFormatters] = useState(false);

  if (!isOpen) return null;

  const compatibleFormatters = allFormatters.filter((f) =>
    f.languages.includes(activeLanguage.toLowerCase()),
  );

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="formatter-modal" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="modal-header">
          <div className="modal-title-row">
            <Sliders size={18} className="text-amber" />
            <h2 className="modal-title">Code Formatter</h2>
            <span className="formatter-lang-badge">{activeLanguage.toUpperCase()}</span>
          </div>
          <button className="modal-close-btn" onClick={onClose}>
            <X size={16} />
          </button>
        </div>

        {/* Content */}
        <div className="modal-body">
          {/* Active File & Formatter Card */}
          <div className="formatter-card">
            <div className="formatter-card-row">
              <div>
                <div className="formatter-file-name">{fileName}</div>
                <div className="formatter-meta">
                  Language: <strong>{activeLanguage}</strong>
                </div>
              </div>
              <div className="formatter-status-badge">
                <span className="badge-installed">
                  <Check size={12} /> {activeFormatter?.name || 'Code Formatter'} Ready (Integrated)
                </span>
              </div>
            </div>

            {/* Integrated Formatter Banner */}
            <div className="formatter-integrated-banner">
              <Sparkles size={14} className="text-amber" />
              <span>
                <strong>{activeFormatter?.name || 'Code Formatter'}</strong> is built-in and ready for{' '}
                <strong>{activeLanguage}</strong> files.
              </span>
            </div>

            {/* Action Buttons */}
            <div className="formatter-actions-grid">
              <button
                className="btn-format-doc"
                onClick={() => {
                  onFormatDocument();
                  onClose();
                }}
              >
                <Sparkles size={14} /> Format Document
                <span className="btn-shortcut">Shift + Alt + F</span>
              </button>

              <div className="format-on-save-toggle">
                <label className="toggle-label">
                  <span>Format on Save</span>
                  <div
                    className={`toggle-switch ${formatOnSave ? 'active' : ''}`}
                    onClick={() => onToggleFormatOnSave(!formatOnSave)}
                  >
                    <div className="toggle-thumb" />
                  </div>
                </label>
                <span className="toggle-status">
                  {formatOnSave ? 'Enabled' : 'Disabled'}
                </span>
              </div>
            </div>
          </div>

          {/* Formatter Selection for this Language */}
          <div className="formatter-select-section">
            <label className="section-label">Configured Formatter for {activeLanguage}:</label>
            <div className="select-wrapper">
              <select
                className="custom-select"
                value={activeFormatter?.id || 'none'}
                onChange={(e) => onSelectFormatter(activeLanguage, e.target.value)}
              >
                {compatibleFormatters.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name} (Integrated ✓)
                  </option>
                ))}
                <option value="none">None (Disable formatting)</option>
              </select>
            </div>
          </div>

          {/* Supported Formatters Registry Dropdown */}
          <div className="registry-collapsible">
            <button
              className="registry-toggle-btn"
              onClick={() => setShowAllFormatters(!showAllFormatters)}
            >
              <span>View All Supported Formatters ({allFormatters.length})</span>
              <ChevronDown
                size={14}
                className={`chevron ${showAllFormatters ? 'open' : ''}`}
              />
            </button>

            {showAllFormatters && (
              <div className="registry-table-container">
                <table className="registry-table">
                  <thead>
                    <tr>
                      <th>Language</th>
                      <th>Formatter</th>
                      <th>Status</th>
                      <th>Command</th>
                    </tr>
                  </thead>
                  <tbody>
                    {allFormatters.map((item) => (
                      <tr key={item.id}>
                        <td>
                          <span className="cell-lang">
                            {item.languages.slice(0, 3).join(', ')}
                            {item.languages.length > 3 ? '...' : ''}
                          </span>
                        </td>
                        <td>
                          <strong>{item.name}</strong>
                        </td>
                        <td>
                          <span className="status-pill pill-ok">Ready ✓</span>
                        </td>
                        <td>
                          <code className="cmd-snippet">{item.command}</code>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="modal-footer">
          <button className="modal-btn-cancel" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
