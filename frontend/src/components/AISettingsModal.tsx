import React, { useState, useEffect } from 'react';
import axios from 'axios';
import {
  X,
  Search,
  Cpu,
  Key,
  Database,
  Wrench,
  Zap,
  Puzzle,
  Link2,
  Shield,
  Layers,
  Sparkles,
  Check,
  AlertTriangle,
  RotateCcw,
  Download,
  Upload,
  Eye,
  EyeOff,
  Activity,
  Sliders,
  ExternalLink,
  ChevronRight,
  Trash2,
  Plus
} from 'lucide-react';

const API = 'http://localhost:5001';

interface AISettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialTab?: string;
  onModelSwitched?: (modelId: string) => void;
  workspacePath?: string | null;
}

export const AISettingsModal: React.FC<AISettingsModalProps> = ({
  isOpen,
  onClose,
  initialTab = 'routing',
  onModelSwitched,
  workspacePath,
}) => {
  const [activeTab, setActiveTab] = useState<string>(initialTab);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [actionMessage, setActionMessage] = useState<{ text: string; type: 'success' | 'error' | 'info' } | null>(null);

  // Core Runtime State
  const [runtimeConfig, setRuntimeConfig] = useState<any>(null);
  const [models, setModels] = useState<any[]>([]);
  const [activeModel, setActiveModel] = useState<string>('');
  const [credentials, setCredentials] = useState<Record<string, { hasKey: boolean; maskedKey: string }>>({});
  const [contextUsage, setContextUsage] = useState<any>(null);

  // Skills & Profiles
  const [skills, setSkills] = useState<any[]>([]);
  const [skillProfiles, setSkillProfiles] = useState<any[]>([]);
  const [activeSkillProfile, setActiveSkillProfile] = useState<string>('web-dev');

  // Tools & Permissions
  const [tools, setTools] = useState<any[]>([]);
  const [toolPermissions, setToolPermissions] = useState<Record<string, string>>({});
  const [enabledTools, setEnabledTools] = useState<string[]>([]);

  // Plugins & Connectors
  const [plugins, setPlugins] = useState<any[]>([]);
  const [connectors, setConnectors] = useState<any[]>([]);

  // Key Editing Form
  const [editingProvider, setEditingProvider] = useState<string | null>(null);
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [showKeyText, setShowKeyText] = useState(false);
  const [testingConnection, setTestingConnection] = useState<string | null>(null);

  // Sync initial tab when changed externally
  useEffect(() => {
    if (initialTab) {
      setActiveTab(initialTab === 'keys' ? 'providers' : initialTab);
    }
  }, [initialTab]);

  // Load all AI settings data
  const loadAllData = async () => {
    setLoading(true);
    try {
      const [configRes, modelsRes, credsRes, ctxRes, skillsRes, toolsRes, pluginsRes, connectorsRes] = await Promise.all([
        axios.get(`${API}/ai/runtime-config${workspacePath ? `?workspace=${encodeURIComponent(workspacePath)}` : ''}`).catch(() => null),
        axios.get(`${API}/ai/models`).catch(() => null),
        axios.get(`${API}/ai/credentials`).catch(() => null),
        axios.get(`${API}/ai/context-usage${workspacePath ? `?workspace=${encodeURIComponent(workspacePath)}` : ''}`).catch(() => null),
        axios.get(`${API}/ai/skills`).catch(() => null),
        axios.get(`${API}/ai/tools`).catch(() => null),
        axios.get(`${API}/ai/plugins`).catch(() => null),
        axios.get(`${API}/ai/connectors`).catch(() => null),
      ]);

      if (configRes?.data) {
        setRuntimeConfig(configRes.data);
        setActiveModel(configRes.data.activeModel);
      }
      if (modelsRes?.data?.models) {
        setModels(modelsRes.data.models);
        if (modelsRes.data.activeModel) setActiveModel(modelsRes.data.activeModel);
      }
      if (credsRes?.data) setCredentials(credsRes.data);
      if (ctxRes?.data) setContextUsage(ctxRes.data);

      if (skillsRes?.data) {
        setSkills(skillsRes.data.skills || []);
        setSkillProfiles(skillsRes.data.profiles || []);
        if (skillsRes.data.activeProfile) setActiveSkillProfile(skillsRes.data.activeProfile);
      }
      if (toolsRes?.data) {
        setTools(toolsRes.data.tools || []);
        setToolPermissions(toolsRes.data.permissions || {});
        setEnabledTools(toolsRes.data.enabled || []);
      }
      if (pluginsRes?.data) {
        setPlugins(pluginsRes.data.plugins || []);
      }
      if (connectorsRes?.data) {
        setConnectors(connectorsRes.data.connectors || []);
      }
    } catch (err: any) {
      console.error('Failed to load settings:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadAllData();
      setActionMessage(null);
    }
  }, [isOpen, workspacePath]);

  // Model selection
  const handleSelectModel = async (modelId: string) => {
    try {
      setLoading(true);
      const res = await axios.post(`${API}/ai/models/select`, {
        modelId,
        workspace: workspacePath || undefined,
      });
      setActiveModel(modelId);
      if (res.data?.compacted) {
        showFeedback(`Model switched to ${modelId}. Context was compacted to fit destination window!`, 'info');
      } else {
        showFeedback(`Active model switched to ${modelId}`, 'success');
      }
      if (onModelSwitched) onModelSwitched(modelId);
      loadAllData();
    } catch (err: any) {
      showFeedback(`Failed to switch model: ${err.message}`, 'error');
    } finally {
      setLoading(false);
    }
  };

  // Connection testing
  const handleTestConnection = async (providerId: string, customKey?: string) => {
    setTestingConnection(providerId);
    try {
      const res = await axios.post(`${API}/ai/models/test-connection`, {
        providerId,
        apiKey: customKey,
      });
      if (res.data?.success) {
        showFeedback(`✓ ${res.data.message}`, 'success');
      } else {
        showFeedback(`✕ ${res.data.message}`, 'error');
      }
    } catch (err: any) {
      showFeedback(`Connection test failed: ${err.message}`, 'error');
    } finally {
      setTestingConnection(null);
    }
  };

  // Save API key
  const handleSaveApiKey = async (providerId: string) => {
    try {
      await axios.post(`${API}/ai/credentials`, {
        providerId,
        apiKey: apiKeyInput,
      });
      setEditingProvider(null);
      setApiKeyInput('');
      showFeedback(`API Key for ${providerId} securely saved!`, 'success');
      loadAllData();
    } catch (err: any) {
      showFeedback(`Failed to save API key: ${err.message}`, 'error');
    }
  };

  // Delete API key
  const handleDeleteApiKey = async (providerId: string) => {
    try {
      await axios.delete(`${API}/ai/credentials/${providerId}`);
      showFeedback(`API Key for ${providerId} removed`, 'info');
      loadAllData();
    } catch (err: any) {
      showFeedback(`Failed to delete key: ${err.message}`, 'error');
    }
  };

  // Skill toggle
  const handleToggleSkill = async (skillId: string, currentEnabled: boolean) => {
    try {
      await axios.post(`${API}/ai/skills/toggle`, {
        skillId,
        enabled: !currentEnabled,
      });
      loadAllData();
    } catch (err: any) {
      showFeedback(`Failed to toggle skill: ${err.message}`, 'error');
    }
  };

  // Skill profile selection
  const handleApplySkillProfile = async (profileId: string) => {
    try {
      await axios.post(`${API}/ai/skills/profile`, { profileId });
      setActiveSkillProfile(profileId);
      showFeedback(`Applied profile: ${profileId}`, 'success');
      loadAllData();
    } catch (err: any) {
      showFeedback(`Failed to apply profile: ${err.message}`, 'error');
    }
  };

  // Tool permission change
  const handleChangeToolPermission = async (toolId: string, permission: string) => {
    try {
      await axios.post(`${API}/ai/tools/permission`, { toolId, permission });
      setToolPermissions(prev => ({ ...prev, [toolId]: permission }));
      showFeedback(`Updated ${toolId} permission to ${permission}`, 'success');
    } catch (err: any) {
      showFeedback(`Failed to update permission: ${err.message}`, 'error');
    }
  };

  // Tool toggle
  const handleToggleTool = async (toolId: string, enabled: boolean) => {
    try {
      await axios.post(`${API}/ai/tools/toggle`, { toolId, enabled });
      loadAllData();
    } catch (err: any) {
      showFeedback(`Failed to toggle tool: ${err.message}`, 'error');
    }
  };

  // Context compaction
  const handleCompactContext = async () => {
    try {
      setLoading(true);
      const res = await axios.post(`${API}/ai/context/compact`, {
        workspace: workspacePath || undefined,
      });
      showFeedback(`Context compacted! Reduced from ${res.data.originalTokens} to ${res.data.compactedTokens} tokens.`, 'success');
      loadAllData();
    } catch (err: any) {
      showFeedback(`Compaction failed: ${err.message}`, 'error');
    } finally {
      setLoading(false);
    }
  };

  // Export settings (no secrets)
  const handleExport = async () => {
    try {
      const res = await axios.get(`${API}/ai/export`, { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', 'ai-settings.json');
      document.body.appendChild(link);
      link.click();
      link.remove();
      showFeedback('Settings exported successfully (no secrets included)', 'success');
    } catch (err: any) {
      showFeedback(`Export failed: ${err.message}`, 'error');
    }
  };

  // Reset category
  const handleResetCategory = async (category: string) => {
    if (!window.confirm(`Reset ${category} settings to default? Your API keys will NOT be deleted.`)) return;
    try {
      await axios.post(`${API}/ai/reset`, { category });
      showFeedback(`Reset ${category} to defaults`, 'success');
      loadAllData();
    } catch (err: any) {
      showFeedback(`Reset failed: ${err.message}`, 'error');
    }
  };

  const showFeedback = (text: string, type: 'success' | 'error' | 'info') => {
    setActionMessage({ text, type });
    setTimeout(() => setActionMessage(null), 4000);
  };

  if (!isOpen) return null;

  // Determine connected models (connected either locally or via api key)
  const isModelConnected = (m: any) => {
    if (!m) return false;
    if (m.providerId === 'ollama') {
      return m.status === 'ready' || m.status === 'connected';
    }
    if (m.providerId === 'custom') {
      return Boolean(m.enabled && (m.status === 'ready' || m.status === 'connected'));
    }
    // Cloud providers (google, openai, anthropic, etc.) MUST have an API key configured
    return Boolean(credentials[m.providerId]?.hasKey);
  };

  const connectedModels = models.filter(isModelConnected);

  // Filter items by search
  const query = searchQuery.toLowerCase().trim();

  const filteredModels = connectedModels.filter(m =>
    !query || m.name.toLowerCase().includes(query) || m.providerId.toLowerCase().includes(query)
  );

  const filteredSkills = skills.filter(s =>
    !query || s.name.toLowerCase().includes(query) || s.description.toLowerCase().includes(query)
  );

  const filteredTools = tools.filter(t =>
    !query || t.name.toLowerCase().includes(query) || t.description.toLowerCase().includes(query)
  );

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="ai-settings-modal-dialog" onClick={(e) => e.stopPropagation()}>
        {/* MODAL HEADER */}
        <div className="ai-settings-header">
          <div className="ai-settings-header-left">
            <div className="settings-brand-icon">
              <Sparkles size={18} />
            </div>
            <div>
              <h2 className="ai-settings-title">AI Runtime Control Center</h2>
              <p className="ai-settings-subtitle">Configure Models, Providers, Keys, Context, Skills & Tools</p>
            </div>
          </div>

          <div className="ai-settings-header-right">
            <div className="settings-search-wrapper">
              <Search size={14} className="settings-search-icon" />
              <input
                type="text"
                placeholder="Search settings..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="settings-search-input"
              />
              {searchQuery && (
                <button type="button" onClick={() => setSearchQuery('')} className="settings-search-clear">
                  <X size={12} />
                </button>
              )}
            </div>
            <button type="button" className="modal-close-btn" onClick={onClose} title="Close Settings">
              <X size={18} />
            </button>
          </div>
        </div>

        {/* FEEDBACK TOAST */}
        {actionMessage && (
          <div className={`settings-feedback-banner feedback-${actionMessage.type}`}>
            <span>{actionMessage.text}</span>
            <button type="button" onClick={() => setActionMessage(null)}><X size={12} /></button>
          </div>
        )}

        {/* MODAL MAIN CONTENT */}
        <div className="ai-settings-body">
          {/* CATEGORY SIDEBAR */}
          <div className="ai-settings-sidebar">
            <div className="sidebar-group-title">AI Engine</div>
            <button
              type="button"
              className={`sidebar-tab-btn ${activeTab === 'models' ? 'active' : ''}`}
              onClick={() => setActiveTab('models')}
            >
              <Cpu size={14} />
              <span>Models</span>
              <span className="tab-counter">{connectedModels.length}</span>
            </button>
            <button
              type="button"
              className={`sidebar-tab-btn ${activeTab === 'providers' ? 'active' : ''}`}
              onClick={() => setActiveTab('providers')}
            >
              <Layers size={14} />
              <span>Providers</span>
            </button>
            <button
              type="button"
              className={`sidebar-tab-btn ${activeTab === 'context' ? 'active' : ''}`}
              onClick={() => setActiveTab('context')}
            >
              <Activity size={14} />
              <span>Context & Memory</span>
              {contextUsage?.percentage > 70 && (
                <span className="tab-alert-dot" />
              )}
            </button>
            <button
              type="button"
              className={`sidebar-tab-btn ${activeTab === 'routing' ? 'active' : ''}`}
              onClick={() => setActiveTab('routing')}
            >
              <Sliders size={14} />
              <span>Model Routing</span>
            </button>

            <div className="sidebar-group-title">Capabilities</div>
            <button
              type="button"
              className={`sidebar-tab-btn ${activeTab === 'skills' ? 'active' : ''}`}
              onClick={() => setActiveTab('skills')}
            >
              <Zap size={14} />
              <span>Skills</span>
              <span className="tab-counter">{runtimeConfig?.skills?.enabled?.length || 0}</span>
            </button>
            <button
              type="button"
              className={`sidebar-tab-btn ${activeTab === 'tools' ? 'active' : ''}`}
              onClick={() => setActiveTab('tools')}
            >
              <Wrench size={14} />
              <span>Tools & Registry</span>
              <span className="tab-counter">{enabledTools.length}</span>
            </button>
            <button
              type="button"
              className={`sidebar-tab-btn ${activeTab === 'plugins' ? 'active' : ''}`}
              onClick={() => setActiveTab('plugins')}
            >
              <Puzzle size={14} />
              <span>Plugins</span>
            </button>
            <button
              type="button"
              className={`sidebar-tab-btn ${activeTab === 'connectors' ? 'active' : ''}`}
              onClick={() => setActiveTab('connectors')}
            >
              <Link2 size={14} />
              <span>Connectors</span>
            </button>

            <div className="sidebar-group-title">Governance</div>
            <button
              type="button"
              className={`sidebar-tab-btn ${activeTab === 'permissions' ? 'active' : ''}`}
              onClick={() => setActiveTab('permissions')}
            >
              <Shield size={14} />
              <span>Permissions & Security</span>
            </button>
            <button
              type="button"
              className={`sidebar-tab-btn ${activeTab === 'project' ? 'active' : ''}`}
              onClick={() => setActiveTab('project')}
            >
              <Database size={14} />
              <span>Project Settings</span>
            </button>
            <button
              type="button"
              className={`sidebar-tab-btn ${activeTab === 'backup' ? 'active' : ''}`}
              onClick={() => setActiveTab('backup')}
            >
              <RotateCcw size={14} />
              <span>Backup & Reset</span>
            </button>
          </div>

          {/* TAB PANES */}
          <div className="ai-settings-content">
            {/* 1. MODELS TAB */}
            {activeTab === 'models' && (
              <div className="tab-pane">
                <div className="pane-header-row">
                  <div>
                    <h3 className="pane-title">Configured Models</h3>
                    <p className="pane-subtitle">Switch active models with zero task loss or configure limits</p>
                  </div>
                  <div className="pane-actions">
                    <button type="button" className="btn-secondary" onClick={() => setActiveTab('providers')}>
                      <Layers size={13} /> Manage Providers
                    </button>
                  </div>
                </div>

                <div className="models-grid">
                  {filteredModels.length === 0 && (
                    <div style={{ padding: '36px', textAlign: 'center', color: '#888', gridColumn: '1 / -1' }}>
                      <Cpu size={32} style={{ margin: '0 auto 12px', opacity: 0.5 }} />
                      <p style={{ fontWeight: 500, color: '#e0e0e0' }}>No models found for connected providers</p>
                      <p style={{ fontSize: '12px', marginTop: '6px' }}>Configure an API key in the Providers tab or run Ollama locally.</p>
                      <button type="button" className="btn-secondary" style={{ marginTop: '14px', display: 'inline-flex' }} onClick={() => setActiveTab('providers')}>
                        <Layers size={13} /> Go to Providers
                      </button>
                    </div>
                  )}
                  {filteredModels.map(m => {
                    const isActive = m.id === activeModel;
                    const isReady = m.status === 'ready' || m.status === 'connected';

                    return (
                      <div key={m.id} className={`model-card ${isActive ? 'model-card-active' : ''}`}>
                        <div className="model-card-header">
                          <div className="model-card-title-group">
                            <span className="model-card-name">{m.name}</span>
                            <span className="model-card-provider">{m.providerId}</span>
                          </div>
                          {isActive && (
                            <span className="active-pill">
                              <Check size={11} /> Active
                            </span>
                          )}
                        </div>

                        <div className="model-card-metrics">
                          <div className="metric-item">
                            <span className="metric-label">Context Window</span>
                            <span className="metric-val">
                              {m.contextWindow >= 1000000 ? `${Math.round(m.contextWindow / 1000000)}M` : `${Math.round(m.contextWindow / 1024)}K tokens`}
                            </span>
                          </div>
                          <div className="metric-item">
                            <span className="metric-label">Pricing (In/Out)</span>
                            <span className="metric-val">
                              {m.inputCost === 0 ? 'Free / Local' : `$${m.inputCost}/$${m.outputCost}`}
                            </span>
                          </div>
                        </div>

                        <div className="model-card-capabilities">
                          {m.capabilities?.vision && <span className="cap-badge">Vision</span>}
                          {m.capabilities?.tools && <span className="cap-badge">Tools</span>}
                          {m.capabilities?.streaming && <span className="cap-badge">Streaming</span>}
                          {m.capabilities?.structuredOutput && <span className="cap-badge">JSON Mode</span>}
                        </div>

                        <div className="model-card-footer">
                          <div className="model-status-indicator">
                            <span className={`status-dot ${isReady ? 'ready' : 'offline'}`} />
                            <span className="model-status-text">
                              {m.statusMessage || (isReady ? 'Connected' : 'Key required')}
                            </span>
                          </div>

                          <div className="model-card-btns">
                            {!isActive && (
                              <button
                                type="button"
                                className="btn-select-model"
                                onClick={() => handleSelectModel(m.id)}
                              >
                                Use Model
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* 2. PROVIDERS TAB */}
            {activeTab === 'providers' && (
              <div className="tab-pane">
                <div className="pane-header-row">
                  <div>
                    <h3 className="pane-title">LLM Providers</h3>
                    <p className="pane-subtitle">
                      Manage endpoints, authentication, and connection health. Keys are securely stored in <code>~/.ai-native-editor/credentials.json</code>.
                    </p>
                  </div>
                </div>

                {editingProvider && (
                  <div className="key-edit-card" style={{ marginBottom: '16px' }}>
                    <div className="key-edit-header">
                      <span>
                        {credentials[editingProvider]?.hasKey ? 'Update API Key for ' : 'Enter API Key for '}
                        <strong>{(runtimeConfig?.providers?.[editingProvider]?.name || editingProvider).toUpperCase()}</strong>
                        {credentials[editingProvider]?.hasKey && (
                          <span style={{ marginLeft: '10px', fontSize: '11px', color: '#98c379', fontWeight: 'normal' }}>
                            (Current key: <code>{credentials[editingProvider].maskedKey}</code>)
                          </span>
                        )}
                      </span>
                      <button
                        type="button"
                        className="close-mini-btn"
                        onClick={() => {
                          setEditingProvider(null);
                          setApiKeyInput('');
                          setShowKeyText(false);
                        }}
                      >
                        <X size={14} />
                      </button>
                    </div>
                    <div className="key-input-row">
                      <div className="key-input-wrapper">
                        <input
                          type={showKeyText ? 'text' : 'password'}
                          name={`api_key_field_${editingProvider}`}
                          id={`api_key_field_${editingProvider}`}
                          autoComplete="new-password"
                          autoCorrect="off"
                          autoCapitalize="off"
                          spellCheck={false}
                          data-lpignore="true"
                          data-1p-ignore="true"
                          data-form-type="other"
                          placeholder={
                            editingProvider === 'google'
                              ? 'Paste Google Gemini API key (AIzaSy...)'
                              : editingProvider === 'anthropic'
                                ? 'Paste Anthropic API key (sk-ant-...)'
                                : editingProvider === 'openai'
                                  ? 'Paste OpenAI API key (sk-proj-...)'
                                  : editingProvider === 'mistral'
                                    ? 'Paste Mistral AI API key...'
                                    : editingProvider === 'xai'
                                      ? 'Paste xAI Grok API key...'
                                      : editingProvider === 'openrouter'
                                        ? 'Paste OpenRouter API key (sk-or-...)'
                                        : 'Paste API key here...'
                          }
                          value={apiKeyInput}
                          onChange={(e) => setApiKeyInput(e.target.value)}
                          className="key-text-input"
                          autoFocus
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' && apiKeyInput.trim()) {
                              handleSaveApiKey(editingProvider);
                            }
                          }}
                        />
                        {apiKeyInput && (
                          <button
                            type="button"
                            className="key-clear-btn"
                            onClick={() => setApiKeyInput('')}
                            title="Clear input"
                            style={{
                              background: 'transparent',
                              border: 'none',
                              color: '#888',
                              cursor: 'pointer',
                              padding: '0 6px',
                              display: 'flex',
                              alignItems: 'center',
                            }}
                          >
                            <X size={13} />
                          </button>
                        )}
                        <button
                          type="button"
                          className="key-visibility-toggle"
                          onClick={() => setShowKeyText(!showKeyText)}
                          title={showKeyText ? 'Hide API key' : 'Show API key'}
                        >
                          {showKeyText ? <EyeOff size={14} /> : <Eye size={14} />}
                        </button>
                      </div>
                      <button
                        type="button"
                        className="btn-primary"
                        onClick={() => handleSaveApiKey(editingProvider)}
                        disabled={!apiKeyInput.trim()}
                      >
                        Save Key
                      </button>
                    </div>
                  </div>
                )}

                <div className="providers-list">
                  {Object.entries(runtimeConfig?.providers || {}).map(([pId, pConf]: [string, any]) => {
                    const cred = credentials[pId];
                    const isConnected = pId === 'ollama' ? true : Boolean(cred?.hasKey);

                    return (
                      <div key={pId} className="provider-row-card">
                        <div className="provider-info-col">
                          <div className="provider-name-row">
                            <span className="provider-name">{pConf.name}</span>
                            <span className={`provider-status-tag ${isConnected ? 'connected' : 'unconfigured'}`}>
                              {isConnected ? '● Connected' : '○ Not configured'}
                            </span>
                          </div>
                          <div className="provider-endpoint-text">
                            Endpoint: <code>{pConf.endpoint}</code>
                            {cred?.hasKey && (
                              <span style={{ marginLeft: '12px', color: '#98c379' }}>
                                Key: <code className="masked-code" style={{ padding: '1px 6px', fontSize: '11px', background: '#1c1c20', borderRadius: '4px', color: '#9cdcfe' }}>{cred.maskedKey}</code>
                              </span>
                            )}
                          </div>
                        </div>

                        <div className="provider-actions-col">
                          {pId === 'ollama' ? (
                            <button
                              type="button"
                              className="btn-secondary"
                              onClick={() => handleTestConnection('ollama')}
                              disabled={testingConnection === 'ollama'}
                            >
                              {testingConnection === 'ollama' ? 'Testing...' : 'Test Connection'}
                            </button>
                          ) : (
                            <>
                              <button
                                type="button"
                                className="btn-secondary"
                                onClick={() => {
                                  setEditingProvider(pId);
                                  setApiKeyInput('');
                                  setShowKeyText(false);
                                }}
                              >
                                {cred?.hasKey ? 'Edit Key' : 'Add Key'}
                              </button>
                              {cred?.hasKey && (
                                <>
                                  <button
                                    type="button"
                                    className="btn-secondary"
                                    onClick={() => handleTestConnection(pId)}
                                    disabled={testingConnection === pId}
                                  >
                                    {testingConnection === pId ? 'Testing...' : 'Test'}
                                  </button>
                                  <button
                                    type="button"
                                    className="key-delete-btn"
                                    onClick={() => handleDeleteApiKey(pId)}
                                    title="Remove API Key"
                                  >
                                    <Trash2 size={13} />
                                  </button>
                                </>
                              )}
                            </>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* 4. CONTEXT & MEMORY TAB */}
            {activeTab === 'context' && (
              <div className="tab-pane">
                <div className="pane-header-row">
                  <div>
                    <h3 className="pane-title">Context Window & Memory Compaction</h3>
                    <p className="pane-subtitle">
                      Monitor token capacity and compact long conversation histories while preserving critical goals and files.
                    </p>
                  </div>
                  <button
                    type="button"
                    className="btn-primary"
                    onClick={handleCompactContext}
                  >
                    <Zap size={13} /> Compact Context Now
                  </button>
                </div>

                <div className="context-meter-card">
                  <div className="context-card-top">
                    <div>
                      <span className="context-card-heading">Active Model Context Usage</span>
                      <div className="context-card-stats">
                        <strong>{contextUsage?.usedTokens || 0}</strong> / {contextUsage?.maxTokens || 200000} tokens ({contextUsage?.percentage || 0}%)
                      </div>
                    </div>
                    <span className={`threshold-badge badge-${contextUsage?.threshold || 'normal'}`}>
                      {contextUsage?.threshold?.toUpperCase() || 'NORMAL'}
                    </span>
                  </div>

                  <div className="large-meter-track">
                    <div
                      className={`large-meter-fill meter-${contextUsage?.threshold || 'normal'}`}
                      style={{ width: `${Math.min(100, Math.max(3, contextUsage?.percentage || 0))}%` }}
                    />
                  </div>

                  <div className="meter-scale-markers">
                    <span>0%</span>
                    <span>70% (Warning)</span>
                    <span>85% (High)</span>
                    <span>95% (Critical)</span>
                    <span>100%</span>
                  </div>
                </div>

                <div className="settings-section-card">
                  <h4 className="section-card-title">Context Compaction Strategy</h4>
                  <p className="section-card-desc">
                    When compaction occurs, our engine surgically extracts:
                  </p>
                  <ul className="compaction-rules-list">
                    <li>✓ User requirements and goals</li>
                    <li>✓ Architecture and implementation decisions</li>
                    <li>✓ List of modified and referenced workspace files</li>
                    <li>✓ Current unresolved compiler or runtime errors</li>
                    <li>✓ Active constraints and rules</li>
                  </ul>
                </div>
              </div>
            )}

            {/* 5. ROUTING & FALLBACKS TAB */}
            {activeTab === 'routing' && (
              <div className="tab-pane">
                <div className="pane-header-row">
                  <div>
                    <h3 className="pane-title">Model Routing</h3>
                    <p className="pane-subtitle">Assign specialized AI models to each phase of the autonomous development workflow</p>
                  </div>
                </div>

                {/* Workflow Model Routing */}
                <div className="settings-section-card">
                  <h4 className="section-card-title">Multi-Model Workflow Routing</h4>
                  <p className="section-card-desc">Assign specialized AI models to each phase of the autonomous development workflow:</p>
                  
                  <div className="workflow-routing-grid">
                    {[
                      { key: 'planningModel', label: '📋 Planning Model', desc: 'Creates task breakdown and step list', def: 'gemma4:31b-cloud' },
                      { key: 'reasoningModel', label: '🧠 Reasoning Model', desc: 'Analyzes project architecture and failures', def: 'gemma4:31b-cloud' },
                      { key: 'codingModel', label: '✏ Coding Model', desc: 'Generates and edits code in files', def: 'qwen2.5-coder:7b' },
                      { key: 'reviewModel', label: '🔍 Review Model', desc: 'Reviews code changes and diff quality', def: 'qwen2.5-coder:7b' },
                      { key: 'testingModel', label: '🧪 Testing / Debug Model', desc: 'Runs test commands and fixes test errors', def: 'qwen2.5-coder:7b' },
                    ].map((phase) => {
                      const currentVal = runtimeConfig?.workflowRouting?.[phase.key] || phase.def;
                      const cleanCurrentVal = (currentVal || '').replace(/^ollama-/, '');
                      const cleanDef = phase.def.replace(/^ollama-/, '');

                      // Only models from existing/connected providers (locally or via API key)
                      const availableForRouting = connectedModels;
                      const hasDefaultInList = availableForRouting.some(
                        (m: any) => m.id.replace(/^ollama-/, '') === cleanDef
                      );

                      // Match current value cleanly
                      const matchingModel = availableForRouting.find(
                        (m: any) => m.id.replace(/^ollama-/, '') === cleanCurrentVal || m.id === currentVal
                      );
                      const selectedVal = matchingModel
                        ? matchingModel.id.replace(/^ollama-/, '')
                        : (hasDefaultInList ? cleanDef : (availableForRouting[0]?.id.replace(/^ollama-/, '') || cleanCurrentVal));

                      return (
                        <div key={phase.key} className="workflow-routing-item">
                          <div className="workflow-routing-label">{phase.label}</div>
                          <div className="workflow-routing-desc">{phase.desc}</div>
                          <select
                            className="workflow-routing-select"
                            value={selectedVal}
                            onChange={(e) => {
                              const newRouting = {
                                ...(runtimeConfig?.workflowRouting || {}),
                                [phase.key]: e.target.value,
                              };
                              axios
                                .post(`${API}/ai/workflow-routing`, { routing: newRouting })
                                .then(() => {
                                  setActionMessage({ text: `Updated ${phase.label} to ${e.target.value}`, type: 'success' });
                                  loadAllData();
                                })
                                .catch(() => {});
                            }}
                          >
                            {availableForRouting.length === 0 && (
                              <option value="" disabled>No connected models available</option>
                            )}
                            {availableForRouting.map((m: any) => {
                              const cleanId = m.id.replace(/^ollama-/, '');
                              const isDefault = cleanId === cleanDef;
                              return (
                                <option key={m.id} value={cleanId}>
                                  {m.name}{isDefault ? ' (Default)' : ''}
                                </option>
                              );
                            })}
                          </select>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Agent Change Approval Mode */}
                <div className="settings-section-card">
                  <h4 className="section-card-title">Agent Change Approval</h4>
                  <p className="section-card-desc">Control how the agent proposes and applies changes to workspace files:</p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '10px' }}>
                    {[
                      {
                        mode: 'automatic',
                        title: 'Automatic',
                        desc: 'Agent changes are applied automatically to disk while running.',
                      },
                      {
                        mode: 'ask_before_changes',
                        title: 'Ask before changes',
                        desc: 'Agent pauses and presents changes before writing modifications.',
                      },
                      {
                        mode: 'review_after_task',
                        title: 'Review changes after task',
                        desc: 'Agent completes its work and presents a complete unified diff for Accept/Reject review.',
                      },
                    ].map((item) => {
                      const isSelected = (runtimeConfig?.approvalMode || 'automatic') === item.mode;
                      return (
                        <div
                          key={item.mode}
                          onClick={() => {
                            axios
                              .post(`${API}/ai/agent/approval-mode`, { mode: item.mode })
                              .then(() => {
                                setActionMessage({ text: `Approval mode updated to ${item.title}`, type: 'success' });
                                loadAllData();
                              })
                              .catch(() => {});
                          }}
                          style={{
                            display: 'flex',
                            alignItems: 'flex-start',
                            gap: '10px',
                            padding: '8px 12px',
                            background: isSelected ? 'rgba(59, 130, 246, 0.12)' : '#1c1c20',
                            border: `1px solid ${isSelected ? '#3b82f6' : '#2e2e34'}`,
                            borderRadius: '6px',
                            cursor: 'pointer',
                          }}
                        >
                          <input
                            type="radio"
                            name="approvalMode"
                            checked={isSelected}
                            readOnly
                            style={{ marginTop: '3px' }}
                          />
                          <div>
                            <div style={{ fontSize: '12px', fontWeight: 600, color: isSelected ? '#93c5fd' : '#e4e4e7' }}>
                              {item.title}
                            </div>
                            <div style={{ fontSize: '11px', color: '#888890', marginTop: '2px' }}>
                              {item.desc}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}

            {/* 6. SKILLS TAB */}
            {activeTab === 'skills' && (
              <div className="tab-pane">
                <div className="pane-header-row">
                  <div>
                    <h3 className="pane-title">AI Skills & Profiles</h3>
                    <p className="pane-subtitle">Enable or disable high-level capabilities the agent can adopt</p>
                  </div>
                </div>

                {/* Skill Profiles Bar */}
                <div className="skill-profiles-bar">
                  <span className="profile-label">Quick Profile:</span>
                  {skillProfiles.map(p => (
                    <button
                      key={p.id}
                      type="button"
                      className={`profile-pill ${activeSkillProfile === p.id ? 'active' : ''}`}
                      onClick={() => handleApplySkillProfile(p.id)}
                    >
                      {p.name}
                    </button>
                  ))}
                </div>

                <div className="skills-grid">
                  {filteredSkills.map(s => {
                    const isEnabled = runtimeConfig?.skills?.enabled?.includes(s.id);

                    return (
                      <div key={s.id} className={`skill-card ${isEnabled ? 'skill-card-enabled' : ''}`}>
                        <div className="skill-card-top">
                          <span className="skill-name">{s.name}</span>
                          <input
                            type="checkbox"
                            checked={isEnabled}
                            onChange={() => handleToggleSkill(s.id, isEnabled)}
                            className="skill-toggle-switch"
                          />
                        </div>
                        <p className="skill-description">{s.description}</p>
                        <span className="skill-category-tag">{s.category || 'general'}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* 7. TOOLS TAB */}
            {activeTab === 'tools' && (
              <div className="tab-pane">
                <div className="pane-header-row">
                  <div>
                    <h3 className="pane-title">Tools & Permissions Registry</h3>
                    <p className="pane-subtitle">Control executable tools and their permission levels</p>
                  </div>
                </div>

                <div className="tools-table-container">
                  <table className="tools-table">
                    <thead>
                      <tr>
                        <th>Tool Name</th>
                        <th>Category</th>
                        <th>Safety</th>
                        <th>Permission Level</th>
                        <th className="text-right">Enabled</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredTools.map(t => {
                        const isEnabled = enabledTools.includes(t.id);
                        const currentPerm = toolPermissions[t.id] || t.permissions?.default || 'ask';

                        return (
                          <tr key={t.id} className={isEnabled ? '' : 'tool-disabled-row'}>
                            <td>
                              <div className="tool-title-col">
                                <span className="tool-name">{t.name}</span>
                                <span className="tool-desc">{t.description}</span>
                              </div>
                            </td>
                            <td>
                              <span className="tool-cat-badge">{t.category || 'System'}</span>
                            </td>
                            <td>
                              {t.permissions?.destructive ? (
                                <span className="destructive-badge">⚠ Destructive</span>
                              ) : (
                                <span className="safe-badge">Safe</span>
                              )}
                            </td>
                            <td>
                              <select
                                className="tool-perm-select"
                                value={currentPerm}
                                onChange={(e) => handleChangeToolPermission(t.id, e.target.value)}
                              >
                                <option value="allow">Always Allow</option>
                                <option value="ask">Ask Every Time</option>
                                <option value="workspace">Allow in Workspace</option>
                                <option value="deny">Disabled</option>
                              </select>
                            </td>
                            <td className="text-right">
                              <input
                                type="checkbox"
                                checked={isEnabled}
                                onChange={(e) => handleToggleTool(t.id, e.target.checked)}
                                className="settings-checkbox"
                              />
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* 8. PLUGINS TAB */}
            {activeTab === 'plugins' && (
              <div className="tab-pane">
                <div className="pane-header-row">
                  <div>
                    <h3 className="pane-title">Plugins & Extensions</h3>
                    <p className="pane-subtitle">Extend the editor and agent with third-party toolkits</p>
                  </div>
                </div>

                <div className="plugins-grid">
                  {plugins.map(p => (
                    <div key={p.id} className="plugin-card">
                      <div className="plugin-header">
                        <div className="plugin-icon-box">
                          <Puzzle size={16} />
                        </div>
                        <div className="plugin-title-box">
                          <span className="plugin-name">{p.name}</span>
                          <span className="plugin-status-tag">
                            {p.installed ? 'Installed' : 'Available'}
                          </span>
                        </div>
                      </div>
                      <p className="plugin-desc">{p.description}</p>
                      {p.permissions && (
                        <div className="plugin-permissions-box">
                          <div className="perms-title">Granular Permissions:</div>
                          {Object.entries(p.permissions).map(([permKey, allowed]: [string, any]) => (
                            <label key={permKey} className="plugin-perm-item">
                              <input type="checkbox" checked={allowed} readOnly />
                              <span>{permKey.replace(/_/g, ' ')}</span>
                            </label>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 9. CONNECTORS TAB */}
            {activeTab === 'connectors' && (
              <div className="tab-pane">
                <div className="pane-header-row">
                  <div>
                    <h3 className="pane-title">Data Connectors</h3>
                    <p className="pane-subtitle">Connect external sources (GitHub, Discord, PostgreSQL, SQLite)</p>
                  </div>
                </div>

                <div className="connectors-list">
                  {connectors.map(c => (
                    <div key={c.id} className="connector-card">
                      <div className="connector-info">
                        <div className="connector-title-row">
                          <span className="connector-name">{c.name}</span>
                          <span className="connector-category">{c.category}</span>
                          <span className={`connector-status ${c.connected ? 'connected' : 'disconnected'}`}>
                            {c.connected ? '✓ Connected' : 'Disconnected'}
                          </span>
                        </div>
                        <p className="connector-desc">{c.description}</p>
                        {c.availableResources && (
                          <div className="connector-resources">
                            Resources: {c.availableResources.join(', ')}
                          </div>
                        )}
                      </div>
                      <div className="connector-actions">
                        <button
                          type="button"
                          className={c.connected ? 'btn-secondary' : 'btn-primary'}
                          onClick={() => {
                            axios.post(`${API}/ai/connectors/toggle`, {
                              connectorId: c.id,
                              enabled: !c.enabled,
                            }).then(() => loadAllData());
                          }}
                        >
                          {c.connected ? 'Disconnect' : 'Connect'}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 10. PERMISSIONS & SECURITY TAB */}
            {activeTab === 'permissions' && (
              <div className="tab-pane">
                <div className="pane-header-row">
                  <div>
                    <h3 className="pane-title">Permissions & Security Boundaries</h3>
                    <p className="pane-subtitle">Multi-tier security boundaries between Model and Host System</p>
                  </div>
                </div>

                <div className="settings-section-card">
                  <h4 className="section-card-title">Security Architecture</h4>
                  <div className="security-boundary-diagram">
                    <span className="boundary-node">Model Prompt</span>
                    <span className="boundary-arrow">→</span>
                    <span className="boundary-node highlight">AI Runtime Validation</span>
                    <span className="boundary-arrow">→</span>
                    <span className="boundary-node alert">Permission Guardrail</span>
                    <span className="boundary-arrow">→</span>
                    <span className="boundary-node">Local System</span>
                  </div>
                </div>

                <div className="settings-section-card">
                  <h4 className="section-card-title">Destructive Action Guardrails</h4>
                  <p className="section-card-desc">Always require confirmation before executing the following:</p>
                  <ul className="compaction-rules-list">
                    <li>✓ Overwriting existing files outside the workspace</li>
                    <li>✓ Running unverified shell commands via terminal</li>
                    <li>✓ Modifying database schemas or dropping tables</li>
                    <li>✓ Git reset, force push, or branch deletions</li>
                  </ul>
                </div>
              </div>
            )}

            {/* 11. PROJECT SETTINGS TAB */}
            {activeTab === 'project' && (
              <div className="tab-pane">
                <div className="pane-header-row">
                  <div>
                    <h3 className="pane-title">Project-Specific AI Settings</h3>
                    <p className="pane-subtitle">Scoped configuration saved to <code>.ai/settings.json</code> inside the current workspace</p>
                  </div>
                </div>

                <div className="settings-section-card">
                  <h4 className="section-card-title">Active Workspace</h4>
                  <p className="section-card-desc">
                    {workspacePath ? (
                      <>Current project: <code>{workspacePath}</code></>
                    ) : (
                      <>No project currently open. Open a project to configure project-level AI settings.</>
                    )}
                  </p>
                </div>
              </div>
            )}

            {/* 12. BACKUP & RESET TAB */}
            {activeTab === 'backup' && (
              <div className="tab-pane">
                <div className="pane-header-row">
                  <div>
                    <h3 className="pane-title">Backup, Export & Reset</h3>
                    <p className="pane-subtitle">Export settings safely without secrets, or reset categories to default</p>
                  </div>
                </div>

                <div className="settings-section-card">
                  <h4 className="section-card-title">Export Settings</h4>
                  <p className="section-card-desc">
                    Downloads an <code>ai-settings.json</code> file containing your configured models, tools, skills, and routing rules.
                    <strong> API keys and passwords are NEVER included in exports.</strong>
                  </p>
                  <button type="button" className="btn-secondary" onClick={handleExport}>
                    <Download size={14} /> Export Configuration (JSON)
                  </button>
                </div>

                <div className="settings-section-card">
                  <h4 className="section-card-title">Reset to Defaults</h4>
                  <p className="section-card-desc">
                    Reset specific categories back to out-of-the-box defaults. Your saved API keys will remain untouched.
                  </p>
                  <div className="reset-btns-row">
                    <button type="button" className="btn-danger-outline" onClick={() => handleResetCategory('models')}>
                      Reset Models
                    </button>
                    <button type="button" className="btn-danger-outline" onClick={() => handleResetCategory('skills')}>
                      Reset Skills
                    </button>
                    <button type="button" className="btn-danger-outline" onClick={() => handleResetCategory('tools')}>
                      Reset Tools
                    </button>
                    <button type="button" className="btn-danger-outline" onClick={() => handleResetCategory('all')}>
                      Reset All Settings
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
