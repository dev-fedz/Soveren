import React from 'react';
import { AlertTriangle, RefreshCw, ExternalLink, Loader2, WifiOff, ShieldAlert, Globe } from 'lucide-react';

export type DiagnosticType =
  | 'connection_refused'
  | 'connection_timeout'
  | 'cors_error'
  | 'csrf_error'
  | 'csp_blocked'
  | 'xframe_blocked'
  | 'cert_error'
  | 'reconnecting'
  | 'server_stopped'
  | 'unknown';

export interface DiagnosticInfo {
  type: DiagnosticType;
  serviceName: string;
  serviceUrl: string;
  port: number;
  framework?: string;
  detail?: string;
  searching?: boolean;
}

interface BrowserDiagnosticProps {
  diagnostic: DiagnosticInfo;
  onRetry: () => void;
  onOpenExternal: () => void;
}

const DIAGNOSTIC_MESSAGES: Record<DiagnosticType, { title: string; description: string; icon: React.ReactNode }> = {
  connection_refused: {
    title: 'Connection Refused',
    description: 'The development server is not responding on this port.',
    icon: <WifiOff size={28} />,
  },
  connection_timeout: {
    title: 'Connection Timeout',
    description: 'The server took too long to respond.',
    icon: <WifiOff size={28} />,
  },
  cors_error: {
    title: 'CORS Error',
    description: 'The server is blocking cross-origin requests from the embedded browser.',
    icon: <ShieldAlert size={28} />,
  },
  csrf_error: {
    title: 'CSRF Verification Failed',
    description: 'The backend rejected the request due to CSRF token validation.',
    icon: <ShieldAlert size={28} />,
  },
  csp_blocked: {
    title: 'Content Security Policy',
    description: 'The application\'s Content Security Policy prevents embedding in an iframe.',
    icon: <ShieldAlert size={28} />,
  },
  xframe_blocked: {
    title: 'X-Frame-Options Restriction',
    description: 'The server\'s X-Frame-Options header prevents embedding in an iframe.',
    icon: <ShieldAlert size={28} />,
  },
  cert_error: {
    title: 'Certificate Error',
    description: 'The development server uses a self-signed or untrusted certificate.',
    icon: <ShieldAlert size={28} />,
  },
  reconnecting: {
    title: 'Reconnecting...',
    description: 'The server restarted. Searching for the new port.',
    icon: <Loader2 size={28} className="diagnostic-spinner" />,
  },
  server_stopped: {
    title: 'Server Stopped',
    description: 'The development server is no longer running.',
    icon: <WifiOff size={28} />,
  },
  unknown: {
    title: 'Failed to Load',
    description: 'The application could not be loaded in the embedded browser.',
    icon: <AlertTriangle size={28} />,
  },
};

export function BrowserDiagnostic({ diagnostic, onRetry, onOpenExternal }: BrowserDiagnosticProps) {
  const message = DIAGNOSTIC_MESSAGES[diagnostic.type] || DIAGNOSTIC_MESSAGES.unknown;
  const isSearching = diagnostic.searching || diagnostic.type === 'reconnecting';

  return (
    <div className="browser-diagnostic">
      <div className="diagnostic-card">
        <div className="diagnostic-icon">
          {message.icon}
        </div>

        <h3 className="diagnostic-title">{message.title}</h3>

        <div className="diagnostic-info">
          <div className="diagnostic-row">
            <span className="diagnostic-label">Application</span>
            <span className="diagnostic-value">{diagnostic.serviceName}</span>
          </div>
          <div className="diagnostic-row">
            <span className="diagnostic-label">URL</span>
            <span className="diagnostic-value diagnostic-url">{diagnostic.serviceUrl}</span>
          </div>
          {diagnostic.framework && (
            <div className="diagnostic-row">
              <span className="diagnostic-label">Framework</span>
              <span className="diagnostic-value">{diagnostic.framework}</span>
            </div>
          )}
        </div>

        <p className="diagnostic-description">{message.description}</p>

        {diagnostic.detail && (
          <div className="diagnostic-detail">
            <span className="diagnostic-detail-indicator">●</span>
            <span>{diagnostic.detail}</span>
          </div>
        )}

        {isSearching && (
          <div className="diagnostic-searching">
            <Loader2 size={14} className="diagnostic-spinner" />
            <span>Scanning for the server on a new port...</span>
          </div>
        )}

        <div className="diagnostic-actions">
          <button className="diagnostic-btn diagnostic-btn-primary" onClick={onRetry}>
            <RefreshCw size={14} />
            <span>Retry</span>
          </button>
          <button className="diagnostic-btn diagnostic-btn-secondary" onClick={onOpenExternal}>
            <ExternalLink size={14} />
            <span>Open in Browser</span>
          </button>
        </div>
      </div>
    </div>
  );
}
