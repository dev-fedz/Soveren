import React, { useState, useEffect } from 'react';
import {
  ChevronRight,
  ChevronDown,
  File,
  Folder,
  FolderOpen,
  RefreshCw,
  AlertCircle,
  FolderTree,
  FileCode,
  FileImage,
  FileText,
} from 'lucide-react';

// --- Types ---
interface FileNode {
  name: string;
  path: string;
  type: 'file' | 'folder';
  children?: FileNode[];
}

type ExplorerStatus = 'no_workspace' | 'loading' | 'loaded' | 'error';

interface ExplorerProps {
  status: ExplorerStatus;
  projectStructure: FileNode | null;
  workspaceName: string | null;
  error: string | null;
  activeFilePath?: string | null;
  fileBadges?: Record<string, 'Created' | 'Modified' | 'Deleted'>;
  onFileClick: (path: string, name: string) => void;
  onRetry: () => void;
  onOpenProject: () => void;
  onNewProject: () => void;
}

function sortFileNodes(nodes?: FileNode[]): FileNode[] {
  if (!nodes || !nodes.length) return [];
  return [...nodes].sort((a, b) => {
    if (a.type === 'folder' && b.type !== 'folder') return -1;
    if (a.type !== 'folder' && b.type === 'folder') return 1;
    return a.name.localeCompare(b.name, undefined, { sensitivity: 'base', numeric: true });
  });
}

export function getFileIcon(fileName: string) {
  const ext = fileName.split('.').pop()?.toLowerCase();
  if (['png', 'jpg', 'jpeg', 'svg', 'gif', 'webp', 'bmp'].includes(ext || '')) {
    return <FileImage size={14} className="text-amber-400" />;
  }
  if (['pdf', 'docx', 'doc', 'xlsx', 'csv', 'md', 'txt'].includes(ext || '')) {
    return <FileText size={14} className="text-indigo-400" />;
  }
  return <FileCode size={14} className="tree-icon-file" />;
}

// --- FileTree Node ---
function FileTreeNode({
  node,
  activeFilePath,
  fileBadges = {},
  onFileClick,
}: {
  node: FileNode;
  activeFilePath?: string | null;
  fileBadges?: Record<string, 'Created' | 'Modified' | 'Deleted'>;
  onFileClick: (path: string, name: string) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const isHidden = node.name.startsWith('.');

  // Auto-expand folder if active file is inside
  useEffect(() => {
    if (activeFilePath && node.type === 'folder') {
      const normActive = activeFilePath.replace(/\\/g, '/');
      const normNode = node.path.replace(/\\/g, '/');
      if (normActive.startsWith(normNode + '/') || normActive === normNode) {
        setIsOpen(true);
      }
    }
  }, [activeFilePath, node.path, node.type]);

  const isSelected = activeFilePath && (
    node.path === activeFilePath ||
    node.path.endsWith('/' + activeFilePath) ||
    activeFilePath.endsWith('/' + node.path)
  );

  const badge = fileBadges[node.path] || fileBadges[node.name];

  if (node.type === 'file') {
    return (
      <div
        onClick={() => onFileClick(node.path, node.name)}
        className={`tree-file ${isHidden ? 'tree-file-hidden' : ''} ${isSelected ? 'tree-file-active' : ''}`}
        title={node.path}
      >
        {getFileIcon(node.name)}
        <span className="truncate flex-1">{node.name}</span>
        {badge && (
          <span className={`file-badge badge-${badge.toLowerCase()}`}>
            {badge}
          </span>
        )}
      </div>
    );
  }

  const sortedChildren = sortFileNodes(node.children);

  return (
    <div className={`tree-folder ${isHidden ? 'tree-folder-hidden' : ''}`}>
      <div onClick={() => setIsOpen(!isOpen)} className="tree-folder-label" title={node.path}>
        {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        {isOpen ? (
          <FolderOpen size={14} className="tree-icon-folder" />
        ) : (
          <Folder size={14} className="tree-icon-folder" />
        )}
        <span className="font-medium truncate">{node.name}</span>
      </div>
      {isOpen && sortedChildren.length > 0 && (
        <div className="tree-children">
          {sortedChildren.map((child, index) => (
            <FileTreeNode
              key={child.path || index}
              node={child}
              activeFilePath={activeFilePath}
              fileBadges={fileBadges}
              onFileClick={onFileClick}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// --- Explorer Component ---
export function Explorer({
  status,
  projectStructure,
  workspaceName,
  error,
  activeFilePath,
  fileBadges = {},
  onFileClick,
  onRetry,
  onOpenProject,
  onNewProject,
}: ExplorerProps) {
  return (
    <div className="explorer">
      <div className="explorer-header">
        <FolderTree size={12} />
        <span>EXPLORER</span>
        {status === 'loaded' && (
          <button onClick={onRetry} className="explorer-refresh-btn" title="Refresh">
            <RefreshCw size={12} />
          </button>
        )}
      </div>

      <div className="explorer-content">
        {status === 'no_workspace' && (
          <div className="explorer-empty">
            <FolderTree size={24} className="explorer-empty-icon" />
            <p className="explorer-empty-title">No workspace selected</p>
            <p className="explorer-empty-hint">Open a project or create a new one to get started.</p>
            <div className="explorer-empty-actions">
              <button onClick={onOpenProject} className="explorer-btn">Open Project</button>
              <button onClick={onNewProject} className="explorer-btn explorer-btn-secondary">New Project</button>
            </div>
          </div>
        )}

        {status === 'loading' && (
          <div className="explorer-loading">
            <div className="explorer-spinner" />
            <span>Loading files...</span>
          </div>
        )}

        {status === 'loaded' && projectStructure && (
          <div className="explorer-tree">
            {workspaceName && (
              <div className="explorer-workspace-label">
                <Folder size={14} className="tree-icon-folder" />
                <span className="font-bold">{workspaceName}</span>
              </div>
            )}
            {sortFileNodes(projectStructure.children).map((child, index) => (
              <FileTreeNode
                key={child.path || index}
                node={child}
                activeFilePath={activeFilePath}
                fileBadges={fileBadges}
                onFileClick={onFileClick}
              />
            ))}
          </div>
        )}

        {status === 'error' && (
          <div className="explorer-error">
            <AlertCircle size={20} className="explorer-error-icon" />
            <p className="explorer-error-text">Unable to load workspace.</p>
            {error && <p className="explorer-error-detail">{error}</p>}
            <button onClick={onRetry} className="explorer-btn">Retry</button>
          </div>
        )}
      </div>
    </div>
  );
}

export type { FileNode, ExplorerStatus };
