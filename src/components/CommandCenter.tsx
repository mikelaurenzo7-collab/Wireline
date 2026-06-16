import React from 'react';
import { motion } from 'motion/react';
import { SwarmVisualization } from './CommandCenter/SwarmVisualization';
import { useTheme } from '../lib/theme';
import { staggerContainer, staggerItem, cardHover, statusChange } from '../lib/animations';

export function CommandCenter() {
  const { resolvedTheme } = useTheme();

  const metrics = [
    { label: 'ACTIVE AGENTS', value: '12', color: 'var(--wl-cyan)' },
    { label: 'LIVE CALLS', value: '3', color: 'var(--wl-magenta)' },
    { label: "TODAY'S APPOINTMENTS", value: '47', color: 'var(--wl-success)' },
    { label: 'GOAL PROGRESS', value: '78%', color: 'var(--wl-cyan)' },
  ];

  const agents = [
    { id: 'a1', name: 'Agent Alpha', status: 'idle', lastActive: '2m ago' },
    { id: 'a2', name: 'Agent Beta', status: 'on_call', lastActive: 'Now' },
    { id: 'a3', name: 'Agent Gamma', status: 'training', lastActive: '14m ago' },
    { id: 'a4', name: 'Agent Delta', status: 'idle', lastActive: '1h ago' },
  ];

  return (
    <div className="max-w-7xl mx-auto">
      <div className="mb-8">
        <h1 className="text-5xl font-semibold tracking-tighter">Command Center</h1>
        <p className="text-[var(--wl-text-secondary)] mt-2">Your fleet at a glance. Real-time. Always in control.</p>
      </div>

      {/* Live Metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-10">
        {metrics.map((metric, index) => (
          <motion.div
            key={index}
            className="card p-6"
            variants={staggerItem}
            initial="hidden"
            animate="visible"
            custom={index}
          >
            <div className="text-xs tracking-[2px] text-[var(--wl-text-muted)] mb-2">{metric.label}</div>
            <div 
              className="text-6xl font-mono tabular-nums tracking-tighter"
              style={{ color: metric.color }}
            >
              {metric.value}
            </div>
          </motion.div>
        ))}
      </div>

      {/* Swarm Visualization */}
      <div className="mb-10">
        <div className="flex items-center justify-between mb-4">
          <div>
            <div className="font-semibold text-lg">Live Fleet Swarm</div>
            <div className="text-sm text-[var(--wl-text-muted)]">Real-time agent connections and status</div>
          </div>
          <div className="text-xs px-3 py-1 rounded-full bg-[var(--wl-surface-2)] text-[var(--wl-text-muted)]">
            LIVE
          </div>
        </div>
        <SwarmVisualization />
      </div>

      {/* Agent Status Grid */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <div className="font-semibold text-lg">Agent Status</div>
          <button className="text-sm text-[var(--wl-cyan)] hover:underline">View All Agents →</button>
        </div>

        <motion.div 
          className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4"
          variants={staggerContainer}
          initial="hidden"
          animate="visible"
        >
          {agents.map((agent, index) => {
            const statusColor = 
              agent.status === 'on_call' ? 'var(--wl-cyan)' : 
              agent.status === 'training' ? 'var(--wl-magenta)' : 'var(--wl-text-secondary)';

            return (
              <motion.div 
                key={agent.id} 
                className="card p-5 cursor-pointer"
                variants={staggerItem}
                whileHover={{ y: -2 }}
                whileTap={{ scale: 0.985 }}
              >
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <div className="font-semibold text-lg">{agent.name}</div>
                    <div className="text-sm text-[var(--wl-text-muted)]">{agent.lastActive}</div>
                  </div>
                  <div 
                    className="status"
                    style={{ 
                      backgroundColor: `${statusColor}20`, 
                      color: statusColor 
                    }}
                  >
                    {agent.status.replace('_', ' ')}
                  </div>
                </div>
                <div className="text-xs text-[var(--wl-text-muted)]">Click to manage</div>
              </motion.div>
            );
          })}
        </motion.div>
      </div>
    </div>
  );
}