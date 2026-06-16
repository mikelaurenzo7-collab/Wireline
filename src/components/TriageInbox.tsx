import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';

// Grok Certified - Unified design tokens
const tokens = {
  darkBase: '#0a0a0f',
  cyan: '#00F5FF',
  magenta: '#FF00AA',
  sharp: '4px',
};

interface TriageItem {
  id: string;
  type: 'call' | 'email';
  from: string;
  subject: string;
  preview: string;
  priority: 'high' | 'medium' | 'low';
  status: 'new' | 'in_progress' | 'needs_review';
}

export function TriageInbox() {
  const [items, setItems] = useState<TriageItem[]>([
    { id: '1', type: 'call', from: 'Acme Corp', subject: 'Follow-up on proposal', preview: 'They want to move forward but need pricing clarification...', priority: 'high', status: 'new' },
    { id: '2', type: 'email', from: 'Sarah Chen', subject: 'Contract review', preview: 'Can we schedule a quick call this week?', priority: 'high', status: 'new' },
    { id: '3', type: 'call', from: 'Delta Logistics', subject: 'Demo feedback', preview: 'Really liked the agent demo...', priority: 'medium', status: 'in_progress' },
  ]);

  const [selectedIndex, setSelectedIndex] = useState(0);
  const [selectedItems, setSelectedItems] = useState<string[]>([]);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'j' || e.key === 'ArrowDown') {
        setSelectedIndex(prev => Math.min(prev + 1, items.length - 1));
      }
      if (e.key === 'k' || e.key === 'ArrowUp') {
        setSelectedIndex(prev => Math.max(prev - 1, 0));
      }
      if (e.key.toLowerCase() === 'e') {
        // Escalate
        console.log('Escalate item', items[selectedIndex].id);
      }
      if (e.key.toLowerCase() === 'a') {
        // Assign to agent
        console.log('Assign to agent', items[selectedIndex].id);
      }
      if (e.key === ' ' || e.key === 'Enter') {
        toggleSelect(items[selectedIndex].id);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedIndex, items]);

  const toggleSelect = (id: string) => {
    setSelectedItems(prev => 
      prev.includes(id) 
        ? prev.filter(i => i !== id) 
        : [...prev, id]
    );
  };

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-white p-8">
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-4xl font-semibold tracking-tighter">Triage Inbox</h1>
            <p className="text-white/60 text-sm mt-1">j/k to navigate • Space to select • e = escalate • a = assign to agent</p>
          </div>
          
          {selectedItems.length > 0 && (
            <div className="flex gap-3">
              <button className="px-5 py-2 rounded-[4px] bg-[#00F5FF] text-black font-medium text-sm">
                Bulk Assign ({selectedItems.length})
              </button>
              <button className="px-5 py-2 rounded-[4px] border border-white/20 text-sm">
                Archive Selected
              </button>
            </div>
          )}
        </div>

        <div className="space-y-2">
          <AnimatePresence>
            {items.map((item, index) => {
              const isSelected = selectedIndex === index;
              const isChecked = selectedItems.includes(item.id);

              return (
                <motion.div
                  key={item.id}
                  onClick={() => setSelectedIndex(index)}
                  className={`group flex items-start gap-4 p-5 rounded-[8px] border cursor-pointer transition-all
                    ${isSelected 
                      ? 'border-[#00F5FF] bg-white/5' 
                      : 'border-white/10 hover:border-white/30 bg-black/40'}
                  `}
                  whileHover={{ scale: isSelected ? 1 : 1.005 }}
                >
                  <input
                    type="checkbox"
                    checked={isChecked}
                    onChange={() => toggleSelect(item.id)}
                    onClick={e => e.stopPropagation()}
                    className="mt-1.5 accent-[#00F5FF]"
                  />

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 mb-1.5">
                      <span className={`text-xs px-2.5 py-0.5 rounded-full ${item.type === 'call' ? 'bg-[#00F5FF] text-black' : 'bg-white/20 text-white'}`}>
                        {item.type.toUpperCase()}
                      </span>
                      <span className="font-medium">{item.from}</span>
                      <span className="text-white/40 text-sm">•</span>
                      <span className="text-white/70 text-sm truncate">{item.subject}</span>
                    </div>
                    <p className="text-white/60 text-sm line-clamp-2 pl-1">{item.preview}</p>
                  </div>

                  <div className="flex flex-col items-end gap-2 text-right">
                    <div className={`text-xs px-3 py-1 rounded-full whitespace-nowrap
                      ${item.priority === 'high' ? 'bg-red-500/20 text-red-400' : 'bg-white/10 text-white/70'}
                    `}>
                      {item.priority.toUpperCase()}
                    </div>
                    <div className="text-[10px] text-white/40">{item.status.replace('_', ' ')}</div>
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>

        <div className="mt-8 text-xs text-white/40">
          Keyboard shortcuts active • This is a high-fidelity shell ready for real data connection
        </div>
      </div>
    </div>
  );
}