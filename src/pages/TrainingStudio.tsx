import React, { useState } from 'react';
import { motion } from 'motion/react';

export function TrainingStudio() {
  const [activeTab, setActiveTab] = useState<'prompt' | 'voice' | 'test'>('prompt');
  const [prompt, setPrompt] = useState('You are a highly professional sales development representative...');

  return (
    <div className="max-w-7xl mx-auto">
      <div className="mb-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-4xl font-semibold tracking-tighter">Training Studio</h1>
            <p className="text-[var(--wl-text-secondary)] mt-1">Craft, train, and test your agents with precision.</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="rounded-full bg-[var(--wl-surface-2)] px-4 py-1.5 text-sm font-mono text-[var(--wl-text-muted)]">
              Agent: SDR-Alpha
            </div>
            <button className="btn btn-primary px-6 py-2.5 text-sm">
              Deploy to Fleet
            </button>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-[var(--wl-border)] mb-8">
        {[
          { id: 'prompt', label: 'System Prompt' },
          { id: 'voice', label: 'Voice & Tone' },
          { id: 'test', label: 'Test & Simulate' },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            className={`tab px-8 ${activeTab === tab.id ? 'active' : ''}`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Main Editor */}
        <div className="lg:col-span-7">
          {activeTab === 'prompt' && (
            <div className="card p-8">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <div className="font-semibold">System Prompt</div>
                  <div className="text-sm text-[var(--wl-text-muted)]">Core instructions for this agent</div>
                </div>
                <div className="text-xs px-3 py-1 rounded-full bg-[var(--wl-cyan)]/10 text-[var(--wl-cyan)]">
                  1,284 tokens
                </div>
              </div>

              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                className="input w-full h-80 font-mono text-sm resize-y p-6 leading-relaxed"
              />

              <div className="mt-4 flex justify-end">
                <button className="btn btn-secondary px-5 py-2 text-sm">Save Version</button>
              </div>
            </div>
          )}

          {activeTab === 'voice' && (
            <div className="card p-8">
              <div className="mb-6">
                <div className="font-semibold mb-1">Voice Profile</div>
                <div className="text-sm text-[var(--wl-text-muted)]">Define how this agent sounds and communicates</div>
              </div>

              <div className="space-y-6">
                <div>
                  <label className="text-sm text-[var(--wl-text-secondary)] block mb-2">Tone</label>
                  <div className="flex gap-2 flex-wrap">
                    {['Professional', 'Friendly', 'Direct', 'Consultative', 'Witty'].map(tone => (
                      <button key={tone} className="btn btn-ghost px-4 py-1.5 text-sm rounded-full border">
                        {tone}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="text-sm text-[var(--wl-text-secondary)] block mb-2">Speaking Pace</label>
                  <input type="range" className="w-full accent-[var(--wl-cyan)]" defaultValue={65} />
                  <div className="flex justify-between text-xs text-[var(--wl-text-muted)] mt-1">
                    <div>Slower</div>
                    <div>Faster</div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'test' && (
            <div className="card p-8">
              <div className="mb-4 font-semibold">Test Conversation</div>
              <div className="bg-[var(--wl-bg-elevated)] rounded-xl p-6 min-h-[280px] font-mono text-sm border border-[var(--wl-border)]">
                <div className="text-[var(--wl-text-secondary)] mb-4">[You] How does your pricing work for teams?</div>
                <div className="text-[var(--wl-cyan)]">[Agent] Great question. Our team plan starts at $99/user/month...</div>
              </div>

              <div className="mt-4 flex gap-3">
                <input 
                  type="text" 
                  placeholder="Type a message to test..." 
                  className="input flex-1" 
                />
                <button className="btn btn-primary px-6">Send</button>
              </div>
            </div>
          )}
        </div>

        {/* Sidebar - Context & Controls */}
        <div className="lg:col-span-5 space-y-6">
          <div className="card p-6">
            <div className="font-semibold mb-4">Agent Stats</div>
            <div className="space-y-4 text-sm">
              <div className="flex justify-between">
                <span className="text-[var(--wl-text-secondary)]">Training sessions</span>
                <span className="font-mono">47</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[var(--wl-text-secondary)]">Avg. performance</span>
                <span className="font-mono text-[var(--wl-success)]">94%</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[var(--wl-text-secondary)]">Last trained</span>
                <span>2 hours ago</span>
              </div>
            </div>
          </div>

          <div className="card p-6">
            <div className="font-semibold mb-3">Version History</div>
            <div className="text-sm space-y-2 text-[var(--wl-text-secondary)]">
              <div>v12 • "More consultative tone" • Just now</div>
              <div>v11 • "Added objection handling" • Yesterday</div>
              <div>v10 • "Initial training" • 3 days ago</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}