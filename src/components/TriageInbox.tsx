import React, { useState, useMemo } from 'react';
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
    { id: '4', type: 'email', from: 'Vanguard Inc', subject: 'Q3 renewal discussion', preview: 'Looking to expand the partnership...', priority: 'low', status: 'resolved' },
  ]);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | TriageItem['status']>('all');
  const [priorityFilter, setPriorityFilter] = useState<'all' | TriageItem['priority']>('all');

  const selectedItem = items.find(i => i.id === selectedId);

  const filteredItems = useMemo(() => {
    return items.filter(item => {
      const matchesSearch = 
        item.from.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.subject.toLowerCase().includes(searchTerm.toLowerCase());
      
      const matchesStatus = statusFilter === 'all' || item.status === statusFilter;
      const matchesPriority = priorityFilter === 'all' || item.priority === priorityFilter;

      return matchesSearch && matchesStatus && matchesPriority;
    });
  }, [items, searchTerm, statusFilter, priorityFilter]);

  const updateStatus = (id: string, status: TriageItem['status']) => {
    setItems(prev => prev.map(item => item.id === id ? { ...item, status } : item));
  };

  const archiveItem = (id: string) => {
    setItems(prev => prev.filter(i => i.id !== id));
    if (selectedId === id) setSelectedId(null);
  };

  const assignToAgent = (id: string) => {
    alert('Assigned to best available agent! (Demo)');
    updateStatus(id, 'in_progress');
  };

  return (
    <div className="flex h-screen bg-[#0a0a0f] text-white">
      {/* Sidebar List */}
      <div className="w-2/5 border-r border-white/10 flex flex-col">
        <div className="p-6 border-b border-white/10">
          <div className="flex items-center justify-between mb-4">
            <h1 className="text-3xl font-semibold tracking-tighter">Triage</h1>
            <div className="text-xs px-3 py-1 rounded-full bg-white/10">{filteredItems.length} / {items.length}</div>
          </div>

          {/* Search */}
          <input
            type="text"
            placeholder="Search name or subject..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm placeholder:text-white/40 focus:outline-none focus:border-[#00F5FF] mb-3"
          />

          {/* Filters */}
          <div className="flex gap-2 text-xs">
            <select 
              value={statusFilter} 
              onChange={(e) => setStatusFilter(e.target.value as any)}
              className="bg-white/5 border border-white/10 rounded-lg px-3 py-1.5"
            >
              <option value="all">All Status</option>
              <option value="new">New</option>
              <option value="in_progress">In Progress</option>
              <option value="resolved">Resolved</option>
            </select>

            <select 
              value={priorityFilter} 
              onChange={(e) => setPriorityFilter(e.target.value as any)}
              className="bg-white/5 border border-white/10 rounded-lg px-3 py-1.5"
            >
              <option value="all">All Priority</option>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </select>
          </div>
        </div>

        <div className="flex-1 overflow-auto p-6 space-y-3">
          {filteredItems.length > 0 ? (
            filteredItems.map(item => (
              <div
                key={item.id}
                onClick={() => setSelectedId(item.id)}
                className={`p-4 rounded-2xl border cursor-pointer transition-all ${selectedId === item.id ? 'border-[#00F5FF] bg-white/5' : 'border-white/10 hover:border-white/30 bg-black/30'}`}
              >
                <div className="flex justify-between items-start">
                  <div>
                    <div className="font-medium flex items-center gap-2">
                      {item.from}
                      <span className={`text-[10px] px-2 py-0.5 rounded-full ${item.type === 'call' ? 'bg-[#00F5FF] text-black' : 'bg-white/20'}`}>{item.type}</span>
                    </div>
                    <div className="text-sm text-white/70 mt-0.5 line-clamp-1">{item.subject}</div>
                  </div>
                  <div className={`text-xs px-2.5 py-0.5 rounded-full self-start ${item.priority === 'high' ? 'bg-red-500/20 text-red-400' : 'bg-white/10'}`}>{item.priority}</div>
                </div>
              </div>
            ))
          ) : (
            <div className="text-center text-white/40 py-12">No items match your filters</div>
          )}
        </div>
      </div>

      {/* Detail Panel */}
      <div className="flex-1 p-8 overflow-auto">
        <AnimatePresence mode="wait">
          {selectedItem ? (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
              <div className="mb-8">
                <div className="text-sm text-white/50 tracking-[2px]">{selectedItem.type.toUpperCase()} • {selectedItem.from}</div>
                <h1 className="text-4xl font-semibold tracking-tighter mt-2 pr-10">{selectedItem.subject}</h1>
              </div>

              <div className="text-lg text-white/80 leading-relaxed mb-10">
                {selectedItem.preview}
              </div>

              {selectedItem.notes && (
                <div className="mb-8 p-5 bg-white/5 rounded-2xl border border-white/10">
                  <div className="text-xs tracking-widest text-white/50 mb-2">AGENT NOTES</div>
                  <div>{selectedItem.notes}</div>
                </div>
              )}

              <div className="flex flex-wrap gap-4">
                <button onClick={() => updateStatus(selectedItem.id, 'in_progress')} className="px-8 py-4 rounded-2xl bg-white/10 hover:bg-white/20 transition">Mark In Progress</button>
                <button onClick={() => assignToAgent(selectedItem.id)} className="px-8 py-4 rounded-2xl bg-[#00F5FF] text-black font-semibold">Assign to Best Agent</button>
                <button onClick={() => updateStatus(selectedItem.id, 'resolved')} className="px-8 py-4 rounded-2xl border border-white/20 hover:bg-white/5 transition">Mark Resolved</button>
                <button onClick={() => archiveItem(selectedItem.id)} className="px-8 py-4 rounded-2xl border border-red-500/30 text-red-400 hover:bg-red-500/10 transition ml-auto">Archive</button>
              </div>
            </motion.div>
          ) : (
            <div className="h-full flex items-center justify-center text-white/40 text-center">
              Select an item from the list
            </div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

export const TriagePanel = TriageInbox;