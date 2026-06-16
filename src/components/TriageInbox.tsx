import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';

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
  status: 'new' | 'in_progress' | 'resolved';
}

// Main component
export function TriageInbox() {
  // ... (same implementation as before)
  const [items, setItems] = useState<TriageItem[]>([
    { id: '1', type: 'call', from: 'Acme Corp', subject: 'Follow-up on proposal', preview: 'They want to move forward but need pricing clarification...', priority: 'high', status: 'new' },
    { id: '2', type: 'email', from: 'Sarah Chen', subject: 'Contract review', preview: 'Can we schedule a quick call this week?', priority: 'high', status: 'new' },
    { id: '3', type: 'call', from: 'Delta Logistics', subject: 'Demo feedback', preview: 'Really liked the agent demo...', priority: 'medium', status: 'in_progress' },
  ]);

  const [selectedIndex, setSelectedIndex] = useState(0);
  const [selectedItems, setSelectedItems] = useState<string[]>([]);

  const updateItemStatus = (id: string, newStatus: TriageItem['status']) => {
    setItems(prev => prev.map(item => 
      item.id === id ? { ...item, status: newStatus } : item
    ));
  };

  const archiveItem = (id: string) => {
    setItems(prev => prev.filter(item => item.id !== id));
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const currentItem = items[selectedIndex];
      if (!currentItem) return;

      if (e.key === 'j' || e.key === 'ArrowDown') setSelectedIndex(prev => Math.min(prev + 1, items.length - 1));
      if (e.key === 'k' || e.key === 'ArrowUp') setSelectedIndex(prev => Math.max(prev - 1, 0));
      if (e.key.toLowerCase() === 'e') updateItemStatus(currentItem.id, 'in_progress');
      if (e.key.toLowerCase() === 'r') updateItemStatus(currentItem.id, 'resolved');
      if (e.key.toLowerCase() === 'x') archiveItem(currentItem.id);
      if (e.key === ' ' || e.key === 'Enter') {
        setSelectedItems(prev => prev.includes(currentItem.id) ? prev.filter(i => i !== currentItem.id) : [...prev, currentItem.id]);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedIndex, items]);

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-white p-8">
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-4xl font-semibold tracking-tighter">Triage Inbox</h1>
            <p className="text-white/60 text-sm mt-1">j/k ↓↑ • e = in progress • r = resolved • x = archive</p>
          </div>
        </div>

        <div className="space-y-2">
          {items.map((item, index) => (
            <div key={item.id} className="flex items-start gap-4 p-5 rounded-[8px] border border-white/10 bg-black/40">
              <div className="flex-1">
                <div className="flex items-center gap-3 mb-1">
                  <span className={`text-xs px-2.5 py-0.5 rounded-full ${item.type === 'call' ? 'bg-[#00F5FF] text-black' : 'bg-white/20'}`}>{item.type.toUpperCase()}</span>
                  <span className="font-medium">{item.from}</span>
                  <span className="text-white/50">•</span>
                  <span className="text-white/70 text-sm">{item.subject}</span>
                </div>
                <p className="text-white/60 text-sm line-clamp-2">{item.preview}</p>
              </div>
              <div className="text-right text-xs">
                <div className={item.priority === 'high' ? 'text-red-400' : 'text-white/60'}>{item.priority}</div>
                <div className="text-white/40 mt-1">{item.status}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// Alias export for existing imports in pages/CommandCenter.tsx
export const TriagePanel = TriageInbox;