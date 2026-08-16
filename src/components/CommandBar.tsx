import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import {
  BarChart3,
  Bot,
  BriefcaseBusiness,
  Cable,
  CheckSquare,
  ChevronRight,
  CreditCard,
  Database,
  Inbox,
  LayoutDashboard,
  MonitorDown,
  Phone,
  Search,
  Settings,
  Sparkles,
  Terminal,
  UsersRound,
  WandSparkles,
  X,
  type LucideIcon,
} from "lucide-react";
import { useNavigate } from "react-router";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { cn } from "../lib/utils";
import { useBodyScrollLock } from "../lib/use-body-scroll-lock";
import { useModalFocusTrap } from "../lib/use-modal-focus-trap";
import { Button, EmptyState, Input } from "./atoms";
import { ScrollArea } from "./ui/shadcn/ScrollArea";
import { APP_KEYBOARD_SHORTCUTS } from "../constants/navigation";
import { useAccount } from "../contexts/AccountContext";
import { isRouteAvailableForAccount } from "../lib/account-type";
import { customerAgentLanguage } from "../lib/product-copy";

type CommandCategory = "Workspace" | "Create" | "Manage";

type CommandItem = {
  id: string;
  label: string;
  keywords: string;
  icon: LucideIcon;
  href: string;
  category: CommandCategory;
};

const COMMAND_CATEGORIES: readonly CommandCategory[] = ["Workspace", "Create", "Manage"];

