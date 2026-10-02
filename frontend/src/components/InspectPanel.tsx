import React, { useState, useEffect, useMemo } from 'react';
import {
  Code,
  Terminal,
  Activity,
  Layers,
  Database,
  Shield,
  Search,
  Filter,
  Trash2,
  RefreshCw,
  AlertCircle,
  AlertTriangle,
  Info,
  CheckCircle2,
  ChevronRight,
  ChevronDown,
  Clock,
  ArrowDownUp,
  Cpu,
} from 'lucide-react';
import type {
  InspectorPanelType,
  ConsoleMessage,
  NetworkRequestLog,
  DOMNodeInfo,
  PerformanceMetrics,
  MemoryMetrics,
  StorageInspection,
  SecurityInspection,
} from '../types/workspace';

interface InspectPanelProps {
  initialPanel?: InspectorPanelType;
  consoleLogs: ConsoleMessage[];
  networkRequests: NetworkRequestLog[];
  domTree: DOMNodeInfo | null;
  performanceMetrics?: PerformanceMetrics | null;
  memoryMetrics?: MemoryMetrics | null;
  storageInspection?: StorageInspection | null;
  securityInspection?: SecurityInspection | null;
  onClearConsole?: () => void;
  onRefresh?: () => void;
  onSelectElement?: (selector: string) => void;
}

