/* eslint-disable @typescript-eslint/no-explicit-any -- API response shapes vary by endpoint and aren't shared as client types yet. */
import {
  useState,
  useEffect,
  useCallback,
  useRef,
  KeyboardEvent as ReactKeyboardEvent,
} from "react";
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
  Crown,
  Kanban,
  ScrollText,
  Ban,
  LifeBuoy,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence, useReducedMotion } from "motion/react";
import { cn } from "../lib/utils";
import { useBodyScrollLock } from "../lib/use-body-scroll-lock";
import { useAuth } from "../contexts/AuthContext";
import { Input } from "./ui/shadcn/Input";
import { ScrollArea } from "./ui/shadcn/ScrollArea";
import { ShadButton } from "./ui/shadcn/ShadButton";

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

export function isTextEntryTarget(target: EventTarget | null): boolean {
  if (!target || typeof target !== "object") return false;
  const element = target as {
    tagName?: string;
    isContentEditable?: boolean;
    getAttribute?: (name: string) => string | null;
  };
  const tagName = typeof element.tagName === "string" ? element.tagName.toUpperCase() : "";
  const role = typeof element.getAttribute === "function" ? element.getAttribute("role") : null;
  return (
    ["INPUT", "TEXTAREA", "SELECT"].includes(tagName) ||
    element.isContentEditable === true ||
    role === "textbox" ||
    role === "searchbox"
  );
}

export function resolveCommandSelectionIndex(
  currentIndex: number,
  key: ReactKeyboardEvent["key"],
  itemCount: number,
): number {
  if (itemCount <= 0) return 0;
  if (key === "ArrowDown") return (currentIndex + 1) % itemCount;
  if (key === "ArrowUp") return (currentIndex - 1 + itemCount) % itemCount;
  if (key === "Home") return 0;
  if (key === "End") return itemCount - 1;
  return currentIndex;
}

