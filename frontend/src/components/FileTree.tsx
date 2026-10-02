import React, { useState } from 'react';
import { ChevronRight, ChevronDown, File, Folder } from 'lucide-react';

interface FileNode {
  name: string;
  path: string;
  type: 'file' | 'folder';
  children?: FileNode[];
}

interface FileTreeProps {
  node: FileNode;
  onFileClick: (path: string, name: string) => void;
}

export function FileTree({ node, onFileClick }: FileTreeProps) {
  const [isOpen, setIsOpen] = useState(false);

  if (node.type === 'file') {
    return (
      <div
        onClick={() => onFileClick(node.path, node.name)}
        className="flex items-center gap-2 py-1 px-2 hover:bg-gray-700 cursor-pointer text-gray-300 text-xs rounded transition-colors ml-4"
      >
        <File size={14} className="text-gray-500" />
        <span className="truncate">{node.name}</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      <div
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 py-1 px-2 hover:bg-gray-700 cursor-pointer text-gray-300 text-xs rounded transition-colors"
      >
        {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        <Folder size={14} className="text-blue-400" />
        <span className="font-medium truncate">{node.name}</span>
      </div>
      {isOpen && node.children && (
        <div className="flex flex-col">
          {node.children.map((child, index) => (
            <FileTree key={index} node={child} onFileClick={onFileClick} />
          ))}
        </div>
      )}
    </div>
  );
}
