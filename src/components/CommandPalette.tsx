import React, { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Search, Command, LayoutGrid, Terminal, ShieldCheck, Settings, Users, Phone, Inbox, Calendar, Activity, Zap, Bot, History, TrendingUp, BarChart3, Database } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { cn } from "../lib/utils";

type CommandAction = {
  id: string;
  title: string;
  description: string;
  icon: any;
  action: () => void;
  category: string;
};

export default function CommandPalette() {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);

  const commands: CommandAction[] = [
    { id: "command", title: "Command Center", description: "Real-time system overview", icon: Terminal, category: "Navigation", action: () => navigate("/command") },
    { id: "dashboard", title: "Dashboard", description: "Business performance metrics", icon: LayoutGrid, category: "Navigation", action: () => navigate("/dashboard") },
    { id: "live", title: "Live Monitor", description: "Real-time voice activity", icon: Activity, category: "Operations", action: () => navigate("/live") },
    { id: "triage", title: "Triage Inbox", description: "Pending tasks and escalations", icon: Inbox, category: "Operations", action: () => navigate("/triage") },
    { id: "outbound", title: "Outbound Dialer", description: "Manage lead campaigns", icon: Phone, category: "Operations", action: () => navigate("/outbound") },
    { id: "appointments", title: "Appointments", description: "Scheduled business meetings", icon: Calendar, category: "Operations", action: () => navigate("/appointments") },
    { id: "insights", title: "Agent Insights", description: "Autonomous optimization logs", icon: Zap, category: "Intelligence", action: () => navigate("/insights") },
    { id: "knowledge", title: "Knowledge Base", description: "System intelligence & docs", icon: Database, category: "Intelligence", action: () => navigate("/knowledge") },
    { id: "agents", title: "Fleet Management", description: "Configure AI agents", icon: Bot, category: "Configuration", action: () => navigate("/agents") },
    { id: "admin", title: "Admin Settings", description: "Billing and system config", icon: Settings, category: "Configuration", action: () => navigate("/admin") },
    { id: "audit", title: "Audit Log", description: "System security & cost audit", icon: ShieldCheck, category: "Security", action: () => navigate("/audit") },
    { id: "dnc", title: "DNC Manager", description: "Compliance & block lists", icon: History, category: "Security", action: () => navigate("/dnc") },
  ];

  const filteredCommands = commands.filter(c => 
    c.title.toLowerCase().includes(query.toLowerCase()) || 
    c.description.toLowerCase().includes(query.toLowerCase())
  );

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setIsOpen(prev => !prev);
      }
      if (e.key === "Escape") setIsOpen(false);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  useEffect(() => {
    if (isOpen) {
      setQuery("");
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 10);
    }
  }, [isOpen]);

  const handleSelect = (cmd: CommandAction) => {
    cmd.action();
    setIsOpen(false);
  };

  const categories = Array.from(new Set(filteredCommands.map(c => c.category)));

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[1000] flex items-start justify-center pt-[15vh] px-4">
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-paper/60 backdrop-blur-md"
            onClick={() => setIsOpen(false)}
          />
          
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: -20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: -20 }}
            className="w-full max-w-xl glass-elevated overflow-hidden brutal-border-lg flex flex-col relative z-[1001] shadow-2xl"
          >
            <div className="flex items-center gap-4 px-6 py-5 border-b border-white/10">
              <Search className="w-5 h-5 text-brand" />
              <input
                ref={inputRef}
                type="text"
                placeholder="Search commands, pages, and tools..."
                className="flex-1 bg-transparent border-none outline-none text-ink text-lg placeholder:text-muted/40"
                value={query}
                onChange={e => setQuery(e.target.value)}
                onKeyDown={e => {
                  if (e.key === "ArrowDown") {
                    e.preventDefault();
                    setSelectedIndex(prev => (prev + 1) % filteredCommands.length);
                  } else if (e.key === "ArrowUp") {
                    e.preventDefault();
                    setSelectedIndex(prev => (prev - 1 + filteredCommands.length) % filteredCommands.length);
                  } else if (e.key === "Enter") {
                    if (filteredCommands[selectedIndex]) handleSelect(filteredCommands[selectedIndex]);
                  }
                }}
              />
              <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-black/5 border border-black/5">
                <Command className="w-3 h-3 text-muted" />
                <span className="text-[10px] font-mono text-muted uppercase tracking-widest">K</span>
              </div>
            </div>

            <div className="max-h-[60vh] overflow-y-auto p-2 scrollbar-hide">
              {filteredCommands.length === 0 ? (
                <div className="py-12 text-center">
                  <p className="text-sm text-muted">No results found for "{query}"</p>
                </div>
              ) : (
                categories.map(cat => (
                  <div key={cat} className="mb-2">
                    <div className="px-4 py-2">
                      <h4 className="text-[9px] uppercase tracking-[0.4em] text-muted/60">{cat}</h4>
                    </div>
                    {filteredCommands.filter(c => c.category === cat).map((cmd) => {
                      const globalIdx = filteredCommands.indexOf(cmd);
                      const active = globalIdx === selectedIndex;
                      return (
                        <button
                          key={cmd.id}
                          onClick={() => handleSelect(cmd)}
                          onMouseEnter={() => setSelectedIndex(globalIdx)}
                          className={cn(
                            "w-full flex items-center gap-4 px-4 py-3 rounded-xl transition-all text-left group",
                            active ? "bg-brand/10" : "hover:bg-black/5"
                          )}
                        >
                          <div className={cn(
                            "w-10 h-10 rounded-xl flex items-center justify-center transition-all",
                            active ? "bg-brand/20 text-brand scale-110" : "bg-black/5 text-muted group-hover:text-ink"
                          )}>
                            <cmd.icon className="w-5 h-5" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className={cn(
                              "text-sm font-medium transition-colors",
                              active ? "text-ink" : "text-ink/80"
                            )}>
                              {cmd.title}
                            </p>
                            <p className="text-[11px] text-muted truncate">{cmd.description}</p>
                          </div>
                          {active && (
                            <div className="flex items-center gap-1.5 text-[9px] uppercase tracking-[0.2em] text-brand font-bold animate-pulse">
                              <span>Enter</span>
                            </div>
                          )}
                        </button>
                      );
                    })}
                  </div>
                ))
              )}
            </div>

            <div className="px-6 py-4 border-t border-white/10 bg-black/5 flex items-center justify-between">
              <div className="flex gap-4">
                <div className="flex items-center gap-1.5">
                  <kbd className="px-2 py-1 rounded bg-white/50 border border-black/10 text-[9px] font-mono shadow-sm">↑↓</kbd>
                  <span className="text-[9px] text-muted uppercase tracking-wider">Navigate</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <kbd className="px-2 py-1 rounded bg-white/50 border border-black/10 text-[9px] font-mono shadow-sm">Enter</kbd>
                  <span className="text-[9px] text-muted uppercase tracking-wider">Select</span>
                </div>
              </div>
              <p className="text-[9px] text-muted italic">Powered by Wireline Intelligence</p>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
