import React, { useState } from 'react';
import { motion } from 'motion/react';
import { useNavigate } from 'react-router-dom';

// Grok Certified - Unified robofuturistic design
// Matches iOS DesignTokens and Android WirelineTheme
const tokens = {
  darkBase: '#0a0a0f',
  cyan: '#00F5FF',
  magenta: '#FF00AA',
  glass: 'rgba(255,255,255,0.05)',
  sharp: '4px',
};

export function CommandCenter() {
  const navigate = useNavigate();
  const [fleet, setFleet] = useState({
    activeAgents: 12,
    liveCalls: 3,
    todayAppointments: 47,
    goalProgress: 78,
  });

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-white p-8">
      {/* Horizontal Top Bar */}
      <div className="flex items-center justify-between mb-8 border-b border-white/10 pb-4">
        <div className="flex items-center gap-4">
          <div className="text-2xl font-semibold tracking-tighter">Wireline</div>
          <div className="text-sm text-white/50">Command Center</div>
        </div>

        <div className="flex items-center gap-3">
          <button 
            onClick={() => navigate('/triage')}
            className="px-5 py-2 rounded-[4px] bg-white text-black font-medium text-sm hover:bg-white/90 transition flex items-center gap-2"
          >
            Open Triage
          </button>
          <button 
            onClick={() => navigate('/agents')}
            className="px-5 py-2 rounded-[4px] border border-white/20 hover:bg-white/5 transition text-sm"
          >
            Manage Fleet
          </button>
        </div>
      </div>

      <div className="max-w-7xl mx-auto">
        <div className="mb-8">
          <h1 className="text-5xl font-semibold tracking-tighter mb-2">Good morning, Michael.</h1>
          <p className="text-white/60">Your fleet is operating at high velocity.</p>
        </div>

        {/* Live Metrics */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-10">
          {[
            { label: 'ACTIVE AGENTS', value: fleet.activeAgents, color: tokens.cyan },
            { label: 'LIVE CALLS', value: fleet.liveCalls, color: tokens.magenta },
            { label: "TODAY'S APPOINTMENTS", value: fleet.todayAppointments, color: '#22c55e' },
            { label: 'GOAL PROGRESS', value: `${fleet.goalProgress}%`, color: tokens.cyan },
          ].map((metric, index) => (
            <div 
              key={index}
              className="rounded-[8px] border border-white/10 p-6 bg-black/40 backdrop-blur"
              style={{ borderRadius: tokens.sharp }}
            >
              <div className="text-xs tracking-[2px] text-white/50 mb-3">{metric.label}</div>
              <div className="text-6xl font-mono tabular-nums tracking-tighter" style={{ color: metric.color }}>
                {metric.value}
              </div>
            </div>
          ))}
        </div>

        {/* Quick Actions + Agent Overview */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Quick Actions */}
          <div className="lg:col-span-1 rounded-[8px] border border-white/10 p-6 bg-black/40">
            <div className="text-sm text-white/60 mb-4 tracking-wider">QUICK ACTIONS</div>
            <div className="space-y-3">
              {[
                { label: 'Start New Training Session', action: () => navigate('/train') },
                { label: 'Review Today\'s Calls', action: () => navigate('/logs') },
                { label: 'Ask Wireline', action: () => {} },
              ].map((item, i) => (
                <button
                  key={i}
                  onClick={item.action}
                  className="w-full text-left px-5 py-4 rounded-[4px] border border-white/10 hover:border-white/30 hover:bg-white/5 transition flex justify-between items-center group"
                >
                  <span>{item.label}</span>
                  <span className="text-white/40 group-hover:text-white/70 transition">→</span>
                </button>
              ))}
            </div>
          </div>

          {/* Agent Status Overview */}
          <div className="lg:col-span-2 rounded-[8px] border border-white/10 p-6 bg-black/40">
            <div className="flex justify-between items-center mb-5">
              <div className="text-sm text-white/60 tracking-wider">AGENT STATUS</div>
              <button 
                onClick={() => navigate('/agents')}
                className="text-xs text-[#00F5FF] hover:underline"
              >
                View All →
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {[1,2,3,4].map((i) => (
                <div key={i} className="flex items-center justify-between p-4 rounded-[4px] bg-white/5 border border-white/10">
                  <div>
                    <div className="font-medium">Agent {i}</div>
                    <div className="text-xs text-white/50">Last active 2m ago</div>
                  </div>
                  <div className={`px-3 py-1 text-xs rounded-full ${i % 2 === 0 ? 'bg-[#00F5FF] text-black' : 'bg-white/10 text-white'}`}>
                    {i % 2 === 0 ? 'ON CALL' : 'IDLE'}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}