import React, { useState, useCallback, useRef, useEffect } from 'react';
import { Globe, Plus, X, RefreshCw, ExternalLink, Loader2, Wifi, WifiOff, Search } from 'lucide-react';
import { BrowserDiagnostic, DiagnosticInfo, DiagnosticType } from './BrowserDiagnostic';
import type { BrowserTab } from '../hooks/useBrowserServices';

interface BrowserPanelProps {
  tabs: BrowserTab[];
  activeTab: BrowserTab | null;
  onSelectTab: (tabId: string) => void;
  onCloseTab: (tabId: string) => void;
  onAddManualTab: (url: string, title?: string) => void;
  onUpdateTabStatus: (tabId: string, status: BrowserTab['status'], error?: string) => void;
  onRefreshServices: () => void;
}

// Status indicator colors
function getStatusColor(status: BrowserTab['status']): string {
  switch (status) {
    case 'ready': return 'var(--browser-status-ready, #4ec9b0)';
    case 'loading': return 'var(--browser-status-loading, #dcdcaa)';
    case 'error': return 'var(--browser-status-error, #f14c4c)';
    case 'reconnecting': return 'var(--browser-status-reconnecting, #cca700)';
    default: return '#808080';
  }
}

function getFrameworkIcon(framework?: string): string {
  switch (framework) {
    case 'react': case 'next': return '⚛️';
    case 'vue': case 'nuxt': return '💚';
    case 'angular': return '🅰️';
    case 'svelte': return '🔥';
    case 'django': return '🐍';
    case 'flask': return '🌶️';
    case 'fastapi': return '⚡';
    case 'vite': return '⚡';
    case 'rails': return '💎';
    case 'laravel': return '🔴';
    case 'express': return '📦';
    default: return '🌐';
  }
}

