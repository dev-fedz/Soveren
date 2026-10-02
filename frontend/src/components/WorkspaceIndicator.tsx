import React from 'react';
import { Folder, FolderOpen, ChevronDown, X } from 'lucide-react';

interface WorkspaceState {
  path: string | null;
  name: string | null;
  type: 'existing' | 'new' | null;
  initialized: boolean;
}

interface WorkspaceIndicatorProps {
  workspace: WorkspaceState;
  onOpenProject: () => void;
  onNewProject: () => void;
  onCloseProject: () => void;
}

export function WorkspaceIndicator({ workspace, onOpenProject, onNewProject, onCloseProject }: WorkspaceIndicatorProps) {
  const [menuOpen, setMenuOpen] = React.useState(false);

  if (!workspace.path) {
    return (
      <div className="workspace-indicator workspace-empty">
        <span className="workspace-label-text">No workspace</span>
        <div className="workspace-actions-inline">
          <button onClick={onOpenProject} className="workspace-action-btn" title="Open Project">
            <FolderOpen size={14} />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="workspace-indicator workspace-active">
      <Folder size={14} className="workspace-icon" />
      <span className="workspace-name" title={workspace.path}>{workspace.name}</span>
      <button
        className="workspace-dropdown-btn"
        onClick={() => setMenuOpen(!menuOpen)}
      >
        <ChevronDown size={14} />
      </button>

      {menuOpen && (
        <>
          <div className="workspace-menu-overlay" onClick={() => setMenuOpen(false)} />
          <div className="workspace-menu">
            <button onClick={() => { onOpenProject(); setMenuOpen(false); }} className="workspace-menu-item">
              <FolderOpen size={14} /> Change Project
            </button>
            <button onClick={() => { onNewProject(); setMenuOpen(false); }} className="workspace-menu-item">
              <Folder size={14} /> New Project
            </button>
            <div className="workspace-menu-divider" />
            <button onClick={() => { onCloseProject(); setMenuOpen(false); }} className="workspace-menu-item workspace-menu-item-danger">
              <X size={14} /> Close Project
            </button>
          </div>
        </>
      )}
    </div>
  );
}

export type { WorkspaceState };
