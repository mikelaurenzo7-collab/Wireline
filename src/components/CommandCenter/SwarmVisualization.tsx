import React from 'react';
import { motion } from 'motion/react';

interface AgentNode {
  id: string;
  x: number;
  y: number;
  status: 'idle' | 'on_call' | 'training';
}

interface SwarmVisualizationProps {
  agents?: AgentNode[];
}

// Default demo agents
export const defaultAgents: AgentNode[] = [
  { id: 'a1', x: 25, y: 30, status: 'idle' },
  { id: 'a2', x: 55, y: 25, status: 'on_call' },
  { id: 'a3', x: 75, y: 45, status: 'training' },
  { id: 'a4', x: 40, y: 65, status: 'idle' },
  { id: 'a5', x: 70, y: 70, status: 'on_call' },
];

export function SwarmVisualization({ agents = defaultAgents }: SwarmVisualizationProps) {
  return (
    <div className="relative w-full h-[280px] bg-[var(--wl-surface)] rounded-2xl border border-[var(--wl-border)] overflow-hidden">
      <svg className="absolute inset-0 w-full h-full" viewBox="0 0 100 100">
        {/* Connection lines */}
        {agents.map((agent, i) =>
          agents.slice(i + 1).map((other, j) => (
            <motion.line
              key={`${agent.id}-${other.id}`}
              x1={agent.x}
              y1={agent.y}
              x2={other.x}
              y2={other.y}
              stroke="var(--wl-cyan)"
              strokeOpacity={0.15}
              strokeWidth={0.6}
              initial={{ pathLength: 0 }}
              animate={{ pathLength: 1 }}
              transition={{ duration: 1.2, delay: (i + j) * 0.1 }}
            />
          ))
        )}

        {/* Agent nodes */}
        {agents.map((agent, index) => {
          const color =
            agent.status === 'on_call' ? 'var(--wl-cyan)' :
            agent.status === 'training' ? 'var(--wl-magenta)' : 'var(--wl-text-secondary)';

          return (
            <g key={agent.id}>
              <motion.circle
                cx={agent.x}
                cy={agent.y}
                r={3.5}
                fill={color}
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: 'spring', stiffness: 300, delay: index * 0.08 }}
              />
              <motion.circle
                cx={agent.x}
                cy={agent.y}
                r={6}
                fill="none"
                stroke={color}
                strokeOpacity={0.3}
                strokeWidth={1}
                animate={{ r: [6, 9, 6] }}
                transition={{ duration: 2.5, repeat: Infinity, delay: index * 0.4 }}
              />
            </g>
          );
        })}
      </svg>

      <div className="absolute bottom-4 right-4 text-[10px] text-[var(--wl-text-muted)] font-mono tracking-widest">
        LIVE FLEET
      </div>
    </div>
  );
}