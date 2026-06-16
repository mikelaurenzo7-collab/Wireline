import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';

const tokens = {
  darkBase: '#0a0a0f',
  cyan: '#00F5FF',
  magenta: '#FF00AA',
};

interface TriageItem {
  id: string;
  type: 'call' | 'email';
  from: string;
  subject: string;
  preview: string;
  priority: 'high' | 'medium' | 'low';
  status: 'new' | 'in_progress' | 'resolved';
  notes?: string;
}

export function TriageInbox() {
  const [items, setItems] = useState<TriageItem[]>([
    { id: '1', type: 'call', from: 'Acme Corp', subject: 'Follow-up on proposal', preview: 'They want to move forward but need pricing clarification...', priority: 'high', status: 'new' },
    { id: '2', type: 'email', from: 'Sarah Chen', subject: 'Contract review', preview: 'Can we schedule a quick call this week?', priority: 'high', status: 'new' },
    { id: '3', type: 'call', from: 'Delta Logistics', subject: 'Demo feedback', preview: 'Really liked the agent demo...', priority: 'medium', status: 'in_progress', notes: 'Agent suggested pricing adjustment' },
  ]);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selectedItem = items.find(i => i.id === selectedId);

  const updateStatus = (id: string, status: TriageItem['status']) => {
    setItems(prev => prev.map(item => item.id === id ? { ...item, status } : item));
  };

  const archiveItem = (id: string) => {
    setItems(prev => prev.filter(i => i.id !== id));
    if (selectedId === id) setSelectedId(null);
  };

  return (
    <div className="flex h-screen bg-[#0a0a0f] text-white">
      {/* List */}
      <div className="w-2/5 border-r border-white/10 overflow-auto p-6">
        <div className="mb-6">
          <h1 className="text-3xl font-semibold tracking-tighter">Triage</h1>
          <p className="text-white/50 text-sm mt-1">Click or use keyboard to manage</p>
        </div>

        <div className="space-y-3">
          {items.map(item => (
            <div
              key={item.id}
              onClick={() => setSelectedId(item.id)}
              className={`p-4 rounded-xl border cursor-pointer transition ${selectedId === item.id ? 'border-[#00F5FF] bg-white/5' : 'border-white/10 hover:border-white/30 bg-black/30'}`}
            >
              <div className="flex justify-between items-start">
                <div>
                  <div className="font-medium flex items-center gap-2">
                    {item.from}
                    <span className={`text-[10px] px-2 py-0.5 rounded ${item.type === 'call' ? 'bg-[#00F5FF] text-black' : 'bg-white/20'}`}>{item.type}</span>
                  </div>
                  <div className="text-sm text-white/70 mt-0.5 line-clamp-1">{item.subject}</div>
                </div>
                <div className={`text-xs px-2 py-0.5 rounded ${item.priority === 'high' ? 'bg-red-500/20 text-red-400' : 'bg-white/10'}`}>{item.priority}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Detail Panel */}
      <div className="flex-1 p-8 overflow-auto">
        <AnimatePresence mode="wait">
          {selectedItem ? (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="max-w-2xl">
              <div className="flex justify-between items-start mb-6">
                <div>
                  <div className="text-sm text-white/50">{selectedItem.type.toUpperCase()} • {selectedItem.from}</div>
                  <h2 className="text-3xl font-semibold tracking-tight mt-1">{selectedItem.subject}</h2>
                </div>
                <div className={`px-4 py-1 text-sm rounded-full ${selectedItem.priority === 'high' ? 'bg-red-500/20 text-red-400' : 'bg-white/10'}`}>{selectedItem.priority} priority</div>
              </div>

              <div className="prose prose-invert text-white/80 mb-8">
                {selectedItem.preview}
              </div>

              {selectedItem.notes && (
                <div className="mb-8 p-4 bg-white/5 rounded-xl border border-white/10">
                  <div className="text-xs text-white/50 mb-1">AGENT NOTES</div>
                  <div>{selectedItem.notes}</div>
                </div>
              )}

              <div className="flex flex-wrap gap-3">
                <button onClick={() => updateStatus(selectedItem.id, 'in_progress')} className="px-6 py-3 rounded-xl bg-white/10 hover:bg-white/20 transition">Mark In Progress</button>
                <button onClick={() => updateStatus(selectedItem.id, 'resolved')} className="px-6 py-3 rounded-xl bg-[#00F5FF] text-black font-medium">Mark Resolved</button>
                <button onClick={() => archiveItem(selectedItem.id)} className="px-6 py-3 rounded-xl border border-white/20 hover:bg-white/5 transition text-red-400">Archive</button>
              </div>
            </motion.div>
          ) : (
            <div className="h-full flex items-center justify-center text-white/40">
              Select an item from the list to view details and take action
            </div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

export const TriagePanel = TriageInbox;