import React, { useState, useEffect } from 'react';
import { FolderOpen, X, Folder, ArrowUp, Home, Monitor, Layers, Compass, Loader2 } from 'lucide-react';
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

interface Shortcut {
  label: string;
  path: string;
  icon?: string;
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
  const [shortcuts, setShortcuts] = useState<Shortcut[]>([]);
  const [isDocker, setIsDocker] = useState(false);

  useEffect(() => {
    if (suggestedName) {
      setProjectName(suggestedName);
    }
  }, [suggestedName]);

  // Load directories when modal opens
  useEffect(() => {
    if (isOpen) {
      loadDirectory('');
    }
  }, [isOpen]);

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
      setDirPath(res.data.current);
      setPathInput(res.data.current);
      if (Array.isArray(res.data.shortcuts)) {
        setShortcuts(res.data.shortcuts);
      }
      if (typeof res.data.isDocker === 'boolean') {
        setIsDocker(res.data.isDocker);
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
        // If opening project and no project name required, select immediately
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

  const handleSelectCurrent = () => {
    const target = dirPath.trim() || pathInput.trim() || currentBrowseDir;
    if (!target) {
      setError('Please select a directory.');
      return;
    }
    setError('');
    onSelect(target, showProjectName ? projectName.trim() : undefined);
  };

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

        {/* Docker Mode Banner or Native OS Chooser */}
        {isDocker ? (
          <div className="picker-docker-box">
            <div className="picker-docker-banner">
              <span className="picker-docker-badge">🐳 Local Machine Connected</span>
              <span className="picker-docker-text">
                Your computer's files are mapped to <code>/host</code> (Desktop, Documents, Projects). Use the quick jump buttons below or enter any path (e.g. <code>~/Desktop</code>).
              </span>
            </div>
          </div>
        ) : (
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

        {/* Quick Location Shortcuts */}
        <div className="picker-shortcuts">
          <span className="picker-shortcuts-label">Quick Jump:</span>
          {shortcuts.length > 0 ? (
            shortcuts.map((sc) => (
              <button
                key={sc.path}
                type="button"
                className={`picker-chip ${currentBrowseDir === sc.path ? 'picker-chip-active' : ''}`}
                onClick={() => loadDirectory(sc.path)}
                title={sc.path}
              >
                {sc.icon === 'home' && <Home size={12} />}
                {sc.icon === 'desktop' && <Monitor size={12} />}
                {sc.icon === 'projects' && <Layers size={12} />}
                {sc.icon === 'app' && <Folder size={12} />}
                {sc.label}
              </button>
            ))
          ) : (
            <>
              {homeDir && (
                <button
                  type="button"
                  className="picker-chip"
                  onClick={() => loadDirectory(homeDir)}
                  title="Home directory"
                >
                  <Home size={12} /> Home
                </button>
              )}
              <button
                type="button"
                className="picker-chip"
                onClick={() => loadDirectory('/app')}
                title="App repository"
              >
                <Folder size={12} /> /app
              </button>
            </>
          )}
        </div>

        {/* Visual Directory Browser */}
        <div className="picker-browser-card">
          <div className="picker-browser-path-bar">
            {parentBrowseDir && (
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
                  loadDirectory(pathInput);
                }
              }}
              placeholder={isDocker ? "e.g. /host, ~/Desktop, /projects, or /app" : "e.g. ~/Desktop/projects"}
              title="Type path and press Enter"
            />
            <button
              type="button"
              className="picker-go-btn"
              onClick={() => loadDirectory(pathInput)}
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
                    setPathInput(dir.path);
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
            {dirPath || currentBrowseDir}
            {isDocker && (dirPath || currentBrowseDir).startsWith('/host') && (
              <span className="picker-selected-alias"> (Host: ~{(dirPath || currentBrowseDir).slice(5)})</span>
            )}
          </span>
        </div>

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
