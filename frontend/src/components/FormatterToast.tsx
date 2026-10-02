import React from 'react';
import { AlertTriangle, Check, X, Terminal, Copy } from 'lucide-react';

export interface ToastMessage {
  type: 'success' | 'warning' | 'error';
  text: string;
  installHelp?: string;
  onConfigure?: () => void;
}

export interface FormatterToastProps {
  toast: ToastMessage | null;
  onDismiss: () => void;
}

export function FormatterToast({ toast, onDismiss }: FormatterToastProps) {
  const [copied, setCopied] = React.useState(false);

  if (!toast) return null;

  const handleCopy = () => {
    if (toast.installHelp) {
      navigator.clipboard.writeText(toast.installHelp);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className={`formatter-toast toast-${toast.type}`}>
      <div className="toast-icon">
        {toast.type === 'success' && <Check size={14} className="text-green" />}
        {toast.type === 'warning' && <AlertTriangle size={14} className="text-amber" />}
        {toast.type === 'error' && <AlertTriangle size={14} className="text-red" />}
      </div>

      <div className="toast-content">
        <span className="toast-text">{toast.text}</span>
        {toast.installHelp && (
          <button className="toast-copy-btn" onClick={handleCopy} title="Copy command">
            <Terminal size={12} />
            <code>{toast.installHelp}</code>
            <Copy size={11} />
            {copied && <span className="copied-text">Copied!</span>}
          </button>
        )}
      </div>

      <div className="toast-actions">
        {toast.onConfigure && (
          <button className="toast-configure-btn" onClick={toast.onConfigure}>
            Configure
          </button>
        )}
        <button className="toast-close-btn" onClick={onDismiss}>
          <X size={13} />
        </button>
      </div>
    </div>
  );
}
