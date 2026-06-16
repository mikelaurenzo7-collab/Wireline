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
    { id: '3', type: 'call', from: 'Delta Logistics', subject: 'Demo feedback', preview: 'Really liked the agent demo...', priority: 'medium', status: 'in_progress', notes: 'Pricing adjustment suggested' },
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

  const assignToAgent = (id: string) => {
    // In real app this would open agent selector or call API
    alert('Assigned to best available agent! (Demo)');
    updateStatus(id, 'in_progress');
  };

  return (
    <div className="flex h-screen bg-[#0a0a0f] text-white">
      {/* List Panel */}
      <div className="w-2/5 border-r border-white/10 overflow-auto p-6">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-semibold tracking-tighter">Triage</h1>
            <p className="text-white/50 text-sm">Click item for details & actions</p>
          </div>
          <div className="text-xs px-3 py-1 rounded-full bg-white/10">{items.length} items</div>
        </div>

        <div className="space-y-3">
          {items.map(item => (
            <div
              key={item.id}
              onClick={() => setSelectedId(item.id)}
              className={`p-4 rounded-2xl border cursor-pointer transition-all ${selectedId === item.id ? 'border-[#00F5FF] bg-white/5' : 'border-white/10 hover:border-white/30 bg-black/30'}`}
            >
              <div className="flex justify-between">
                <div>
                  <div className="font-medium flex items-center gap-2">
                    {item.from}
                    <span className={`text-[10px] px-2 py-0.5 rounded-full ${item.type === 'call' ? 'bg-[#00F5FF] text-black' : 'bg-white/20 text-white'}`}>{item.type}</span>
                  </div>
                  <div className="text-sm text-white/70 mt-0.5 line-clamp-1">{item.subject}</div>
                </div>
                <div className={`text-xs self-start px-2.5 py-0.5 rounded-full ${item.priority === 'high' ? 'bg-red-500/20 text-red-400' : 'bg-white/10'}`}>{item.priority}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Detail + Action Panel */}
      <div className="flex-1 p-8 overflow-auto">
        <AnimatePresence mode="wait">
          {selectedItem ? (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="max-w-3xl">
              <div className="mb-8">
                <div className="text-sm text-white/50 tracking-widest">{selectedItem.type.toUpperCase()} FROM {selectedItem.from.toUpperCase()}</div>
                <h1 className="text-4xl font-semibold tracking-tighter mt-2 pr-12">{selectedItem.subject}</h1>
              </div>

              <div className="text-lg text-white/80 leading-relaxed mb-10">
                {selectedItem.preview}
              </div>

              {selectedItem.notes && (
                <div className="mb-8 p-5 bg-white/5 rounded-2xl border border-white/10">
                  <div className="uppercase text-xs tracking-[2px] text-white/50 mb-2">Agent Notes</div>
                  <div className="text-white/90">{selectedItem.notes}</div>
                </div>
              )}

              <div className="flex flex-wrap gap-4">
                <button 
                  onClick={() => updateStatus(selectedItem.id, 'in_progress')}
                  className="px-8 py-4 rounded-2xl bg-white/10 hover:bg-white/20 active:bg-white/30 transition font-medium"
                >
                  Mark In Progress
                </button>
                
                <button 
                  onClick={() => assignToAgent(selectedItem.id)}
                  className="px-8 py-4 rounded-2xl bg-[#00F5FF] text-black font-semibold flex items-center gap-2 active:opacity-90 transition"
                >
                  Assign to Best Agent
                </button>

                <button 
                  onClick={() => updateStatus(selectedItem.id, 'resolved')}
                  className="px-8 py-4 rounded-2xl border border-white/20 hover:bg-white/5 transition"
                >
                  Mark Resolved
                </button>

                <button 
                  onClick={() => archiveItem(selectedItem.id)}
                  className="px-8 py-4 rounded-2xl border border-red-500/30 text-red-400 hover:bg-red-500/10 transition ml-auto"
                >
                  Archive
                </button>
              </div>
            </motion.div>
          ) : (
            <div className="h-full flex flex-col items-center justify-center text-center text-white/40">
              <div className="text-6xl mb-4 opacity-30">←</div>
              <div>Select an item to view details and take action</div>
            </div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

export const TriagePanel = TriageInbox;