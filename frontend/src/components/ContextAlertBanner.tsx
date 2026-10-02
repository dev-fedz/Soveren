import React from 'react';
import { AlertTriangle, Zap, RefreshCw, X, ArrowRight, Sparkles } from 'lucide-react';

interface AlternativeModel {
  id: string;
  name: string;
  contextWindow: number;
}

interface ContextAlertBannerProps {
  currentModelName: string;
  usedTokens: number;
  maxTokens: number;
  percentage: number;
  threshold: 'normal' | 'warning' | 'high' | 'critical';
  recommendedAlternatives?: AlternativeModel[];
  onSwitchModel: (modelId: string) => void;
  onCompactContext: () => void;
  onDismiss: () => void;
}

export const ContextAlertBanner: React.FC<ContextAlertBannerProps> = ({
  currentModelName,
  usedTokens,
  maxTokens,
  percentage,
  threshold,
  recommendedAlternatives = [],
  onSwitchModel,
  onCompactContext,
  onDismiss,
}) => {
  if (threshold === 'normal') return null;

  const formatTokens = (tokens: number) => {
    if (tokens >= 1000000) return `${(tokens / 1000000).toFixed(1)}M`;
    if (tokens >= 1000) return `${Math.round(tokens / 1000)}K`;
    return `${tokens}`;
  };

  return (
    <div className={`context-alert-banner alert-${threshold}`}>
      <div className="alert-content-left">
        <AlertTriangle size={16} className="alert-warning-icon" />
        <div className="alert-text-block">
          <div className="alert-title">
            Context Limit Approaching ({percentage}% used — {formatTokens(usedTokens)} / {formatTokens(maxTokens)})
          </div>
          <div className="alert-desc">
            Model <strong>{currentModelName}</strong> is nearing context capacity. Switch model or compact to maintain high reasoning quality.
          </div>
        </div>
      </div>

      <div className="alert-actions-right">
        {recommendedAlternatives.length > 0 && (
          <div className="alert-recommendations">
            <span className="recommendation-label">Switch to:</span>
            {recommendedAlternatives.slice(0, 2).map(alt => (
              <button
                key={alt.id}
                type="button"
                className="alert-btn-switch-alt"
                onClick={() => onSwitchModel(alt.id)}
                title={`Switch to ${alt.name} (${formatTokens(alt.contextWindow)} window)`}
              >
                <Sparkles size={11} />
                <span>{alt.name} ({formatTokens(alt.contextWindow)})</span>
              </button>
            ))}
          </div>
        )}

        <button
          type="button"
          className="alert-action-btn btn-compact"
          onClick={onCompactContext}
        >
          <Zap size={12} />
          <span>Compact Context</span>
        </button>

        <button
          type="button"
          className="alert-close-btn"
          onClick={onDismiss}
          title="Dismiss warning"
        >
          <X size={14} />
        </button>
      </div>
    </div>
  );
};
