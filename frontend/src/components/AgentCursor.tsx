import React from 'react';

export interface AgentCursorState {
  x: number;
  y: number;
  visible: boolean;
  isClicking: boolean;
  label: string;
}

export interface AgentCursorProps {
  cursorState: AgentCursorState;
}

export const AgentCursor: React.FC<AgentCursorProps> = ({ cursorState }) => {
  const { x, y, visible, isClicking, label } = cursorState;

  if (!visible) return null;

  return (
    <div
      className="agent-virtual-cursor"
      style={{
        transform: `translate3d(${x}px, ${y}px, 0)`,
      }}
    >
      {/* Click Ripple Wave Animation */}
      {isClicking && <div className="agent-cursor-ripple" />}

      {/* SVG Modern Agent Cursor Pointer */}
      <svg
        className="agent-cursor-icon"
        width="22"
        height="22"
        viewBox="0 0 24 24"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path
          d="M5.5 3.5L19 12L12 14L9 20.5L5.5 3.5Z"
          fill="#2563eb"
          stroke="#ffffff"
          strokeWidth="1.5"
          strokeLinejoin="round"
        />
      </svg>

      {/* Agent Status Badge */}
      <div className="agent-cursor-badge">
        <span className="agent-cursor-dot" />
        <span className="agent-cursor-text">{label || 'AI Agent'}</span>
      </div>
    </div>
  );
};