const WORKSPACE_COMMANDS: readonly CommandItem[] = [
  {
    id: "overview",
    label: "Overview",
    keywords: "home dashboard status state",
    icon: LayoutDashboard,
    href: "/overview",
    category: "Workspace",
  },
  {
    id: "agents",
    label: "Agent Studio",
    keywords: "studio agents voice manage live",
    icon: Bot,
    href: "/studio",
    category: "Workspace",
  },
  {
    id: "knowledge",
    label: "Knowledge",
    keywords: "facts context sources policies",
    icon: Database,
    href: "/knowledge",
    category: "Workspace",
  },
  {
    id: "connections",
    label: "Connections",
    keywords: "accounts integrations tools actions",
    icon: Cable,
    href: "/connections",
    category: "Workspace",
  },
  {
    id: "inbox",
    label: "Inbox",
    keywords: "conversations outcomes handoffs",
    icon: Inbox,
    href: "/inbox",
    category: "Workspace",
  },
  {
    id: "phone",
    // "Calls" everywhere: the rail, page titles, and the authenticated 404 all
    // name /phone "Calls" (constants/navigation.ts) — the palette must match.
    label: "Calls",
    keywords: "phone calls history outbound campaigns appointments",
    icon: Phone,
    href: "/phone",
    category: "Workspace",
  },
  {
    id: "approvals",
    label: "Approvals",
    keywords: "review post-call actions",
    icon: CheckSquare,
    href: "/approvals",
    category: "Workspace",
  },
  {
    id: "insights",
    label: "Activity",
    keywords: "insights performance quality revenue",
    icon: BarChart3,
    href: "/insights",
    category: "Workspace",
  },
  {
    id: "settings",
    label: "Settings",
    keywords: "workspace billing team apps",
    icon: Settings,
    href: "/settings",
    category: "Workspace",
  },
  {
    id: "create-personal",
    label: "Create a personal agent",
    keywords: "create personal focused job train",
    icon: Sparkles,
    href: "/studio?create=1&posture=personal",
    category: "Create",
  },
  {
    id: "create-business",
    label: "Create a business voice agent",
    keywords: "create business customer job",
    icon: BriefcaseBusiness,
    href: "/studio?create=1&posture=business",
    category: "Create",
  },
  {
    id: "create-brief",
    label: "Open a new Studio brief",
    keywords: "create new agent setup studio",
    icon: WandSparkles,
    href: "/studio?create=1",
    category: "Create",
  },
  {
    id: "billing",
    label: "Billing and usage",
    keywords: "plan runtime balance invoices payment usage",
    icon: CreditCard,
    href: "/settings/billing",
    category: "Manage",
  },
  {
    id: "team",
    label: "Team",
    keywords: "invite collaborators access",
    icon: UsersRound,
    href: "/settings/team",
    category: "Manage",
  },
  {
    id: "client-apps",
    label: "Companion surfaces",
    keywords: "command mcp mobile web waitlist apps",
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
  const { accountType } = useAccount();
  const reduceMotion = useReducedMotion();
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const pendingGoRef = useRef(false);
  const goTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useBodyScrollLock(isOpen);

  const filteredCommands = useMemo(() => {
    // The palette must offer the same surface set as the rail: an unfiltered
    // list pushed personal accounts to business-only pages (Activity) where no
    // nav entry exists and there is no way back.
    const language = customerAgentLanguage(accountType);
    const available = WORKSPACE_COMMANDS.filter((command) =>
      isRouteAvailableForAccount(accountType, command.href),
    ).map((command) =>
      command.id === "agents" ? { ...command, label: language.navLabel } : command,
    );
    const term = query.trim().toLocaleLowerCase();
    if (!term) return available;
    return available.filter((command) =>
      [command.label, command.keywords, command.category]
        .join(" ")
        .toLocaleLowerCase()
        .includes(term),
    );
  }, [accountType, query]);

  const close = useCallback(() => {
    setIsOpen(false);
    setQuery("");
  }, []);

  useModalFocusTrap(dialogRef, { active: isOpen, onEscape: close });

  const execute = useCallback(
    (command: CommandItem) => {
      navigate(command.href);
      close();
    },
    [close, navigate],
  );

  useEffect(() => {
    const clearGoPending = () => {
      pendingGoRef.current = false;
      if (goTimeoutRef.current) {
        clearTimeout(goTimeoutRef.current);
        goTimeoutRef.current = null;
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      const isCommandShortcut =
        (event.metaKey || event.ctrlKey) && event.key.toLocaleLowerCase() === "k";
      if (isCommandShortcut) {
        if (!isOpen && isTextEntryTarget(event.target)) return;
        event.preventDefault();
        clearGoPending();
        if (isOpen) close();
        else setIsOpen(true);
        return;
      }
      // Chord: g then <key> navigates using APP_KEYBOARD_SHORTCUTS (when not typing).
      if (isOpen || isTextEntryTarget(event.target)) {
        clearGoPending();
        return;
      }
      if (event.metaKey || event.ctrlKey || event.altKey) return;

      const key = event.key.toLocaleLowerCase();
      if (key === "g" && !event.repeat && !pendingGoRef.current) {
        pendingGoRef.current = true;
        if (goTimeoutRef.current) clearTimeout(goTimeoutRef.current);
        goTimeoutRef.current = setTimeout(clearGoPending, 800);
        return;
      }
      if (pendingGoRef.current) {
        const href = APP_KEYBOARD_SHORTCUTS[key.toUpperCase()];
        clearGoPending();
        if (href) {
          event.preventDefault();
          navigate(href);
        }
      }
    };
    const handleOpen = () => setIsOpen(true);

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("wireline:open-command-bar", handleOpen);
    return () => {
      clearGoPending();
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("wireline:open-command-bar", handleOpen);
    };
  }, [close, isOpen, navigate]);

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
            ref={dialogRef}
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
            className="relative w-full max-w-2xl overflow-hidden rounded-[var(--radius-xl)] border border-border bg-card shadow-[var(--wireline-elevation-lg)]"
          >
            <div className="flex items-center gap-3 border-b border-border px-4 py-3 sm:px-5 sm:py-4">
              <Search aria-hidden="true" className="size-4 shrink-0 text-primary" />
              <div className="min-w-0 flex-1">
                <p id="command-palette-title" className="sr-only">
                  Wireline command palette
                </p>
                <p id="command-palette-description" className="sr-only">
                  Search destinations and actions.
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
                  placeholder="Search…"
                  className="h-8 border-none bg-transparent px-0 py-0 text-sm shadow-none focus-visible:ring-0"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  onKeyDown={onSearchKeyDown}
                />
              </div>
              <kbd className="hidden rounded-[var(--radius-sm)] border border-border bg-secondary px-1.5 py-0.5 font-mono text-[length:var(--wireline-typography-overline-size)] font-semibold tracking-[0.08em] text-muted-foreground sm:inline-flex">
                ESC
              </kbd>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label="Close command palette"
                onClick={close}
                className="size-11 min-h-11 min-w-11"
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
                          <p className="px-2 pb-1 pt-1 font-mono text-[length:var(--wireline-typography-overline-size)] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
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
                                    "h-auto min-h-11 w-full justify-start gap-3 rounded-[var(--radius-md)] px-3 py-2 text-left",
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
                                  <span className="min-w-0 flex-1 truncate text-sm font-semibold leading-5 text-foreground">
                                    {command.label}
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
                    title="No matches"
                  />
                )}
              </ScrollArea>
            </div>

            <footer className="flex items-center border-t border-border bg-secondary/40 px-4 py-2.5 sm:px-5">
              <p className="text-xs text-muted-foreground">
                <span className="font-mono text-[length:var(--wireline-typography-overline-size)] font-semibold tracking-[0.08em]">
                  ↑↓
                </span>{" "}
                Navigate ·{" "}
                <span className="font-mono text-[length:var(--wireline-typography-overline-size)] font-semibold tracking-[0.08em]">
                  ↵
                </span>{" "}
                Open
              </p>
            </footer>
          </motion.div>
        </div>
      ) : null}
    </AnimatePresence>
  );
}