export default function CommandBar() {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const { user } = useAuth();
  const reduceMotion = useReducedMotion();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const restoreFocusRef = useRef<HTMLElement | null>(null);

  // Pin the page underneath while the command palette is open so
  // arrow-key navigation doesn't scroll the page beneath it.
  useBodyScrollLock(isOpen);
  const navigate = useNavigate();

  const commands: CommandItem[] = [
    // ── Navigation ─────────────────────────────────────────
    {
      id: "agents",
      label: "Studio",
      description: "Build, voice & tune your agents — home",
      icon: Bot,
      category: "Navigation",
      shortcut: "A",
      action: () => navigate("/agents"),
    },
    {
      id: "assistant",
      label: "Assistant",
      description: "Direct your agents — embedded co-pilot in Studio",
      icon: MessagesSquare,
      category: "Navigation",
      action: () => navigate("/agents"),
    },
    {
      id: "dash",
      label: "Live Ops",
      description: "Live callers, listen-in, actions & fleet analytics",
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
      action: () => navigate("/ops?tab=triage"),
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
      action: () => navigate("/phone?tab=appointments"),
    },
    {
      id: "logs",
      label: "Call Logs",
      description: "Call records and transcripts",
      icon: History,
      category: "Navigation",
      shortcut: "L",
      action: () => navigate("/phone"),
    },
    {
      id: "inbox",
      label: "Email",
      description: "Inbound email threads",
      icon: Mail,
      category: "Navigation",
      shortcut: "E",
      action: () => navigate("/email"),
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
      action: () => navigate("/phone?tab=outbound"),
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
      description: "Train and tune agents (in Chat)",
      icon: MessageSquare,
      category: "Navigation",
      action: () => navigate("/chat"),
    },
    {
      id: "knowledge",
      label: "Knowledge",
      description: "Cross-agent fact manager",
      icon: Database,
      category: "Navigation",
      action: () => navigate("/agents?rail=knowledge"),
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
      description: "Pick an agent, then Training → Test call",
      icon: PhoneCall,
      category: "Actions",
      action: () => navigate("/chat"),
    },
    {
      id: "review-agent",
      label: "Run Performance Review",
      description: "Deep audit of an agent's recent calls",
      icon: BarChart3,
      category: "Actions",
      action: () => navigate("/chat"),
    },
    {
      id: "ingest-url",
      label: "Ingest Knowledge from URL",
      description: "Wireline AI reads a site and extracts facts",
      icon: Zap,
      category: "Actions",
      action: () => navigate("/chat"),
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
      const typingTarget = isTextEntryTarget(e.target);

      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        if (!isOpen && typingTarget) return;
        e.preventDefault();
        setIsOpen((prev) => !prev);
      }
      if (e.key === "Escape" && isOpen) setIsOpen(false);
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
  }, [isOpen]);

  const handleAction = useCallback((cmd: CommandItem) => {
    cmd.action();
    setIsOpen(false);
    setQuery("");
  }, []);

  useEffect(() => {
    if (isOpen) setSelectedIndex(0);
  }, [isOpen, query]);

  useEffect(() => {
    if (isOpen) {
      restoreFocusRef.current =
        document.activeElement instanceof HTMLElement ? document.activeElement : null;
      return;
    }
    if (restoreFocusRef.current && document.contains(restoreFocusRef.current)) {
      restoreFocusRef.current.focus();
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    optionRefs.current[selectedIndex]?.scrollIntoView({ block: "nearest" });
  }, [isOpen, selectedIndex]);

  const onKeyDown = (e: ReactKeyboardEvent) => {
    if (["ArrowDown", "ArrowUp", "Home", "End"].includes(e.key)) {
      e.preventDefault();
      setSelectedIndex((prev) =>
        resolveCommandSelectionIndex(prev, e.key, filteredCommands.length),
      );
    } else if (e.key === "Tab") {
      // Standard command-palette behavior: Tab cycles results instead of
      // moving focus out of the dialog (keyboard trap fix).
      e.preventDefault();
      const len = Math.max(1, filteredCommands.length);
      setSelectedIndex((prev) => (e.shiftKey ? (prev - 1 + len) % len : (prev + 1) % len));
    } else if (e.key === "Enter" && filteredCommands[selectedIndex]) {
      handleAction(filteredCommands[selectedIndex]);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[9999] flex items-start justify-center px-4 pt-[max(1rem,calc(env(safe-area-inset-top,0px)+8dvh))]">
          {/* Backdrop */}
          <motion.div
            initial={reduceMotion ? { opacity: 1 } : { opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={reduceMotion ? { opacity: 0, transition: { duration: 0.01 } } : { opacity: 0 }}
            className="absolute inset-0 bg-black/70 backdrop-blur-md"
            onClick={() => setIsOpen(false)}
          />

          {/* Dialog */}
          <motion.div
            initial={reduceMotion ? { opacity: 1 } : { scale: 0.96, opacity: 0, y: -16 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={
              reduceMotion
                ? { opacity: 0, transition: { duration: 0.01 } }
                : { scale: 0.96, opacity: 0, y: -16 }
            }
            transition={
              reduceMotion ? { duration: 0.01 } : { duration: 0.22, ease: [0.16, 1, 0.3, 1] }
            }
            role="dialog"
            aria-modal="true"
            aria-label="Command bar"
            className="relative w-full max-w-xl overflow-hidden wl-panel elev-glow"
          >
            {/* Purple ring border */}
            <div className="absolute inset-0 rounded-md p-px overflow-hidden pointer-events-none z-20">
              <div className="absolute inset-0 rounded-md wl-command-glow-ring" />
            </div>

            {/* Search input */}
            <div className="relative z-10 wl-panel-elevated rounded-t-md px-5 py-4 flex items-center gap-3 border-b border-border">
              <Search className="w-4 h-4 text-brand/80 shrink-0" />
              <Input
                ref={inputRef}
                autoFocus
                aria-label="Command search input"
                role="combobox"
                aria-expanded="true"
                aria-controls="command-bar-listbox"
                aria-activedescendant={
                  filteredCommands[selectedIndex]
                    ? `command-bar-option-${filteredCommands[selectedIndex].id}`
                    : undefined
                }
                aria-autocomplete="list"
                placeholder="Jump anywhere or take an action…"
                className="flex-1 bg-transparent border-none outline-none text-[14px] text-ink placeholder:text-ink/40 font-normal"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={onKeyDown}
              />
              <kbd className="hidden sm:flex items-center gap-0.5 px-1.5 py-0.5 rounded-md wl-panel border border-border wl-micro-meta uppercase tracking-[0.2em] leading-none shrink-0">
                ESC
              </kbd>
            </div>

            {/* Results */}
            <div className="relative z-10 wl-panel-elevated rounded-b-md max-h-[60dvh] sm:max-h-[420px] flex flex-col min-h-0">
              <ScrollArea className="flex-1 min-h-0 max-h-[calc(60dvh-2.75rem)] sm:max-h-[calc(420px-2.75rem)]">
                {filteredCommands.length > 0 ? (
                  <div
                    className="py-2"
                    id="command-bar-listbox"
                    role="listbox"
                    aria-label="Command results"
                  >
                    {["Navigation", "Actions"].map((category) => {
                      const catCmds = filteredCommands.filter((c) => c.category === category);
                      if (catCmds.length === 0) return null;
                      return (
                        <div key={category} className="mb-1 last:mb-0">
                          <div className="px-5 pt-3 pb-1.5 wl-label text-ink/40 flex items-center gap-2">
                            <span className="h-px flex-1 bg-border/40" />
                            {category}
                            <span className="h-px flex-1 bg-border/40" />
                          </div>
                          <div className="px-2 space-y-0.5">
                            {catCmds.map((cmd) => {
                              const globalIndex = filteredCommands.indexOf(cmd);
                              const isSelected = globalIndex === selectedIndex;
                              return (
                                <ShadButton
                                  key={cmd.id}
                                  id={`command-bar-option-${cmd.id}`}
                                  type="button"
                                  variant="ghost"
                                  disableAnimations
                                  role="option"
                                  aria-selected={isSelected}
                                  tabIndex={-1}
                                  ref={(node) => {
                                    optionRefs.current[globalIndex] = node;
                                  }}
                                  onClick={() => handleAction(cmd)}
                                  onMouseEnter={() => setSelectedIndex(globalIndex)}
                                  onFocus={() => setSelectedIndex(globalIndex)}
                                  className={cn(
                                    "group w-full h-auto rounded-md px-3 py-2.5 flex items-center gap-3 text-left justify-start",
                                    isSelected
                                      ? "bg-accent/40 border border-brand/25"
                                      : "border border-transparent hover:bg-muted/30",
                                  )}
                                >
                                  {/* Icon */}
                                  <div
                                    className={cn(
                                      "w-8 h-8 rounded-md flex items-center justify-center shrink-0 transition-all",
                                      isSelected
                                        ? "bg-brand/15 border border-brand/30 text-brand"
                                        : "wl-panel border border-border text-muted",
                                    )}
                                  >
                                    <cmd.icon aria-hidden="true" className="w-3.5 h-3.5" />
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
                                    <div className="wl-micro-meta truncate leading-none">
                                      {cmd.description}
                                    </div>
                                  </div>

                                  {/* Shortcut or chevron */}
                                  <div className="shrink-0 flex items-center gap-2">
                                    {cmd.shortcut && (
                                      <kbd
                                        className={cn(
                                          "hidden sm:flex items-center px-1.5 py-0.5 rounded-md border wl-label leading-none transition-all",
                                          isSelected
                                            ? "bg-brand/15 border-brand/30 text-brand"
                                            : "wl-panel border border-border/80 text-ink/40",
                                        )}
                                      >
                                        {cmd.shortcut}
                                      </kbd>
                                    )}
                                    <ChevronRight
                                      aria-hidden="true"
                                      className={cn(
                                        "w-3.5 h-3.5 transition-all",
                                        isSelected
                                          ? "text-brand opacity-100"
                                          : "text-ink/40 opacity-0 group-hover:opacity-100",
                                      )}
                                    />
                                  </div>
                                </ShadButton>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="py-16 flex flex-col items-center justify-center gap-3">
                    <div className="w-12 h-12 rounded-md wl-panel flex items-center justify-center border border-brand/15">
                      <Terminal className="w-5 h-5 text-brand/60" />
                    </div>
                    <p className="wl-label text-muted">No matching commands</p>
                    <p className="text-[11px] text-muted/70">Try “ops”, “agents”, or “insights”</p>
                  </div>
                )}
              </ScrollArea>

              {/* Footer */}
              <div className="shrink-0 px-5 py-2.5 border-t border-border flex items-center justify-between bg-paper/60 backdrop-blur-sm">
                <div className="flex items-center gap-3 wl-label text-ink/40">
                  <span className="flex items-center gap-1">
                    <kbd
                      className="px-1.5 py-0.5 rounded wl-panel border border-border wl-micro-badge font-mono leading-none"
                      aria-label="Arrow keys to navigate"
                    >
                      ↑↓
                    </kbd>
                    Navigate
                  </span>
                  <span className="flex items-center gap-1">
                    <kbd
                      className="px-1.5 py-0.5 rounded wl-panel border border-border wl-micro-badge font-mono leading-none"
                      aria-label="Enter key to execute"
                    >
                      ↵
                    </kbd>
                    Execute
                  </span>
                  <span className="flex items-center gap-1">
                    <kbd
                      className="px-1.5 py-0.5 rounded wl-panel border border-border wl-micro-badge font-mono leading-none"
                      aria-label="Escape key to close"
                    >
                      ESC
                    </kbd>
                    Close
                  </span>
                </div>
                <span className="wl-label text-ink/40">WIRELINE</span>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