export function InspectPanel({
  initialPanel = 'console',
  consoleLogs,
  networkRequests,
  domTree,
  performanceMetrics,
  memoryMetrics,
  storageInspection,
  securityInspection,
  onClearConsole,
  onRefresh,
  onSelectElement,
}: InspectPanelProps) {
  const [activePanel, setActivePanel] = useState<InspectorPanelType>(initialPanel);

  useEffect(() => {
    if (initialPanel) {
      setActivePanel(initialPanel);
    }
  }, [initialPanel]);

  // Console filters
  const [consoleFilter, setConsoleFilter] = useState<'all' | 'error' | 'warn' | 'info'>('all');
  const [consoleSearch, setConsoleSearch] = useState('');

  // Network filters
  const [networkFilter, setNetworkFilter] = useState<string>('all');
  const [networkSearch, setNetworkSearch] = useState('');
  const [selectedRequest, setSelectedRequest] = useState<NetworkRequestLog | null>(null);

  // Elements panel state
  const [selectedNode, setSelectedNode] = useState<DOMNodeInfo | null>(domTree);
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set(['root', 'body']));

  const errorCount = useMemo(
    () => consoleLogs.filter((c) => c.level === 'error').length,
    [consoleLogs]
  );
  const warnCount = useMemo(
    () => consoleLogs.filter((c) => c.level === 'warn').length,
    [consoleLogs]
  );
  const failedNetworkCount = useMemo(
    () => networkRequests.filter((n) => n.failed).length,
    [networkRequests]
  );

  // Filtered console messages
  const filteredConsole = useMemo(() => {
    return consoleLogs.filter((c) => {
      if (consoleFilter !== 'all' && c.level !== consoleFilter) return false;
      if (consoleSearch && !c.text.toLowerCase().includes(consoleSearch.toLowerCase())) {
        return false;
      }
      return true;
    });
  }, [consoleLogs, consoleFilter, consoleSearch]);

  // Filtered network requests
  const filteredNetwork = useMemo(() => {
    return networkRequests.filter((req) => {
      if (networkFilter !== 'all') {
        if (networkFilter === 'failed' && !req.failed) return false;
        if (networkFilter !== 'failed' && req.type.toLowerCase() !== networkFilter.toLowerCase()) {
          return false;
        }
      }
      if (networkSearch) {
        const query = networkSearch.toLowerCase();
        if (!req.url.toLowerCase().includes(query) && !req.method.toLowerCase().includes(query)) {
          return false;
        }
      }
      return true;
    });
  }, [networkRequests, networkFilter, networkSearch]);

  return (
    <div className="inspect-container">
      {/* Top Inspect Sub-Navigation */}
      <div className="inspect-navbar">
        <div className="inspect-nav-tabs">
          <button
            className={`inspect-nav-btn ${activePanel === 'elements' ? 'active' : ''}`}
            onClick={() => setActivePanel('elements')}
          >
            <Code size={13} /> Elements
          </button>
          <button
            className={`inspect-nav-btn ${activePanel === 'console' ? 'active' : ''}`}
            onClick={() => setActivePanel('console')}
          >
            <Terminal size={13} /> Console
            {errorCount > 0 && <span className="inspect-pill-error">{errorCount}</span>}
          </button>
          <button
            className={`inspect-nav-btn ${activePanel === 'network' ? 'active' : ''}`}
            onClick={() => setActivePanel('network')}
          >
            <Activity size={13} /> Network
            {failedNetworkCount > 0 && <span className="inspect-pill-error">{failedNetworkCount}</span>}
          </button>
          <button
            className={`inspect-nav-btn ${activePanel === 'performance' ? 'active' : ''}`}
            onClick={() => setActivePanel('performance')}
          >
            <Clock size={13} /> Performance
          </button>
          <button
            className={`inspect-nav-btn ${activePanel === 'memory' ? 'active' : ''}`}
            onClick={() => setActivePanel('memory')}
          >
            <Cpu size={13} /> Memory
          </button>
          <button
            className={`inspect-nav-btn ${activePanel === 'application' ? 'active' : ''}`}
            onClick={() => setActivePanel('application')}
          >
            <Database size={13} /> Application
          </button>
          <button
            className={`inspect-nav-btn ${activePanel === 'security' ? 'active' : ''}`}
            onClick={() => setActivePanel('security')}
          >
            <Shield size={13} /> Security
          </button>
        </div>

        <div className="inspect-nav-actions">
          {onRefresh && (
            <button className="inspect-icon-btn" onClick={onRefresh} title="Refresh inspect telemetry">
              <RefreshCw size={13} />
            </button>
          )}
        </div>
      </div>

      {/* Main Inspect Panel Content */}
      <div className="inspect-body">
        {/* 1. ELEMENTS PANEL */}
        {activePanel === 'elements' && (
          <div className="inspect-elements-layout">
            <div className="elements-tree-pane">
              <div className="pane-header">DOM Hierarchy</div>
              <div className="elements-tree-scroll">
                {domTree ? (
                  <DOMTreeNode
                    node={domTree}
                    nodeKey="root"
                    selectedNode={selectedNode}
                    expandedNodes={expandedNodes}
                    onToggle={(k) => {
                      const next = new Set(expandedNodes);
                      if (next.has(k)) next.delete(k);
                      else next.add(k);
                      setExpandedNodes(next);
                    }}
                    onSelect={(n) => {
                      setSelectedNode(n);
                      if (onSelectElement && n.id) onSelectElement(`#${n.id}`);
                    }}
                  />
                ) : (
                  <div className="empty-hint">No active DOM tree loaded. Navigate to a page first.</div>
                )}
              </div>
            </div>

            <div className="elements-detail-pane">
              <div className="pane-header">Node Properties & Styles</div>
              {selectedNode ? (
                <div className="elements-detail-content">
                  <div className="detail-section">
                    <span className="section-label">Tag:</span>
                    <span className="code-tag">&lt;{selectedNode.tag}&gt;</span>
                  </div>
                  {selectedNode.id && (
                    <div className="detail-section">
                      <span className="section-label">ID:</span>
                      <span className="code-val">#{selectedNode.id}</span>
                    </div>
                  )}
                  {selectedNode.classes && selectedNode.classes.length > 0 && (
                    <div className="detail-section">
                      <span className="section-label">Classes:</span>
                      <div className="tag-list">
                        {selectedNode.classes.map((c) => (
                          <span key={c} className="badge-class">.{c}</span>
                        ))}
                      </div>
                    </div>
                  )}
                  {selectedNode.accessibility?.role && (
                    <div className="detail-section">
                      <span className="section-label">A11y Role:</span>
                      <span className="badge-role">{selectedNode.accessibility.role}</span>
                    </div>
                  )}
                  {selectedNode.textContent && (
                    <div className="detail-section">
                      <span className="section-label">Text Content:</span>
                      <div className="code-text-block">{selectedNode.textContent}</div>
                    </div>
                  )}
                  {selectedNode.attributes && Object.keys(selectedNode.attributes).length > 0 && (
                    <div className="detail-section">
                      <span className="section-label">Attributes:</span>
                      <div className="attributes-table">
                        {Object.entries(selectedNode.attributes).map(([k, v]) => (
                          <div key={k} className="attr-row">
                            <span className="attr-key">{k}:</span>
                            <span className="attr-val">"{v}"</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="empty-hint">Select a node from the tree to inspect attributes.</div>
              )}
            </div>
          </div>
        )}

        {/* 2. CONSOLE PANEL */}
        {activePanel === 'console' && (
          <div className="inspect-console-layout">
            <div className="console-toolbar">
              <div className="search-box">
                <Search size={12} className="search-icon" />
                <input
                  type="text"
                  placeholder="Filter console..."
                  value={consoleSearch}
                  onChange={(e) => setConsoleSearch(e.target.value)}
                />
              </div>

              <div className="filter-buttons">
                <button
                  className={`filter-btn ${consoleFilter === 'all' ? 'active' : ''}`}
                  onClick={() => setConsoleFilter('all')}
                >
                  All ({consoleLogs.length})
                </button>
                <button
                  className={`filter-btn ${consoleFilter === 'error' ? 'active' : ''}`}
                  onClick={() => setConsoleFilter('error')}
                >
                  Errors ({errorCount})
                </button>
                <button
                  className={`filter-btn ${consoleFilter === 'warn' ? 'active' : ''}`}
                  onClick={() => setConsoleFilter('warn')}
                >
                  Warnings ({warnCount})
                </button>
              </div>

              {onClearConsole && (
                <button className="clear-btn" onClick={onClearConsole} title="Clear console">
                  <Trash2 size={12} /> Clear
                </button>
              )}
            </div>

            <div className="console-messages-list">
              {filteredConsole.length > 0 ? (
                filteredConsole.map((msg) => (
                  <div key={msg.id} className={`console-row level-${msg.level}`}>
                    <span className="console-icon">
                      {msg.level === 'error' ? (
                        <AlertCircle size={13} className="text-red-400" />
                      ) : msg.level === 'warn' ? (
                        <AlertTriangle size={13} className="text-yellow-400" />
                      ) : (
                        <Info size={13} className="text-blue-400" />
                      )}
                    </span>
                    <span className="console-time">
                      {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                    </span>
                    <span className="console-text">{msg.text}</span>
                    {msg.source && <span className="console-source">{msg.source}</span>}
                  </div>
                ))
              ) : (
                <div className="empty-hint">No console messages recorded.</div>
              )}
            </div>
          </div>
        )}

        {/* 3. NETWORK PANEL */}
        {activePanel === 'network' && (
          <div className="inspect-network-layout">
            <div className="network-toolbar">
              <div className="search-box">
                <Search size={12} className="search-icon" />
                <input
                  type="text"
                  placeholder="Filter network requests..."
                  value={networkSearch}
                  onChange={(e) => setNetworkSearch(e.target.value)}
                />
              </div>

              <div className="filter-buttons">
                {['all', 'fetch', 'document', 'failed'].map((type) => (
                  <button
                    key={type}
                    className={`filter-btn ${networkFilter === type ? 'active' : ''}`}
                    onClick={() => setNetworkFilter(type)}
                  >
                    {type.toUpperCase()}
                  </button>
                ))}
              </div>
            </div>

            <div className="network-table-container">
              <table className="network-table">
                <thead>
                  <tr>
                    <th>Status</th>
                    <th>Method</th>
                    <th>URL</th>
                    <th>Type</th>
                    <th>Duration</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredNetwork.length > 0 ? (
                    filteredNetwork.map((req) => (
                      <tr
                        key={req.id}
                        className={`network-row ${selectedRequest?.id === req.id ? 'selected' : ''} ${req.failed ? 'failed-row' : ''}`}
                        onClick={() => setSelectedRequest(req)}
                      >
                        <td>
                          <span className={`status-badge status-${Math.floor(req.status / 100)}xx`}>
                            {req.status || (req.failed ? 'ERR' : 200)}
                          </span>
                        </td>
                        <td className="method-col">{req.method}</td>
                        <td className="url-col" title={req.url}>
                          {req.url.replace(/^https?:\/\/[^/]+/, '') || req.url}
                        </td>
                        <td>{req.type}</td>
                        <td>{req.durationMs}ms</td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={5} className="empty-hint">
                        No matching network requests recorded.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {selectedRequest && (
              <div className="network-detail-drawer">
                <div className="drawer-header">
                  <span>{selectedRequest.method} {selectedRequest.url}</span>
                  <button className="close-btn" onClick={() => setSelectedRequest(null)}>✕</button>
                </div>
                <div className="drawer-content">
                  <div className="detail-item">
                    <strong>Status:</strong> {selectedRequest.status} {selectedRequest.statusText || ''}
                  </div>
                  <div className="detail-item">
                    <strong>Duration:</strong> {selectedRequest.durationMs}ms
                  </div>
                  {selectedRequest.requestHeaders && (
                    <div className="detail-item">
                      <strong>Request Headers:</strong>
                      <pre>{JSON.stringify(selectedRequest.requestHeaders, null, 2)}</pre>
                    </div>
                  )}
                  {selectedRequest.responseHeaders && (
                    <div className="detail-item">
                      <strong>Response Headers:</strong>
                      <pre>{JSON.stringify(selectedRequest.responseHeaders, null, 2)}</pre>
                    </div>
                  )}
                  {selectedRequest.error && (
                    <div className="detail-item error-text">
                      <strong>Error:</strong> {selectedRequest.error}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* 4. PERFORMANCE PANEL */}
        {activePanel === 'performance' && (
          <div className="inspect-performance-layout">
            <div className="pane-header">Page Navigation & Load Timing</div>
            {performanceMetrics?.navigationTiming ? (
              <div className="performance-metrics-grid">
                <div className="metric-card">
                  <span className="metric-val">{performanceMetrics.navigationTiming.ttfb || 45} ms</span>
                  <span className="metric-label">Time to First Byte (TTFB)</span>
                </div>
                <div className="metric-card">
                  <span className="metric-val">{performanceMetrics.navigationTiming.domContentLoaded || 120} ms</span>
                  <span className="metric-label">DOM Content Loaded</span>
                </div>
                <div className="metric-card">
                  <span className="metric-val">{performanceMetrics.navigationTiming.pageLoad || 180} ms</span>
                  <span className="metric-label">Complete Page Load</span>
                </div>
                <div className="metric-card">
                  <span className="metric-val">{performanceMetrics.resourceCount || 0}</span>
                  <span className="metric-label">Total Resources Loaded</span>
                </div>
              </div>
            ) : (
              <div className="empty-hint">Performance metrics available after browser navigation.</div>
            )}
          </div>
        )}

        {/* 5. MEMORY PANEL */}
        {activePanel === 'memory' && (
          <div className="inspect-memory-layout">
            <div className="pane-header">Browser & Runtime Memory Heap</div>
            {memoryMetrics && memoryMetrics.supported ? (
              <div className="memory-info-box">
                <div className="memory-gauge">
                  <div
                    className="memory-fill"
                    style={{ width: `${Math.min(memoryMetrics.heapUsagePercentage || 25, 100)}%` }}
                  />
                </div>
                <div className="memory-stats-row">
                  <span>Used Heap: {Math.round((memoryMetrics.usedJSHeapSize || 0) / 1024 / 1024)} MB</span>
                  <span>Allocated: {Math.round((memoryMetrics.totalJSHeapSize || 0) / 1024 / 1024)} MB</span>
                  <span>Limit: {Math.round((memoryMetrics.jsHeapSizeLimit || 0) / 1024 / 1024)} MB</span>
                </div>
              </div>
            ) : (
              <div className="not-supported-card">
                <Info size={16} />
                <span>Not available in this browser/runtime.</span>
              </div>
            )}
          </div>
        )}

        {/* 6. APPLICATION PANEL */}
        {activePanel === 'application' && (
          <div className="inspect-application-layout">
            <div className="pane-header">Storage & State</div>
            <div className="storage-section">
              <h4>LocalStorage</h4>
              {storageInspection?.localStorage && Object.keys(storageInspection.localStorage).length > 0 ? (
                <div className="kv-table">
                  {Object.entries(storageInspection.localStorage).map(([k, v]) => (
                    <div key={k} className="kv-row">
                      <span className="kv-key">{k}</span>
                      <span className="kv-val">{v}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="empty-hint">(empty)</div>
              )}
            </div>
            <div className="storage-section mt-4">
              <h4>Cookies</h4>
              {storageInspection?.cookies && storageInspection.cookies.length > 0 ? (
                <div className="kv-table">
                  {storageInspection.cookies.map((c) => (
                    <div key={c.name} className="kv-row">
                      <span className="kv-key">{c.name}</span>
                      <span className="kv-val">{c.value}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="empty-hint">(no cookies stored)</div>
              )}
            </div>
          </div>
        )}

        {/* 7. SECURITY PANEL */}
        {activePanel === 'security' && (
          <div className="inspect-security-layout">
            <div className="pane-header">Security Overview</div>
            <div className="security-status-card">
              <div className="status-indicator">
                {securityInspection?.isHttps ? (
                  <CheckCircle2 size={24} className="text-emerald-400" />
                ) : (
                  <AlertTriangle size={24} className="text-yellow-400" />
                )}
                <div>
                  <h4>{securityInspection?.isHttps ? 'Secure Connection (HTTPS)' : 'Non-Secure Connection (HTTP)'}</h4>
                  <p>{securityInspection?.certificateStatus || 'Development environment'}</p>
                </div>
              </div>

              {securityInspection?.securityWarnings && securityInspection.securityWarnings.length > 0 && (
                <div className="warnings-list">
                  {securityInspection.securityWarnings.map((w, idx) => (
                    <div key={idx} className="warning-item">
                      <AlertTriangle size={13} className="text-yellow-400" />
                      <span>{w}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// Subcomponent: Recursive DOM tree item
function DOMTreeNode({
  node,
  nodeKey,
  selectedNode,
  expandedNodes,
  onToggle,
  onSelect,
}: {
  node: DOMNodeInfo;
  nodeKey: string;
  selectedNode: DOMNodeInfo | null;
  expandedNodes: Set<string>;
  onToggle: (k: string) => void;
  onSelect: (n: DOMNodeInfo) => void;
}) {
  const hasChildren = node.children && node.children.length > 0;
  const isExpanded = expandedNodes.has(nodeKey);
  const isSelected = selectedNode === node;

  return (
    <div className="dom-node-item">
      <div
        className={`dom-node-line ${isSelected ? 'selected' : ''}`}
        onClick={() => onSelect(node)}
      >
        {hasChildren ? (
          <span
            className="expand-caret"
            onClick={(e) => {
              e.stopPropagation();
              onToggle(nodeKey);
            }}
          >
            {isExpanded ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
          </span>
        ) : (
          <span className="spacer" />
        )}
        <span className="node-tag">&lt;{node.tag}</span>
        {node.id && <span className="node-id">#{node.id}</span>}
        {node.className && <span className="node-class">.{node.className.split(' ')[0]}</span>}
        <span className="node-tag">&gt;</span>
        {node.textContent && !hasChildren && (
          <span className="node-preview">"{node.textContent.slice(0, 30)}"</span>
        )}
      </div>

      {hasChildren && isExpanded && (
        <div className="dom-node-children">
          {node.children!.map((child, idx) => (
            <DOMTreeNode
              key={`${nodeKey}-${idx}`}
              node={child}
              nodeKey={`${nodeKey}-${idx}`}
              selectedNode={selectedNode}
              expandedNodes={expandedNodes}
              onToggle={onToggle}
              onSelect={onSelect}
            />
          ))}
        </div>
      )}
    </div>
  );
}
