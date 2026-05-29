/* eslint-disable @typescript-eslint/no-explicit-any -- API response shapes vary by endpoint and aren't shared as client types yet. */
import { useState, useEffect, useCallback, KeyboardEvent as ReactKeyboardEvent } from "react";
import {
  Search,
  Bot,
  PhoneCall,
  Mail,
  Zap,
  Terminal,
  ChevronRight,
  Inbox,
  BarChart3,
  Calendar,
  MessageSquare,
  MessagesSquare,
  MessageCircle,
  PhoneOutgoing,
  History,
  ServerCog,
  PlugZap,
  Sparkles,
  Activity,
  Database,
  Headphones,
  Crown,
  Kanban,
  ScrollText,
  Ban,
  LifeBuoy,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "motion/react";
import { cn } from "../lib/utils";
import { useBodyScrollLock } from "../lib/use-body-scroll-lock";
import { useAuth } from "../contexts/AuthContext";

interface CommandItem {
  id: string;
  label: string;
  description: string;
  icon: any;
  action: () => void;
  category: string;
  shortcut?: string;
  ownerOnly?: boolean;
}

export default function CommandBar() {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const { user } = useAuth();

  // Pin the page underneath while the command palette is open so
  // arrow-key navigation doesn't scroll the page beneath it.
  useBodyScrollLock(isOpen);
  const navigate = useNavigate();

  const commands: CommandItem[] = [
    // ── Navigation ─────────────────────────────────────────
    {
      id: "chat",
      label: "Chat",
      description: "Direct your agents — the main control surface",
      icon: MessagesSquare,
      category: "Navigation",
      shortcut: "C",
      action: () => navigate("/chat"),
    },
    {
      id: "dash",
      label: "Live Ops",
      description: "Live overview of agents and activity",
      icon: Activity,
      category: "Navigation",
      shortcut: "D",
      action: () => navigate("/ops"),
    },
    {
      id: "triage",
      label: "Triage",
      description: "Hot leads, compliance, knowledge gaps",
      icon: Inbox,
      category: "Navigation",
      shortcut: "T",
      action: () => navigate("/triage"),
    },
    {
      id: "insights",
      label: "Insights",
      description: "Funnel, topics, heatmap, leaderboard",
      icon: BarChart3,
      category: "Navigation",
      shortcut: "I",
      action: () => navigate("/insights"),
    },
    {
      id: "appointments",
      label: "Appointments",
      description: "Booked appointments",
      icon: Calendar,
      category: "Navigation",
      action: () => navigate("/appointments"),
    },
    {
      id: "logs",
      label: "Call Logs",
      description: "Call records and transcripts",
      icon: History,
      category: "Navigation",
      shortcut: "L",
      action: () => navigate("/logs"),
    },
    {
      id: "inbox",
      label: "Email",
      description: "Inbound email threads",
      icon: Mail,
      category: "Navigation",
      shortcut: "E",
      action: () => navigate("/inbox"),
    },
    {
      id: "sms",
      label: "SMS",
      description: "Two-way text conversations",
      icon: MessageCircle,
      category: "Navigation",
      action: () => navigate("/sms"),
    },
    {
      id: "outbound",
      label: "Outbound",
      description: "Single and bulk lead outreach",
      icon: PhoneOutgoing,
      category: "Navigation",
      shortcut: "O",
      action: () => navigate("/outbound"),
    },
    {
      id: "pipeline",
      label: "Pipeline",
      description: "Kanban view of leads across stages",
      icon: Kanban,
      category: "Navigation",
      action: () => navigate("/pipeline"),
    },
    {
      id: "cockpit",
      label: "Supervisor Cockpit",
      description: "Floor-level monitoring with SLA flags",
      icon: Headphones,
      category: "Navigation",
      ownerOnly: true,
      action: () => navigate("/cockpit"),
    },
    {
      id: "founder",
      label: "Founder",
      description: "Owner-only metrics dashboard",
      icon: Crown,
      category: "Navigation",
      ownerOnly: true,
      action: () => navigate("/founder"),
    },
    {
      id: "train",
      label: "Training",
      description: "Train and tune agents",
      icon: MessageSquare,
      category: "Navigation",
      action: () => navigate("/train"),
    },
    {
      id: "knowledge",
      label: "Knowledge",
      description: "Cross-agent fact manager",
      icon: Database,
      category: "Navigation",
      action: () => navigate("/knowledge"),
    },
    {
      id: "agents",
      label: "Agents",
      description: "Configure autonomous agents",
      icon: Bot,
      category: "Navigation",
      shortcut: "A",
      action: () => navigate("/agents"),
    },
    {
      id: "integrations",
      label: "Integrations",
      description: "Phone numbers and integrations",
      icon: PlugZap,
      category: "Navigation",
      action: () => navigate("/integrations"),
    },
    {
      id: "admin",
      label: "Settings",
      description: "Account and platform settings",
      icon: ServerCog,
      category: "Navigation",
      action: () => navigate("/admin"),
    },
    {
      id: "dnc",
      label: "DNC List",
      description: "Do-not-call number registry",
      icon: Ban,
      category: "Navigation",
      action: () => navigate("/dnc"),
    },
    {
      id: "audit",
      label: "Audit Log",
      description: "Account activity and security events",
      icon: ScrollText,
      category: "Navigation",
      action: () => navigate("/audit"),
    },
    {
      id: "help",
      label: "Help",
      description: "Reach the Wireline team",
      icon: LifeBuoy,
      category: "Navigation",
      action: () => navigate("/help"),
    },

    // ── Actions ────────────────────────────────────────────
    {
      id: "forge-agent",
      label: "Design Agent with Wireline AI",
      description: "Build a complete agent from a goal",
      icon: Sparkles,
      category: "Actions",
      action: () => navigate("/agents"),
    },
    {
      id: "test-call",
      label: "Start Test Call",
      description: "Talk to your agent right now",
      icon: PhoneCall,
      category: "Actions",
      action: () => navigate("/train?tab=simulator"),
    },
    {
      id: "review-agent",
      label: "Run Performance Review",
      description: "Deep audit of an agent's recent calls",
      icon: BarChart3,
      category: "Actions",
      action: () => navigate("/train"),
    },
    {
      id: "ingest-url",
      label: "Ingest Knowledge from URL",
      description: "Wireline AI reads a site and extracts facts",
      icon: Zap,
      category: "Actions",
      action: () => navigate("/train"),
    },
  ];

  const filteredCommands = commands.filter((c) => {
    if (c.ownerOnly && user?.is_owner !== true) return false;
    const q = query.toLowerCase();
    return (
      c.label.toLowerCase().includes(q) ||
      c.description.toLowerCase().includes(q) ||
      c.category.toLowerCase().includes(q)
    );
  });

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setIsOpen((prev) => !prev);
      }
      if (e.key === "Escape") setIsOpen(false);
    };

    const handleOpenCommandBar = () => {
      setIsOpen(true);
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("wireline:open-command-bar", handleOpenCommandBar);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("wireline:open-command-bar", handleOpenCommandBar);
    };
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
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((prev) => (prev + 1) % Math.max(1, filteredCommands.length));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex(
        (prev) => (prev - 1 + filteredCommands.length) % Math.max(1, filteredCommands.length),
      );
    } else if (e.key === "Enter" && filteredCommands[selectedIndex]) {
      handleAction(filteredCommands[selectedIndex]);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div
          className="fixed inset-0 z-[9999] flex items-start justify-center px-4"
          style={{ paddingTop: "max(1rem, calc(env(safe-area-inset-top, 0px) + 8dvh))" }}
        >
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black/70 backdrop-blur-md"
            onClick={() => setIsOpen(false)}
          />

          {/* Dialog */}
          <motion.div
            initial={{ scale: 0.96, opacity: 0, y: -16 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.96, opacity: 0, y: -16 }}
            transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
            role="dialog"
            aria-modal="true"
            aria-label="Command bar"
            className="relative w-full max-w-xl overflow-hidden"
          >
            {/* Aurora ring border */}
            <div className="absolute inset-0 rounded-2xl p-px overflow-hidden pointer-events-none z-20">
              <div
                className="absolute inset-0 rounded-2xl"
                style={{
                  background:
                    "linear-gradient(135deg, rgba(79, 30, 123 ,0.6), rgba(79, 30, 123 ,0.4) 50%, rgba(79, 30, 123 ,0.5))",
                }}
              />
            </div>

            {/* Search input */}
            <div className="relative z-10 glass-strong rounded-t-2xl px-5 py-4 flex items-center gap-3 border-b border-white/8">
              <Search className="w-4 h-4 text-brand/80 shrink-0" />
              <input
                autoFocus
                aria-label="Command search input"
                placeholder="Jump anywhere or take an action…"
                className="flex-1 bg-transparent border-none outline-none text-[14px] text-ink placeholder:text-muted/70 font-normal"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={onKeyDown}
              />
              <kbd className="hidden sm:flex items-center gap-0.5 px-1.5 py-0.5 rounded-md glass border border-white/15 text-[9px] text-muted/70 uppercase tracking-[0.2em] leading-none shrink-0">
                ESC
              </kbd>
            </div>

            {/* Results */}
            <div className="relative z-10 glass-strong rounded-b-2xl max-h-[60dvh] sm:max-h-[420px] overflow-y-auto">
              {filteredCommands.length > 0 ? (
                <div className="py-2">
                  {["Navigation", "Actions"].map((category) => {
                    const catCmds = filteredCommands.filter((c) => c.category === category);
                    if (catCmds.length === 0) return null;
                    return (
                      <div key={category} className="mb-1 last:mb-0">
                        <div className="px-5 pt-3 pb-1.5 text-[8px] uppercase tracking-[0.4em] text-muted/70 flex items-center gap-2">
                          <span className="h-px flex-1 bg-white/8" />
                          {category}
                          <span className="h-px flex-1 bg-white/8" />
                        </div>
                        <div className="px-2 space-y-0.5">
                          {catCmds.map((cmd) => {
                            const globalIndex = filteredCommands.indexOf(cmd);
                            const isSelected = globalIndex === selectedIndex;
                            return (
                              <button
                                key={cmd.id}
                                onClick={() => handleAction(cmd)}
                                onMouseEnter={() => setSelectedIndex(globalIndex)}
                                className={cn(
                                  "w-full rounded-xl px-3 py-2.5 flex items-center gap-3 text-left transition-all",
                                  isSelected
                                    ? "bg-white/8 border border-brand/25"
                                    : "border border-transparent hover:bg-white/5",
                                )}
                              >
                                {/* Icon */}
                                <div
                                  className={cn(
                                    "w-8 h-8 rounded-lg flex items-center justify-center shrink-0 transition-all",
                                    isSelected
                                      ? "bg-brand/15 border border-brand/30 text-brand"
                                      : "glass border border-white/10 text-muted",
                                  )}
                                >
                                  <cmd.icon className="w-3.5 h-3.5" />
                                </div>

                                {/* Label + description */}
                                <div className="flex-1 min-w-0">
                                  <div
                                    className={cn(
                                      "text-[13px] leading-none mb-0.5 transition-colors",
                                      isSelected ? "text-ink" : "text-ink/80",
                                    )}
                                  >
                                    {cmd.label}
                                  </div>
                                  <div className="text-[10px] text-muted/70 truncate leading-none">
                                    {cmd.description}
                                  </div>
                                </div>

                                {/* Shortcut or chevron */}
                                <div className="shrink-0 flex items-center gap-2">
                                  {cmd.shortcut && (
                                    <kbd
                                      className={cn(
                                        "hidden sm:flex items-center px-1.5 py-0.5 rounded-md border text-[9px] leading-none uppercase tracking-[0.2em] transition-all",
                                        isSelected
                                          ? "bg-brand/15 border-brand/30 text-brand"
                                          : "glass border-white/15 text-muted/70",
                                      )}
                                    >
                                      {cmd.shortcut}
                                    </kbd>
                                  )}
                                  <ChevronRight
                                    className={cn(
                                      "w-3.5 h-3.5 transition-all",
                                      isSelected
                                        ? "text-brand opacity-100"
                                        : "text-muted/70 opacity-0 group-hover:opacity-100",
                                    )}
                                  />
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="py-16 flex flex-col items-center justify-center gap-3">
                  <Terminal className="w-8 h-8 text-muted/70" />
                  <p className="app-section-title/65">No matching commands</p>
                </div>
              )}

              {/* Footer */}
              <div className="sticky bottom-0 px-5 py-2.5 border-t border-white/8 flex items-center justify-between bg-paper/60 backdrop-blur-sm">
                <div className="flex items-center gap-3 text-[8px] uppercase tracking-[0.28em] text-muted/70">
                  <span className="flex items-center gap-1">
                    <kbd
                      className="px-1 py-0.5 rounded glass border border-white/12 text-[7px]"
                      aria-label="Arrow keys to navigate"
                    >
                      ↑↓
                    </kbd>
                    Navigate
                  </span>
                  <span className="flex items-center gap-1">
                    <kbd
                      className="px-1 py-0.5 rounded glass border border-white/12 text-[7px]"
                      aria-label="Enter key to execute"
                    >
                      ↵
                    </kbd>
                    Execute
                  </span>
                  <span className="flex items-center gap-1">
                    <kbd
                      className="px-1 py-0.5 rounded glass border border-white/12 text-[7px]"
                      aria-label="Escape key to close"
                    >
                      ESC
                    </kbd>
                    Close
                  </span>
                </div>
                <span className="text-[8px] uppercase tracking-[0.4em] text-muted/70">
                  WIRELINE
                </span>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