export function BrowserPanel({
  tabs,
  activeTab,
  onSelectTab,
  onCloseTab,
  onAddManualTab,
  onUpdateTabStatus,
  onRefreshServices,
}: BrowserPanelProps) {
  const [showUrlInput, setShowUrlInput] = useState(false);
  const [manualUrl, setManualUrl] = useState('');
  const [urlBarValue, setUrlBarValue] = useState('');
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const urlInputRef = useRef<HTMLInputElement>(null);
  const healthCheckTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Sync URL bar with active tab
  useEffect(() => {
    if (activeTab) {
      setUrlBarValue(activeTab.url);
    }
  }, [activeTab?.url, activeTab?.id]);

  // Iframe load handlers
  const handleIframeLoad = useCallback(() => {
    if (activeTab) {
      onUpdateTabStatus(activeTab.id, 'ready');
    }
  }, [activeTab?.id, onUpdateTabStatus]);

  const handleIframeError = useCallback(() => {
    if (activeTab) {
      onUpdateTabStatus(activeTab.id, 'error', 'Failed to load page');
    }
  }, [activeTab?.id, onUpdateTabStatus]);

  // Health check for error/reconnecting tabs
  useEffect(() => {
    if (healthCheckTimerRef.current) {
      clearInterval(healthCheckTimerRef.current);
      healthCheckTimerRef.current = null;
    }

    if (activeTab && (activeTab.status === 'error' || activeTab.status === 'reconnecting')) {
      healthCheckTimerRef.current = setInterval(async () => {
        try {
          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), 3000);
          await fetch(activeTab.proxyUrl || activeTab.url, {
            method: 'HEAD',
            mode: 'no-cors',
            signal: controller.signal,
          });
          clearTimeout(timeout);
          // If we reach here, the service is reachable — reload
          onUpdateTabStatus(activeTab.id, 'loading');
          if (iframeRef.current) {
            iframeRef.current.src = activeTab.proxyUrl || activeTab.url;
          }
        } catch {
          // Still unreachable
        }
      }, 3000);
    }

    return () => {
      if (healthCheckTimerRef.current) {
        clearInterval(healthCheckTimerRef.current);
      }
    };
  }, [activeTab?.id, activeTab?.status, activeTab?.proxyUrl, activeTab?.url, onUpdateTabStatus]);

  // Handle manual URL entry
  const handleAddManualUrl = useCallback(() => {
    if (!manualUrl.trim()) return;
    let url = manualUrl.trim();
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      url = `http://${url}`;
    }
    onAddManualTab(url);
    setManualUrl('');
    setShowUrlInput(false);
  }, [manualUrl, onAddManualTab]);

  // Handle URL bar navigation
  const handleUrlBarSubmit = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && activeTab) {
      let inputVal = urlBarValue.trim();
      if (!inputVal) return;

      onUpdateTabStatus(activeTab.id, 'loading');

      // If activeTab has a registered serviceId
      if (activeTab.serviceId) {
        let subPath = '/';
        let isDifferentHostOrPort = false;

        if (inputVal.startsWith('/')) {
          subPath = inputVal;
        } else {
          try {
            if (!inputVal.startsWith('http://') && !inputVal.startsWith('https://')) {
              inputVal = `http://${inputVal}`;
            }
            const parsed = new URL(inputVal);
            if (activeTab.port && parsed.port && parseInt(parsed.port, 10) !== activeTab.port) {
              isDifferentHostOrPort = true;
            } else {
              subPath = parsed.pathname + parsed.search + parsed.hash;
            }
          } catch {
            subPath = inputVal.startsWith('/') ? inputVal : `/${inputVal}`;
          }
        }

        if (isDifferentHostOrPort) {
          onAddManualTab(inputVal);
          return;
        }

        // Keep proxy route intact
        const baseProxy = activeTab.proxyUrl.includes(activeTab.serviceId)
          ? activeTab.proxyUrl.split(activeTab.serviceId)[0] + activeTab.serviceId
          : `http://localhost:5001/preview/${activeTab.serviceId}`;

        const cleanSubPath = subPath.startsWith('/') ? subPath : `/${subPath}`;
        const newProxyUrl = `${baseProxy}${cleanSubPath}`;

        if (iframeRef.current) {
          iframeRef.current.src = newProxyUrl;
        }
      } else {
        if (!inputVal.startsWith('http://') && !inputVal.startsWith('https://')) {
          inputVal = `http://${inputVal}`;
        }
        if (iframeRef.current) {
          iframeRef.current.src = inputVal;
        }
      }
    }
  }, [urlBarValue, activeTab, onUpdateTabStatus, onAddManualTab]);

  // Handle reload
  const handleReload = useCallback(() => {
    if (activeTab && iframeRef.current) {
      onUpdateTabStatus(activeTab.id, 'loading');
      iframeRef.current.src = activeTab.proxyUrl || activeTab.url;
    }
  }, [activeTab, onUpdateTabStatus]);

  // Handle open in external browser
  const handleOpenExternal = useCallback(() => {
    if (activeTab) {
      window.open(activeTab.url, '_blank');
    }
  }, [activeTab]);

  // Build diagnostic info for error states
  const getDiagnosticInfo = useCallback((): DiagnosticInfo | null => {
    if (!activeTab || (activeTab.status !== 'error' && activeTab.status !== 'reconnecting')) {
      return null;
    }

    let type: DiagnosticType = 'unknown';
    const error = activeTab.error?.toLowerCase() || '';

    if (error.includes('connection refused') || error.includes('err_connection_refused')) {
      type = 'connection_refused';
    } else if (error.includes('timeout')) {
      type = 'connection_timeout';
    } else if (error.includes('cors')) {
      type = 'cors_error';
    } else if (error.includes('csrf')) {
      type = 'csrf_error';
    } else if (error.includes('csp') || error.includes('content security policy')) {
      type = 'csp_blocked';
    } else if (error.includes('x-frame') || error.includes('frame-options')) {
      type = 'xframe_blocked';
    } else if (error.includes('cert') || error.includes('certificate')) {
      type = 'cert_error';
    } else if (activeTab.status === 'reconnecting') {
      type = 'reconnecting';
    } else if (error.includes('stopped') || error.includes('server stopped')) {
      type = 'server_stopped';
    }

    return {
      type,
      serviceName: activeTab.title,
      serviceUrl: activeTab.url,
      port: activeTab.port,
      framework: activeTab.framework,
      detail: activeTab.error,
      searching: activeTab.status === 'reconnecting',
    };
  }, [activeTab]);

  const diagnostic = getDiagnosticInfo();

  // Empty state — no tabs
  if (tabs.length === 0 && !showUrlInput) {
    return (
      <div className="browser-panel-empty">
        <div className="browser-empty-content">
          <Globe size={48} className="browser-empty-icon" />
          <h3>No Running Applications</h3>
          <p>Start a development server to see it here automatically, or add a URL manually.</p>
          <div className="browser-empty-actions">
            <button
              className="browser-empty-btn"
              onClick={() => {
                setShowUrlInput(true);
                setTimeout(() => urlInputRef.current?.focus(), 100);
              }}
            >
              <Plus size={14} />
              <span>Add URL</span>
            </button>
            <button className="browser-empty-btn" onClick={onRefreshServices}>
              <Search size={14} />
              <span>Scan for Services</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="browser-panel">
      {/* Browser Tab Bar */}
      <div className="browser-tab-bar">
        <div className="browser-tabs-scroll">
          {tabs.map(tab => (
            <div
              key={tab.id}
              className={`browser-tab ${tab.id === activeTab?.id ? 'browser-tab-active' : ''}`}
              onClick={() => onSelectTab(tab.id)}
            >
              <span className="browser-tab-status" style={{ backgroundColor: getStatusColor(tab.status) }} />
              <span className="browser-tab-icon">{getFrameworkIcon(tab.framework)}</span>
              <span className="browser-tab-title" title={tab.url}>{tab.title}</span>
              <button
                className="browser-tab-close"
                onClick={(e) => {
                  e.stopPropagation();
                  onCloseTab(tab.id);
                }}
                title="Close tab"
              >
                <X size={10} />
              </button>
            </div>
          ))}

          {/* Add tab button */}
          <button
            className="browser-tab-add"
            onClick={() => {
              setShowUrlInput(true);
              setTimeout(() => urlInputRef.current?.focus(), 100);
            }}
            title="Add custom URL"
          >
            <Plus size={12} />
          </button>
        </div>

        {/* URL input for manual tab */}
        {showUrlInput && (
          <div className="browser-url-input-overlay">
            <input
              ref={urlInputRef}
              type="text"
              className="browser-url-input"
              placeholder="http://localhost:3000"
              value={manualUrl}
              onChange={(e) => setManualUrl(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleAddManualUrl();
                if (e.key === 'Escape') {
                  setShowUrlInput(false);
                  setManualUrl('');
                }
              }}
              onBlur={() => {
                if (!manualUrl.trim()) {
                  setShowUrlInput(false);
                }
              }}
            />
            <button className="browser-url-go" onClick={handleAddManualUrl}>Go</button>
          </div>
        )}
      </div>

      {/* URL Bar */}
      {activeTab && (
        <div className="browser-url-bar">
          <div className="browser-url-bar-left">
            <button className="browser-url-action" onClick={handleReload} title="Reload">
              <RefreshCw size={12} />
            </button>
          </div>
          <div className="browser-url-bar-center">
            {activeTab.status === 'loading' && <Loader2 size={12} className="browser-url-spinner" />}
            {activeTab.status === 'ready' && <Wifi size={12} className="browser-url-status-ok" />}
            {(activeTab.status === 'error' || activeTab.status === 'reconnecting') && <WifiOff size={12} className="browser-url-status-error" />}
            <input
              type="text"
              className="browser-url-field"
              value={urlBarValue}
              onChange={(e) => setUrlBarValue(e.target.value)}
              onKeyDown={handleUrlBarSubmit}
              title={activeTab.url}
            />
          </div>
          <div className="browser-url-bar-right">
            <button className="browser-url-action" onClick={handleOpenExternal} title="Open in external browser">
              <ExternalLink size={12} />
            </button>
          </div>
        </div>
      )}

      {/* Content Area */}
      <div className="browser-content">
        {activeTab && diagnostic ? (
          <BrowserDiagnostic
            diagnostic={diagnostic}
            onRetry={handleReload}
            onOpenExternal={handleOpenExternal}
          />
        ) : activeTab ? (
          <iframe
            ref={iframeRef}
            key={`${activeTab.id}-${activeTab.proxyUrl || activeTab.url}`}
            src={activeTab.proxyUrl || activeTab.url}
            className="browser-iframe"
            title={activeTab.title}
            onLoad={handleIframeLoad}
            onError={handleIframeError}
            sandbox="allow-same-origin allow-scripts allow-popups allow-forms allow-modals allow-downloads"
          />
        ) : (
          <div className="browser-panel-empty">
            <div className="browser-empty-content">
              <Globe size={48} className="browser-empty-icon" />
              <p>Select a tab to view the application</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
