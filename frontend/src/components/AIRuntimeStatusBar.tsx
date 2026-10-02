import React from 'react';
import { Cpu, Zap, Wrench, Sparkles, Link2, AlertTriangle, ShieldCheck, Database } from 'lucide-react';

interface AIRuntimeStatusBarProps {
  modelName: string;
  usedTokens: number;
  maxTokens: number;
  contextPercentage: number;
  threshold: 'normal' | 'warning' | 'high' | 'critical';
  skillsCount: number;
  toolsCount: number;
  connectorsCount: number;
  onOpenSettings: (tab: string) => void;
  onQuickCompact?: () => void;
}

export const AIRuntimeStatusBar: React.FC<AIRuntimeStatusBarProps> = ({
  modelName,
  usedTokens,
  maxTokens,
  contextPercentage,
  threshold,
  skillsCount,
  toolsCount,
  connectorsCount,
  onOpenSettings,
  onQuickCompact,
}) => {
  const formatTokens = (tokens: number) => {
    if (tokens >= 1000000) return `${(tokens / 1000000).toFixed(1)}M`;
    if (tokens >= 1000) return `${Math.round(tokens / 1000)}K`;
    return `${tokens}`;
  };

  const getMeterColorClass = () => {
    switch (threshold) {
      case 'critical':
        return 'meter-critical';
      case 'high':
        return 'meter-high';
      case 'warning':
        return 'meter-warning';
      default:
        return 'meter-normal';
    }
  };

  return (
    <div className={`ai-runtime-status-bar ${threshold !== 'normal' ? 'status-alert' : ''}`}>
      {/* Model Badge */}
      <button
        type="button"
        className="status-bar-pill status-pill-model"
        onClick={() => onOpenSettings('models')}
        title="Active Model • Click to view models"
      >
        <Sparkles size={11} className="status-pill-icon" />
        <span className="status-pill-text">{modelName}</span>
      </button>

      <span className="status-bar-divider">│</span>

      {/* Context Usage Meter */}
      <button
        type="button"
        className={`status-bar-pill status-pill-context ${getMeterColorClass()}`}
        onClick={() => onOpenSettings('context')}
        title={`Context Usage: ${formatTokens(usedTokens)} / ${formatTokens(maxTokens)} (${contextPercentage}%) • Click to manage context`}
      >
        <span className="context-meter-label">Context</span>
        <div className="context-meter-track">
          <div
            className={`context-meter-fill ${getMeterColorClass()}`}
            style={{ width: `${Math.min(100, Math.max(4, contextPercentage))}%` }}
          />
        </div>
        <span className="context-meter-pct">{contextPercentage}%</span>
        {threshold !== 'normal' && <AlertTriangle size={11} className="alert-mini-icon" />}
      </button>

      {/* Quick compact trigger if high */}
      {threshold !== 'normal' && onQuickCompact && (
        <button
          type="button"
          className="quick-compact-pill"
          onClick={onQuickCompact}
          title="Compact context now to free up window space"
        >
          <Zap size={10} />
          <span>Compact</span>
        </button>
      )}

      <span className="status-bar-divider">│</span>

      {/* Skills Badge */}
      <button
        type="button"
        className="status-bar-pill"
        onClick={() => onOpenSettings('skills')}
        title="Active Skills • Click to configure"
      >
        <Zap size={11} className="status-pill-icon text-cyan" />
        <span>{skillsCount} Skills</span>
      </button>

      <span className="status-bar-divider">│</span>

      {/* Tools Badge */}
      <button
        type="button"
        className="status-bar-pill"
        onClick={() => onOpenSettings('tools')}
        title="Enabled Tools • Click to configure"
      >
        <Wrench size={11} className="status-pill-icon text-amber" />
        <span>{toolsCount} Tools</span>
      </button>

      <span className="status-bar-divider">│</span>

      {/* Connectors Badge */}
      <button
        type="button"
        className="status-bar-pill"
        onClick={() => onOpenSettings('connectors')}
        title="Connected Services • Click to configure"
      >
        <Link2 size={11} className="status-pill-icon text-emerald" />
        <span>{connectorsCount} Connectors</span>
      </button>

      <span className="status-bar-divider">│</span>

      {/* Settings Shortcut */}
      <button
        type="button"
        className="status-bar-settings-btn"
        onClick={() => onOpenSettings('models')}
        title="Open AI Control Center"
      >
        ⚙ Settings
      </button>
    </div>
  );
};
