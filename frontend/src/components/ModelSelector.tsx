import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown, Check, Sparkles, Cpu, ExternalLink, Settings, RefreshCw, Zap } from 'lucide-react';

export interface ModelOption {
  id: string;
  name: string;
  providerId: string;
  contextWindow: number;
  capabilities: {
    vision?: boolean;
    tools?: boolean;
    streaming?: boolean;
  };
  status?: string;
  statusMessage?: string;
}

interface ModelSelectorProps {
  activeModelId: string;
  models: ModelOption[];
  onSelectModel: (modelId: string) => void;
  onOpenSettings: (tab?: string) => void;
  contextPercentage?: number;
}

export const ModelSelector: React.FC<ModelSelectorProps> = ({
  activeModelId,
  models,
  onSelectModel,
  onOpenSettings,
  contextPercentage = 0,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  const activeModel = models.find(m => m.id === activeModelId) || {
    id: activeModelId,
    name: activeModelId.replace(/^ollama-/, 'Ollama: '),
    providerId: activeModelId.startsWith('ollama') ? 'ollama' : 'cloud',
    contextWindow: 128000,
  };

  const formatContextSize = (tokens: number) => {
    if (tokens >= 1000000) return `${Math.round(tokens / 1000000)}M`;
    return `${Math.round(tokens / 1024)}K`;
  };

  return (
    <div className="model-selector-container" ref={dropdownRef}>
      <button
        type="button"
        className={`model-selector-btn ${isOpen ? 'active' : ''}`}
        onClick={() => setIsOpen(!isOpen)}
        title="Switch AI Model (Task context will be preserved)"
      >
        <span className="model-selector-icon">
          {activeModel.providerId === 'ollama' ? <Cpu size={13} /> : <Sparkles size={13} />}
        </span>
        <span className="model-selector-name">{activeModel.name}</span>
        <span className="model-selector-window">{formatContextSize(activeModel.contextWindow)}</span>
        <ChevronDown size={12} className={`model-selector-chevron ${isOpen ? 'rotated' : ''}`} />
      </button>

      {isOpen && (
        <div className="model-dropdown-menu">
          <div className="model-dropdown-header">
            <span className="model-dropdown-title">Select Model</span>
            <span className="model-dropdown-hint">Zero-loss context switch</span>
          </div>

          <div className="model-dropdown-list">
            {models.map(m => {
              const isSelected = m.id === activeModelId;
              const isReady = m.status === 'ready' || m.status === 'connected';

              return (
                <button
                  key={m.id}
                  type="button"
                  className={`model-option-item ${isSelected ? 'selected' : ''}`}
                  onClick={() => {
                    onSelectModel(m.id);
                    setIsOpen(false);
                  }}
                >
                  <div className="model-option-indicator">
                    {isSelected ? (
                      <Check size={14} className="model-check-icon" />
                    ) : (
                      <span className={`status-dot ${isReady ? 'ready' : 'offline'}`} />
                    )}
                  </div>
                  <div className="model-option-details">
                    <div className="model-option-title-row">
                      <span className="model-option-name">{m.name}</span>
                      <span className="model-option-ctx">{formatContextSize(m.contextWindow)}</span>
                    </div>
                    <div className="model-option-sub">
                      <span className="model-provider-badge">{m.providerId}</span>
                      {m.capabilities?.vision && <span className="cap-tag">Vision</span>}
                      {m.capabilities?.tools && <span className="cap-tag">Tools</span>}
                      {m.statusMessage && <span className="model-status-note">{m.statusMessage}</span>}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>

          <div className="model-dropdown-footer">
            <button
              type="button"
              className="model-footer-btn"
              onClick={() => {
                setIsOpen(false);
                onOpenSettings('models');
              }}
            >
              <Settings size={13} />
              <span>Configure Models & Providers...</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
