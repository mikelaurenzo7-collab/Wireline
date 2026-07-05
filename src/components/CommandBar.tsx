import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import {
  Bot,
  BriefcaseBusiness,
  Cable,
  ChevronRight,
  CreditCard,
  Database,
  Inbox,
  LayoutDashboard,
  MonitorDown,
  PenLine,
  Search,
  Settings,
  Sparkles,
  Terminal,
  UsersRound,
  WandSparkles,
  X,
  type LucideIcon,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { cn } from "../lib/utils";
import { useBodyScrollLock } from "../lib/use-body-scroll-lock";
import { Button, EmptyState, Input } from "./atoms";
import { ScrollArea } from "./ui/shadcn/ScrollArea";

type CommandCategory = "Workspace" | "Create" | "Manage";

type CommandItem = {
  id: string;
  label: string;
  description: string;
  icon: LucideIcon;
  href: string;
  category: CommandCategory;
};

const COMMAND_CATEGORIES: readonly CommandCategory[] = ["Workspace", "Create", "Manage"];

const WORKSPACE_COMMANDS: readonly CommandItem[] = [
  {
    id: "overview",
    label: "Overview",
    description: "See the current state of your workspace.",
    icon: LayoutDashboard,
    href: "/overview",
    category: "Workspace",
  },
  {
    id: "agents",
    label: "Agents",
    description: "Manage personal and business agents.",
    icon: Bot,
    href: "/overview",
    category: "Workspace",
  },
  {
    id: "studio",
    label: "Studio",
    description: "Run agent work, approvals, calls, texts, and follow-up.",
    icon: PenLine,
    href: "/studio",
    category: "Workspace",
  },
  {
    id: "training",
    label: "Training",
    description: "Manage the facts, context, sources, and policies agents use.",
    icon: Database,
    href: "/knowledge",
    category: "Workspace",
  },
  {
    id: "wire",
    label: "Wire",
    description: "Choose the accounts, integrations, and actions an agent can use.",
    icon: Cable,
    href: "/connections",
    category: "Workspace",
  },
  {
    id: "inbox",
    label: "Inbox",
    description: "Review conversations, outcomes, and team handoffs.",
    icon: Inbox,
    href: "/inbox",
    category: "Workspace",
  },
  {
    id: "settings",
    label: "Settings",
    description: "Manage workspace, billing, team, and connected surfaces.",
    icon: Settings,
    href: "/settings",
    category: "Workspace",
  },
  {
    id: "create-personal",
    label: "Create a personal agent",
    description: "Start with one focused job, then train the rest.",
    icon: Sparkles,
    href: "/studio?create=1",
    category: "Create",
  },
  {
    id: "create-business",
    label: "Create a business agent",
    description: "Set up an agent for a professional conversation line.",
    icon: BriefcaseBusiness,
    href: "/studio?create=1&posture=business",
    category: "Create",
  },
  {
    id: "create-brief",
    label: "Open a new Studio brief",
    description: "Start an agent creation flow in Studio.",
    icon: WandSparkles,
    href: "/studio?create=1",
    category: "Create",
  },
  {
    id: "billing",
    label: "Billing and usage",
    description: "Review plan, conversation balance, invoices, and payment details.",
    icon: CreditCard,
    href: "/settings/billing",
    category: "Manage",
  },
  {
    id: "team",
    label: "Team",
    description: "Invite collaborators and manage workspace access.",
    icon: UsersRound,
    href: "/settings/team",
    category: "Manage",
  },
  {
    id: "client-apps",
    label: "Wireline everywhere",
    description: "Open Wireline Command, native app, and ChatGPT connection settings.",
    icon: MonitorDown,
    href: "/settings/apps",
    category: "Manage",
  },
];

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
  const reduceMotion = useReducedMotion();
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const restoreFocusRef = useRef<HTMLElement | null>(null);

  useBodyScrollLock(isOpen);

  const filteredCommands = useMemo(() => {
    const term = query.trim().toLocaleLowerCase();
    if (!term) return WORKSPACE_COMMANDS;
    return WORKSPACE_COMMANDS.filter((command) =>
      [command.label, command.description, command.category]
        .join(" ")
        .toLocaleLowerCase()
        .includes(term),
    );
  }, [query]);

  const close = useCallback(() => {
    setIsOpen(false);
    setQuery("");
  }, []);

  const execute = useCallback(
    (command: CommandItem) => {
      navigate(command.href);
      close();
    },
    [close, navigate],
  );

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const isCommandShortcut =
        (event.metaKey || event.ctrlKey) && event.key.toLocaleLowerCase() === "k";
      if (isCommandShortcut) {
        if (!isOpen && isTextEntryTarget(event.target)) return;
        event.preventDefault();
        if (isOpen) close();
        else setIsOpen(true);
        return;
      }
      if (event.key === "Escape" && isOpen) {
        event.preventDefault();
        close();
      }
    };
    const handleOpen = () => setIsOpen(true);

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("wireline:open-command-bar", handleOpen);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("wireline:open-command-bar", handleOpen);
    };
  }, [close, isOpen]);

  useEffect(() => {
    if (isOpen) {
      restoreFocusRef.current =
        document.activeElement instanceof HTMLElement ? document.activeElement : null;
      const frame = requestAnimationFrame(() => inputRef.current?.focus());
      return () => cancelAnimationFrame(frame);
    }
    if (restoreFocusRef.current && document.contains(restoreFocusRef.current)) {
      restoreFocusRef.current.focus();
    }
  }, [isOpen]);

  useEffect(() => {
    if (isOpen) setSelectedIndex(0);
  }, [isOpen, query]);

  useEffect(() => {
    if (!isOpen) return;
    optionRefs.current[selectedIndex]?.scrollIntoView({ block: "nearest" });
  }, [isOpen, selectedIndex]);

  function onSearchKeyDown(event: ReactKeyboardEvent<HTMLInputElement>) {
    if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
      event.preventDefault();
      setSelectedIndex((current) =>
        resolveCommandSelectionIndex(current, event.key, filteredCommands.length),
      );
      return;
    }
    if (event.key === "Enter" && filteredCommands[selectedIndex]) {
      event.preventDefault();
      execute(filteredCommands[selectedIndex]);
    }
  }

  function onDialogKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (event.key !== "Tab") return;
    if (event.target === inputRef.current) {
      event.preventDefault();
      closeButtonRef.current?.focus();
    } else if (event.target === closeButtonRef.current) {
      event.preventDefault();
      inputRef.current?.focus();
    }
  }

  return (
    <AnimatePresence>
      {isOpen ? (
        <div className="fixed inset-0 z-[9999] flex items-start justify-center px-4 pt-[max(1rem,calc(env(safe-area-inset-top,0px)+8dvh))]">
          <motion.div
            aria-hidden="true"
            initial={reduceMotion ? { opacity: 1 } : { opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={reduceMotion ? { opacity: 0, transition: { duration: 0.01 } } : { opacity: 0 }}
            className="absolute inset-0 bg-[color:color-mix(in_srgb,var(--foreground)_68%,transparent)] backdrop-blur-sm"
            onMouseDown={close}
          />
          <motion.div
            initial={reduceMotion ? { opacity: 1 } : { scale: 0.98, opacity: 0, y: -12 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={
              reduceMotion
                ? { opacity: 0, transition: { duration: 0.01 } }
                : { scale: 0.98, opacity: 0, y: -12 }
            }
            transition={
              reduceMotion ? { duration: 0.01 } : { duration: 0.2, ease: [0.16, 1, 0.3, 1] }
            }
            role="dialog"
            aria-modal="true"
            aria-labelledby="command-palette-title"
            aria-describedby="command-palette-description"
            data-slot="command-palette"
            onKeyDown={onDialogKeyDown}
            className="relative w-full max-w-2xl overflow-hidden rounded-[var(--radius-xl)] border border-border bg-card shadow-[var(--wireline-elevation-lg)]"
          >
            <div className="flex items-center gap-3 border-b border-border px-4 py-3 sm:px-5 sm:py-4">
              <Search aria-hidden="true" className="size-4 shrink-0 text-primary" />
              <div className="min-w-0 flex-1">
                <p id="command-palette-title" className="sr-only">
                  Wireline command palette
                </p>
                <p id="command-palette-description" className="sr-only">
                  Search workspace destinations and supported actions.
                </p>
                <Input
                  ref={inputRef}
                  autoComplete="off"
                  aria-label="Search commands"
                  role="combobox"
                  aria-expanded="true"
                  aria-controls="command-palette-listbox"
                  aria-activedescendant={
                    filteredCommands[selectedIndex]
                      ? `command-palette-option-${filteredCommands[selectedIndex].id}`
                      : undefined
                  }
                  aria-autocomplete="list"
                  placeholder="Search workspace or wire an agent…"
                  className="h-8 border-none bg-transparent px-0 py-0 text-sm shadow-none focus-visible:ring-0"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  onKeyDown={onSearchKeyDown}
                />
              </div>
              <kbd className="hidden rounded-[var(--radius-sm)] border border-border bg-secondary px-1.5 py-0.5 font-mono text-[var(--wireline-typography-overline-size)] font-semibold tracking-[0.08em] text-muted-foreground sm:inline-flex">
                ESC
              </kbd>
              <Button
                ref={closeButtonRef}
                type="button"
                variant="ghost"
                size="icon"
                aria-label="Close command palette"
                onClick={close}
                className="size-8 min-h-8 min-w-8"
              >
                <X aria-hidden="true" className="size-4" />
              </Button>
            </div>

            <div className="max-h-[min(60dvh,32rem)] min-h-0">
              <ScrollArea className="max-h-[min(60dvh,32rem)]">
                {filteredCommands.length ? (
                  <div
                    id="command-palette-listbox"
                    role="listbox"
                    aria-label="Command results"
                    className="p-2 sm:p-3"
                  >
                    {COMMAND_CATEGORIES.map((category) => {
                      const commands = filteredCommands.filter(
                        (command) => command.category === category,
                      );
                      if (!commands.length) return null;
                      return (
                        <section key={category} className="mb-3 last:mb-0">
                          <p className="px-2 pb-1 pt-1 font-mono text-[var(--wireline-typography-overline-size)] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
                            {category}
                          </p>
                          <div className="space-y-1">
                            {commands.map((command) => {
                              const index = filteredCommands.indexOf(command);
                              const selected = index === selectedIndex;
                              const Icon = command.icon;
                              return (
                                <Button
                                  key={command.id}
                                  id={`command-palette-option-${command.id}`}
                                  type="button"
                                  variant="ghost"
                                  role="option"
                                  aria-selected={selected}
                                  tabIndex={-1}
                                  ref={(node) => {
                                    optionRefs.current[index] = node;
                                  }}
                                  onClick={() => execute(command)}
                                  onMouseEnter={() => setSelectedIndex(index)}
                                  className={cn(
                                    "h-auto w-full justify-start gap-3 rounded-[var(--radius-md)] px-3 py-3 text-left",
                                    selected
                                      ? "bg-primary/10 text-foreground"
                                      : "hover:bg-secondary",
                                  )}
                                >
                                  <span
                                    className={cn(
                                      "grid size-8 shrink-0 place-items-center rounded-[var(--radius-md)] border",
                                      selected
                                        ? "border-primary/20 bg-primary/10 text-primary"
                                        : "border-border bg-card text-muted-foreground",
                                    )}
                                  >
                                    <Icon aria-hidden="true" className="size-4" />
                                  </span>
                                  <span className="min-w-0 flex-1">
                                    <span className="block text-sm font-semibold leading-5 text-foreground">
                                      {command.label}
                                    </span>
                                    <span className="mt-0.5 block truncate text-xs leading-5 text-muted-foreground">
                                      {command.description}
                                    </span>
                                  </span>
                                  <ChevronRight
                                    aria-hidden="true"
                                    className={cn(
                                      "size-4 shrink-0",
                                      selected ? "text-primary" : "text-muted-foreground",
                                    )}
                                  />
                                </Button>
                              );
                            })}
                          </div>
                        </section>
                      );
                    })}
                  </div>
                ) : (
                  <EmptyState
                    density="compact"
                    className="m-4 min-h-48 border-dashed"
                    icon={<Terminal className="size-5" />}
                    title="No matching commands."
                    description="Try a workspace destination, agent, integration, or setting."
                  />
                )}
              </ScrollArea>
            </div>

            <footer className="flex items-center justify-between gap-3 border-t border-border bg-secondary/40 px-4 py-2.5 sm:px-5">
              <p className="text-xs text-muted-foreground">
                <span className="font-mono text-[var(--wireline-typography-overline-size)] font-semibold tracking-[0.08em]">
                  ↑↓
                </span>{" "}
                Navigate ·{" "}
                <span className="font-mono text-[var(--wireline-typography-overline-size)] font-semibold tracking-[0.08em]">
                  ↵
                </span>{" "}
                Open
              </p>
              <p className="font-mono text-[var(--wireline-typography-overline-size)] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
                Wireline
              </p>
            </footer>
          </motion.div>
        </div>
      ) : null}
    </AnimatePresence>
  );
}
