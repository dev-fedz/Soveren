import React, { useState } from 'react';
import { KeyRound, ShieldAlert, Check, X, AlertTriangle, Eye, EyeOff, Lock } from 'lucide-react';
import type { AgentPermissionRequest } from '../types/workspace';

interface AgentPermissionModalProps {
  request: AgentPermissionRequest | null;
  onSubmit: (requestId: string, values: Record<string, any>) => void;
  onCancel: (requestId: string) => void;
}

export function AgentPermissionModal({
  request,
  onSubmit,
  onCancel,
}: AgentPermissionModalProps) {
  const [formValues, setFormValues] = useState<Record<string, any>>({});
  const [showPasswords, setShowPasswords] = useState<Record<string, boolean>>({});

  if (!request) return null;

  const handleFieldChange = (fieldName: string, value: any) => {
    setFormValues((prev) => ({
      ...prev,
      [fieldName]: value,
    }));
  };

  const togglePasswordVisibility = (fieldName: string) => {
    setShowPasswords((prev) => ({
      ...prev,
      [fieldName]: !prev[fieldName],
    }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(request.id, formValues);
  };

  return (
    <div className="permission-modal-backdrop">
      <div className="permission-modal-dialog">
        {/* Header */}
        <div className="permission-modal-header">
          <div className="modal-title-with-icon">
            {request.type === 'credential' ? (
              <KeyRound size={20} className="text-amber-400" />
            ) : request.type === 'destructive_action' ? (
              <ShieldAlert size={20} className="text-red-400" />
            ) : (
              <Lock size={20} className="text-indigo-400" />
            )}
            <div>
              <h3 className="modal-heading">{request.title || 'Agent Needs Your Authorization'}</h3>
              <span className="badge-request-type">{request.type.toUpperCase()}</span>
            </div>
          </div>
          <button
            type="button"
            className="modal-close-icon"
            onClick={() => onCancel(request.id)}
            title="Cancel"
          >
            <X size={16} />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="permission-modal-body">
          <p className="permission-explanation">{request.explanation}</p>

          {request.fields && request.fields.length > 0 && (
            <div className="permission-fields-container">
              {request.fields.map((field) => (
                <div key={field.name} className="field-group">
                  <label className="field-label">
                    {field.label}
                    {field.required && <span className="text-red-400 ml-1">*</span>}
                  </label>

                  <div className="field-input-wrapper">
                    <input
                      type={
                        field.type === 'password'
                          ? showPasswords[field.name]
                            ? 'text'
                            : 'password'
                          : field.type === 'number'
                          ? 'number'
                          : 'text'
                      }
                      placeholder={field.placeholder || `Enter ${field.label.toLowerCase()}`}
                      required={field.required}
                      value={formValues[field.name] ?? ''}
                      onChange={(e) => handleFieldChange(field.name, e.target.value)}
                      className="field-input"
                    />
                    {field.type === 'password' && (
                      <button
                        type="button"
                        className="toggle-pwd-btn"
                        onClick={() => togglePasswordVisibility(field.name)}
                      >
                        {showPasswords[field.name] ? <EyeOff size={14} /> : <Eye size={14} />}
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="permission-modal-footer">
            <button
              type="button"
              className="btn-cancel"
              onClick={() => onCancel(request.id)}
            >
              Cancel
            </button>
            <button type="submit" className="btn-confirm">
              <Check size={14} /> Continue Execution
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
