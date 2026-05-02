import { useState, useEffect, useCallback, KeyboardEvent as ReactKeyboardEvent } from "react";
import { Search, Bot, PhoneCall, Mail, Zap, Terminal, X, ChevronRight, Hash, Inbox, BarChart3, Calendar, MessageSquare, PhoneOutgoing, History, ServerCog, PlugZap, Sparkles, Activity } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "motion/react";
import { cn } from "../lib/utils";

interface CommandItem {
  id: string;
  label: string;
  description: string;
  icon: any;
  action: () => void;
  category: string;
}

export default function CommandBar() {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const navigate = useNavigate();

  const commands: CommandItem[] = [
    // ── Navigation ─────────────────────────────────────────
    { id: 'dash',         label: 'Command Atlas',     description: 'Real-time dashboard + Daily Brief',     icon: Activity,       category: 'Navigation', action: () => navigate('/') },
    { id: 'triage',       label: 'Triage Inbox',      description: 'Hot leads, compliance, knowledge gaps', icon: Inbox,          category: 'Navigation', action: () => navigate('/triage') },
    { id: 'insights',     label: 'Insights',          description: 'Funnel, topics, heatmap, leaderboard',  icon: BarChart3,      category: 'Navigation', action: () => navigate('/insights') },
    { id: 'appointments', label: 'Constellation',     description: 'Booked appointments',                   icon: Calendar,       category: 'Navigation', action: () => navigate('/appointments') },
    { id: 'logs',         label: 'Voice Archive',     description: 'Call records + transcripts',            icon: History,        category: 'Navigation', action: () => navigate('/logs') },
    { id: 'inbox',        label: 'Email Inbox',       description: 'Inbound omnichannel email threads',     icon: Mail,           category: 'Navigation', action: () => navigate('/inbox') },
    { id: 'outbound',     label: 'Outbound Dialer',   description: 'Single + bulk lead dispatch',           icon: PhoneOutgoing,  category: 'Navigation', action: () => navigate('/outbound') },
    { id: 'train',        label: 'Neural Atelier',    description: 'Train + tune agents',                   icon: MessageSquare,  category: 'Navigation', action: () => navigate('/train') },
    { id: 'agents',       label: 'Agent Topology',    description: 'Configure autonomous agents',           icon: Bot,            category: 'Navigation', action: () => navigate('/agents') },
    { id: 'integrations', label: 'Carrier Bridge',    description: 'Phone numbers + integrations',          icon: PlugZap,        category: 'Navigation', action: () => navigate('/integrations') },
    { id: 'admin',        label: 'Core Settings',     description: 'Account + system core',                 icon: ServerCog,      category: 'Navigation', action: () => navigate('/admin') },

    // ── Actions ────────────────────────────────────────────
    { id: 'forge-agent',  label: 'Forge Agent with Claude',     description: 'Synthesize a complete agent from a goal',  icon: Sparkles,  category: 'Actions', action: () => navigate('/agents') },
    { id: 'test-call',    label: 'Initiate Test Relay',         description: 'Talk to your agent right now',             icon: PhoneCall, category: 'Actions', action: () => navigate('/') },
    { id: 'review-agent', label: 'Run Performance Review',      description: 'Deep audit of an agent\'s last N calls',   icon: BarChart3, category: 'Actions', action: () => navigate('/train') },
    { id: 'ingest-url',   label: 'Ingest Knowledge from URL',   description: 'Claude reads a site and extracts facts',   icon: Zap,       category: 'Actions', action: () => navigate('/train') },
  ];

  const filteredCommands = commands.filter(c => 
    c.label.toLowerCase().includes(query.toLowerCase()) || 
    c.description.toLowerCase().includes(query.toLowerCase()) ||
    c.category.toLowerCase().includes(query.toLowerCase())
  );

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setIsOpen(prev => !prev);
      }
      if (e.key === 'Escape') setIsOpen(false);
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleAction = useCallback((cmd: CommandItem) => {
    cmd.action();
    setIsOpen(false);
    setQuery("");
  }, []);

  useEffect(() => {
    if (isOpen) setSelectedIndex(0);
  }, [isOpen, query]);

  const onKeyDown = (e: ReactKeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex(prev => (prev + 1) % Math.max(1, filteredCommands.length));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(prev => (prev - 1 + filteredCommands.length) % Math.max(1, filteredCommands.length));
    } else if (e.key === 'Enter' && filteredCommands[selectedIndex]) {
      handleAction(filteredCommands[selectedIndex]);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[9999] flex items-start justify-center pt-[15vh] px-4">
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setIsOpen(false)}
          />
          
          <motion.div
            initial={{ scale: 0.95, opacity: 0, y: -20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.95, opacity: 0, y: -20 }}
            className="relative w-full max-w-2xl bg-white brutal-border overflow-hidden"
          >
            <div className="p-6 border-b-4 border-ink flex items-center gap-4 bg-zinc-50">
              <Search className="w-6 h-6 text-slate-400" />
              <input 
                autoFocus
                placeholder="EXECUTE COMMAND... (e.g. Dashboard, Search Leads)"
                className="flex-1 bg-transparent border-none outline-none text-xl font-black uppercase tracking-widest placeholder:text-slate-300 italic"
                value={query}
                onChange={e => setQuery(e.target.value)}
                onKeyDown={onKeyDown}
              />
              <div className="flex items-center gap-2 px-2 py-1 bg-ink text-brand text-[9px] font-black brutal-border shadow-none">
                ESC
              </div>
            </div>

            <div className="max-h-[450px] overflow-y-auto scrollbar-hide py-4">
              {filteredCommands.length > 0 ? (
                <div className="space-y-6">
                   {['Navigation', 'Actions'].map(category => {
                     const catCmds = filteredCommands.filter(c => c.category === category);
                     if (catCmds.length === 0) return null;
                     return (
                       <div key={category} className="px-4">
                         <h3 className="px-4 text-[9px] font-black text-slate-400 uppercase tracking-[0.3em] mb-3 italic flex items-center gap-2">
                           <Hash className="w-3 h-3" /> {category}
                         </h3>
                         <div className="space-y-1">
                           {catCmds.map((cmd) => {
                             const globalIndex = filteredCommands.indexOf(cmd);
                             const isSelected = globalIndex === selectedIndex;
                             return (
                               <button
                                 key={cmd.id}
                                 onClick={() => handleAction(cmd)}
                                 onMouseEnter={() => setSelectedIndex(globalIndex)}
                                 className={cn(
                                   "w-full p-4 flex items-center justify-between text-left transition-all border-2 border-transparent",
                                   isSelected ? "bg-brand border-ink translate-x-1 -translate-y-1 " : "hover:bg-zinc-50"
                                 )}
                               >
                                 <div className="flex items-center gap-4">
                                   <div className={cn(
                                     "w-10 h-10 brutal-border flex items-center justify-center transition-colors",
                                     isSelected ? "bg-white text-ink" : "bg-ink text-brand"
                                   )}>
                                     <cmd.icon className="w-5 h-5" />
                                   </div>
                                   <div>
                                      <div className="font-black text-ink uppercase tracking-wider text-sm">{cmd.label}</div>
                                      <div className={cn(
                                        "text-[10px] font-bold uppercase tracking-widest transition-colors",
                                        isSelected ? "text-ink/60" : "text-slate-400"
                                      )}>{cmd.description}</div>
                                   </div>
                                 </div>
                                 {isSelected && <ChevronRight className="w-6 h-6 text-ink" />}
                               </button>
                             );
                           })}
                         </div>
                       </div>
                     );
                   })}
                </div>
              ) : (
                <div className="p-20 text-center flex flex-col items-center justify-center opacity-20">
                  <Terminal className="w-16 h-16 mb-4" />
                  <p className="font-black uppercase tracking-[0.4em] text-xs">No matching protocols found</p>
                </div>
              )}
            </div>

            <div className="p-4 bg-zinc-50 border-t-2 border-ink/10 flex justify-between items-center text-[9px] font-black uppercase tracking-widest text-slate-400 italic">
               <div className="flex gap-4">
                  <span className="flex items-center gap-1.5"><ChevronRight className="w-3 h-3" /> SELECT</span>
                  <span className="flex items-center gap-1.5"><Hash className="w-3 h-3" /> NAVIGATE</span>
               </div>
               <div>WIRELINE OS v1.0.4</div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
