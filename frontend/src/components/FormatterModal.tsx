import React, { useState } from 'react';
import {
  Sparkles,
  Check,
  AlertTriangle,
  Copy,
  Terminal,
  X,
  Settings,
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
  const [copied, setCopied] = useState(false);
  const [showAllFormatters, setShowAllFormatters] = useState(false);

  if (!isOpen) return null;

  const handleCopyInstall = () => {
    if (activeFormatter?.installHelp) {
      navigator.clipboard.writeText(activeFormatter.installHelp);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

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
                {activeFormatter?.installed ? (
                  <span className="badge-installed">
                    <Check size={12} /> {activeFormatter.name} Installed
                  </span>
                ) : (
                  <span className="badge-unavailable">
                    <AlertTriangle size={12} /> {activeFormatter?.name || 'Formatter'} Unavailable
                  </span>
                )}
              </div>
            </div>

            {/* Unavailable Formatter Alert */}
            {activeFormatter && !activeFormatter.installed && (
              <div className="formatter-alert">
                <div className="formatter-alert-title">
                  <AlertTriangle size={14} /> Formatter Unavailable
                </div>
                <p className="formatter-alert-text">
                  <strong>{activeFormatter.name}</strong> is required to format this{' '}
                  <strong>{activeLanguage}</strong> file, but the CLI binary is not installed on
                  your system.
                </p>
                {activeFormatter.installHelp && (
                  <div className="formatter-install-box">
                    <div className="formatter-install-header">
                      <Terminal size={12} /> Installation Command
                    </div>
                    <div className="formatter-install-code">
                      <code>{activeFormatter.installHelp}</code>
                      <button className="copy-btn" onClick={handleCopyInstall}>
                        {copied ? <Check size={12} /> : <Copy size={12} />}
                        <span>{copied ? 'Copied!' : 'Copy'}</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

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
                    {f.name} {f.installed ? '(Installed ✓)' : '(Not Installed ⚠)'}
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
                          {item.installed ? (
                            <span className="status-pill pill-ok">Ready ✓</span>
                          ) : (
                            <span className="status-pill pill-warn">Install ⚠</span>
                          )}
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
