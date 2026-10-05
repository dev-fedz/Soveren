import React, { useState, useEffect } from 'react';
import { FolderOpen, X, Folder, ArrowUp, Compass, Loader2, ChevronDown, ChevronUp, Trash2 } from 'lucide-react';
import axios from 'axios';

const API = 'http://localhost:5001';

interface DirectoryPickerProps {
  isOpen: boolean;
  title: string;
  description: string;
  suggestedName?: string;
  showProjectName?: boolean;
  onSelect: (dirPath: string, projectName?: string) => void;
  onCancel: () => void;
}

interface BrowseDir {
  name: string;
  path: string;
}

interface RecentWorkspace {
  path: string;
  name: string;
  lastOpened?: number;
}

export function DirectoryPicker({
  isOpen,
  title,
  description,
  suggestedName,
  showProjectName,
  onSelect,
  onCancel,
}: DirectoryPickerProps) {
  const [dirPath, setDirPath] = useState('');
  const [pathInput, setPathInput] = useState('');
  const [projectName, setProjectName] = useState(suggestedName || '');
  const [error, setError] = useState('');
  const [loadingNative, setLoadingNative] = useState(false);
  const [loadingBrowse, setLoadingBrowse] = useState(false);

  // Visual browser state
  const [currentBrowseDir, setCurrentBrowseDir] = useState<string>('');
  const [parentBrowseDir, setParentBrowseDir] = useState<string | null>(null);
  const [homeDir, setHomeDir] = useState<string>('');
  const [directories, setDirectories] = useState<BrowseDir[]>([]);
  const [isDocker, setIsDocker] = useState(false);

  // Recent Workspaces history state (limited to 3 by default)
  const [recentWorkspaces, setRecentWorkspaces] = useState<RecentWorkspace[]>([]);
  const [showAllWorkspaces, setShowAllWorkspaces] = useState(false);

  useEffect(() => {
    if (suggestedName) {
      setProjectName(suggestedName);
    }
  }, [suggestedName]);

  // Load directories and workspace history when modal opens
  useEffect(() => {
    if (isOpen) {
      loadDirectory('');
      loadRecentWorkspaces();
    }
  }, [isOpen]);

  const formatDisplayPath = (p: string) => {
    if (!p) return '';
    if (p === '/host') return 'Local Machine';
    if (p.startsWith('/host/')) {
      return `~/${p.slice(6)}`;
    }
    return p;
  };

  const loadRecentWorkspaces = async () => {
    try {
      const res = await axios.get(`${API}/workspace/recent`);
      let list: RecentWorkspace[] = [];
      if (Array.isArray(res.data?.recent)) {
        list = res.data.recent.filter((w: RecentWorkspace) => w?.path && w.path !== '/app' && w.path !== '/');
      }

      // Check localStorage for any additional recent workspaces
      try {
        const local = localStorage.getItem('ai_native_recent_workspaces');
        if (local) {
          const parsed = JSON.parse(local);
          if (Array.isArray(parsed)) {
            for (const item of parsed) {
              if (item?.path && item.path !== '/app' && item.path !== '/' && !list.some((w) => w.path === item.path)) {
                list.push(item);
              }
            }
          }
        }
      } catch { /* ignore */ }

      // Check project chats for previously opened workspaces
      try {
        const savedChats = localStorage.getItem('ai_ide_project_chats');
        if (savedChats) {
          const parsedChats = JSON.parse(savedChats);
          for (const key of Object.keys(parsedChats)) {
            if (key.startsWith('proj:')) {
              const p = key.slice(5);
              if (p && p !== '/app' && p !== '/' && !list.some((w) => w.path === p)) {
                list.push({
                  path: p,
                  name: p.split('/').filter(Boolean).pop() || p,
                  lastOpened: Date.now(),
                });
              }
            }
          }
        }
      } catch { /* ignore */ }

      setRecentWorkspaces(list);
    } catch {
      // Backend request fallback to localStorage
    }
  };

  const handleDeleteWorkspace = async (targetPath: string) => {
    // 1. Immediately remove from state
    setRecentWorkspaces((prev) => prev.filter((w) => w.path !== targetPath));

    // 2. Clear selection if the deleted workspace was selected
    if (dirPath === targetPath) {
      setDirPath('');
      setPathInput('');
    }

    // 3. Remove from localStorage recent workspaces
    try {
      const local = localStorage.getItem('ai_native_recent_workspaces');
      if (local) {
        const parsed = JSON.parse(local);
        if (Array.isArray(parsed)) {
          const filtered = parsed.filter((item: any) => item?.path !== targetPath);
          localStorage.setItem('ai_native_recent_workspaces', JSON.stringify(filtered));
        }
      }
    } catch { /* ignore */ }

    // 4. Remove from localStorage project chats
    try {
      const savedChats = localStorage.getItem('ai_ide_project_chats');
      if (savedChats) {
        const parsedChats = JSON.parse(savedChats);
        delete parsedChats[`proj:${targetPath}`];
        localStorage.setItem('ai_ide_project_chats', JSON.stringify(parsedChats));
      }
    } catch { /* ignore */ }

    // 5. Delete on backend
    try {
      await axios.delete(`${API}/workspace/recent`, { data: { path: targetPath } });
    } catch { /* ignore */ }
  };

  const loadDirectory = async (dir: string) => {
    setLoadingBrowse(true);
    setError('');
    try {
      const url = dir ? `${API}/workspace/browse?dir=${encodeURIComponent(dir)}` : `${API}/workspace/browse`;
      const res = await axios.get(url);
      setCurrentBrowseDir(res.data.current);
      setParentBrowseDir(res.data.parent);
      setHomeDir(res.data.home);
      setDirectories(res.data.directories || []);
      const current = res.data.current || '';
      if (current === '/host' || !current) {
        setDirPath('');
        setPathInput('');
      } else {
        setDirPath(current);
        setPathInput(current.startsWith('/host/') ? `~/${current.slice(6)}` : current);
      }
      if (typeof res.data.isDocker === 'boolean') {
        setIsDocker(res.data.isDocker);
      }
      if (Array.isArray(res.data.recentWorkspaces) && res.data.recentWorkspaces.length > 0) {
        setRecentWorkspaces((prev) => {
          const combined = [...res.data.recentWorkspaces];
          for (const p of prev) {
            if (!combined.some((c) => c.path === p.path)) {
              combined.push(p);
            }
          }
          return combined;
        });
      }
    } catch (e: any) {
      setError(e.response?.data?.error || e.message || 'Failed to read directory');
    } finally {
      setLoadingBrowse(false);
    }
  };

  if (!isOpen) return null;

  // Open native OS directory chooser (Finder / Explorer)
  const handleNativePick = async () => {
    setLoadingNative(true);
    setError('');
    try {
      const res = await axios.post(`${API}/workspace/pick-native`, { prompt: title });
      if (res.data.isDocker) {
        setError(res.data.message || 'Native file dialog is not accessible in Docker. Please use the folder browser below.');
        return;
      }
      if (!res.data.cancelled && res.data.path) {
        setDirPath(res.data.path);
        setPathInput(res.data.path);
        if (!showProjectName) {
          onSelect(res.data.path);
        }
      }
    } catch (e: any) {
      setError(e.response?.data?.error || e.message || 'Failed to open system dialog');
    } finally {
      setLoadingNative(false);
    }
  };

  const handleNavigateInput = () => {
    const raw = pathInput.trim();
    if (!raw || raw === '~' || raw === '/host' || raw === 'host' || raw === 'host/') {
      loadDirectory('/host');
      setPathInput('');
      return;
    }
    if (raw.startsWith('~/')) {
      loadDirectory(`/host/${raw.slice(2)}`);
      return;
    }
    loadDirectory(raw);
  };

  const handleSelectCurrent = () => {
    let target = dirPath.trim() || pathInput.trim() || currentBrowseDir;
    if (target.startsWith('~/')) {
      target = `/host/${target.slice(2)}`;
    }
    if (!target || target === '/host') {
      setError('Please select a directory.');
      return;
    }
    setError('');
    onSelect(target, showProjectName ? projectName.trim() : undefined);
  };

  const displayedWorkspaces = showAllWorkspaces ? recentWorkspaces : recentWorkspaces.slice(0, 3);

  return (
    <div className="picker-overlay">
      <div className="picker-modal picker-modal-large">
        <div className="picker-header">
          <div className="picker-title">
            <FolderOpen size={18} />
            <span>{title}</span>
          </div>
          <button onClick={onCancel} className="picker-close" title="Close">
            <X size={18} />
          </button>
        </div>

        <p className="picker-description">{description}</p>

        {/* Native OS Chooser (when not running in Docker) */}
        {!isDocker && (
          <div className="picker-native-box">
            <button
              type="button"
              className="picker-native-btn"
              onClick={handleNativePick}
              disabled={loadingNative}
            >
              {loadingNative ? (
                <>
                  <Loader2 size={18} className="spin-icon" />
                  <span>Opening System Picker...</span>
                </>
              ) : (
                <>
                  <Compass size={18} />
                  <span>Browse from System Finder / File Manager</span>
                </>
              )}
            </button>
            <span className="picker-native-hint">
              Click above to select any folder on your machine via Finder, or choose from the folders below.
            </span>
          </div>
        )}



        {/* Visual Directory Browser */}
        <div className="picker-browser-card">
          <div className="picker-browser-path-bar">
            {parentBrowseDir && parentBrowseDir !== '/' && (
              <button
                type="button"
                className="picker-up-btn"
                onClick={() => loadDirectory(parentBrowseDir)}
                title="Go to parent directory"
              >
                <ArrowUp size={14} />
              </button>
            )}
            <input
              type="text"
              className="picker-browser-path-input"
              value={pathInput}
              onChange={(e) => {
                setPathInput(e.target.value);
                setDirPath(e.target.value);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  handleNavigateInput();
                }
              }}
              placeholder="Enter folder path (e.g. ~/Desktop/my-project)..."
              title="Type path and press Enter"
            />
            <button
              type="button"
              className="picker-go-btn"
              onClick={handleNavigateInput}
              title="Navigate to directory"
            >
              Go
            </button>
          </div>

          <div className="picker-folder-list">
            {loadingBrowse ? (
              <div className="picker-browser-loading">
                <Loader2 size={16} className="spin-icon" /> Loading directories...
              </div>
            ) : directories.length === 0 ? (
              <div className="picker-browser-empty">No subdirectories in this folder</div>
            ) : (
              directories.map((dir) => (
                <div
                  key={dir.path}
                  className={`picker-folder-row ${dirPath === dir.path ? 'picker-folder-selected' : ''}`}
                  onClick={() => {
                    setDirPath(dir.path);
                    setPathInput(dir.path.startsWith('/host/') ? `~/${dir.path.slice(6)}` : dir.path);
                  }}
                  onDoubleClick={() => {
                    loadDirectory(dir.path);
                  }}
                >
                  <Folder size={15} className="picker-folder-icon" />
                  <span className="picker-folder-name truncate">{dir.name}</span>
                  <button
                    type="button"
                    className="picker-enter-btn"
                    onClick={(e) => {
                      e.stopPropagation();
                      loadDirectory(dir.path);
                    }}
                    title="Open folder to view subfolders"
                  >
                    Open &rarr;
                  </button>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Selected Directory Summary */}
        <div className="picker-selected-summary">
          <span className="picker-selected-label">Selected Directory:</span>
          <span className="picker-selected-value truncate" title={dirPath || currentBrowseDir}>
            {dirPath && dirPath !== '/host' ? (
              formatDisplayPath(dirPath)
            ) : currentBrowseDir && currentBrowseDir !== '/host' ? (
              formatDisplayPath(currentBrowseDir)
            ) : (
              <span style={{ color: '#888888', fontStyle: 'italic' }}>None selected (choose a folder below)</span>
            )}
          </span>
        </div>

        {/* Workspaces History Section (previous opened projects, max 3 with Show More) */}
        {recentWorkspaces.length > 0 && (
          <div className="picker-workspaces-section">
            <div className="picker-workspaces-header">
              <span className="picker-workspaces-label">Workspaces:</span>
              <span className="picker-workspaces-subtitle">Previous opened projects</span>
            </div>
            <div className="picker-workspaces-list">
              {displayedWorkspaces.map((ws) => {
                const isSelected = dirPath === ws.path;
                return (
                  <div
                    key={ws.path}
                    className={`picker-workspace-item ${isSelected ? 'picker-workspace-item-selected' : ''}`}
                    onClick={() => {
                      setDirPath(ws.path);
                      setPathInput(ws.path.startsWith('/host/') ? `~/${ws.path.slice(6)}` : ws.path);
                      loadDirectory(ws.path);
                    }}
                    onDoubleClick={() => {
                      onSelect(ws.path, showProjectName ? projectName.trim() : undefined);
                    }}
                    title={ws.path}
                  >
                    <div className="picker-workspace-info">
                      <Folder size={14} className="picker-workspace-icon" />
                      <span className="picker-workspace-name">{ws.name}</span>
                      <span className="picker-workspace-path truncate">{formatDisplayPath(ws.path)}</span>
                    </div>
                    <div className="picker-workspace-actions">
                      <button
                        type="button"
                        className="picker-workspace-open-btn"
                        onClick={(e) => {
                          e.stopPropagation();
                          onSelect(ws.path, showProjectName ? projectName.trim() : undefined);
                        }}
                        title="Open this workspace"
                      >
                        Open &rarr;
                      </button>
                      <button
                        type="button"
                        className="picker-workspace-delete-btn"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteWorkspace(ws.path);
                        }}
                        title="Remove from history"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
            {recentWorkspaces.length > 3 && (
              <button
                type="button"
                className="picker-workspaces-toggle-btn"
                onClick={() => setShowAllWorkspaces(!showAllWorkspaces)}
              >
                {showAllWorkspaces ? (
                  <>
                    <ChevronUp size={13} />
                    <span>Show less</span>
                  </>
                ) : (
                  <>
                    <ChevronDown size={13} />
                    <span>Show more ({recentWorkspaces.length - 3} more)</span>
                  </>
                )}
              </button>
            )}
          </div>
        )}

        {/* Project Name Field (for New Projects) */}
        {showProjectName && (
          <div className="picker-field">
            <label className="picker-label">Project Name</label>
            <input
              className="picker-input"
              placeholder="my-project"
              value={projectName}
              onChange={(e) => setProjectName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSelectCurrent()}
            />
          </div>
        )}

        {error && <div className="picker-error">{error}</div>}

        <div className="picker-actions">
          <button type="button" onClick={onCancel} className="picker-btn-cancel">
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSelectCurrent}
            className="picker-btn-select"
          >
            {showProjectName ? 'Create in this Directory' : 'Select This Directory'}
          </button>
        </div>
      </div>
    </div>
  );
}
