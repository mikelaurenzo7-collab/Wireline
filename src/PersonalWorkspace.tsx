import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  BrowserRouter,
  Link,
  Navigate,
  Route,
  Routes,
  useLocation,
  useNavigate,
} from "react-router-dom";
import {
  ArrowUpRight,
  Bell,
  CalendarClock,
  Car,
  Check,
  CheckCircle2,
  ChevronRight,
  Copy,
  CreditCard,
  Download,
  Globe,
  Link2,
  LogOut,
  Mail,
  Mic,
  MousePointerClick,
  Phone,
  PhoneCall,
  PhoneMissed,
  Search,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Tablet,
  Watch,
  Wand2,
  X,
  Zap,
} from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { useAuth } from "./contexts/AuthContext";
import { usePersistentState } from "./lib/use-persistent-state";
import {
  AskWirelineTile,
  AssistantHandoffTile,
  LockScreenAccessory,
  NeedsAttentionTile,
  PhoneMock,
  WalletTile,
} from "./components/personal/widget-previews";
import {
  ALL_INTENTS,
  APP_DISTRIBUTION,
  DEEP_LINKS,
  FAST_TRIGGERS,
  INTENT_GROUPS,
  PLATFORMS,
  SIRI_PHRASES,
  WIDGETS,
  type FastTrigger,
  type IntentSpec,
  type PlatformSpec,
} from "./data/personal-mobile";

const nav = [
  ["Home", "/app/personal"],
  ["Assistant", "/app/personal/assistant"],
  ["Automations", "/app/personal/automations"],
  ["Siri & Shortcuts", "/app/personal/siri"],
  ["Devices", "/app/personal/devices"],
  ["Get the app", "/app/personal/download"],
  ["Number", "/app/personal/number"],
  ["Activity", "/app/personal/activity"],
  ["Settings", "/app/personal/settings"],
] as const;

const models = [
  ["Grok 4.3", "Default", "Fast, capable, low-cost default for everyday phone work."],
  ["Gemini Flash", "Fast", "Best for quick errands, simple summaries, and lightweight routing."],
  ["Claude Sonnet", "Careful", "Best for polished wording, sensitive replies, and nuanced calls."],
  [
    "GPT-5.5 Thinking",
    "Deep",
    "Best for complex planning, multi-step decisions, and high-trust workflows.",
  ],
  ["Auto route", "Smart", "Wireline chooses the best model by task, urgency, and cost."],
];

const activityRows = [
  ["Office", "Appointment confirmed for Thursday at 2 PM", "Done"],
  ["Unknown caller", "Blocked and archived", "Done"],
  ["Pharmacy", "Prescription ready before 6 PM", "Needs pickup"],
  ["Support", "Refund still needs follow-up", "Open"],
];

const cx = (...parts: Array<string | false | null | undefined>) => parts.filter(Boolean).join(" ");

/* -------------------------------------------------------------------------- */
/* Primitives                                                                 */
/* -------------------------------------------------------------------------- */

function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <section
      className={cx(
        "wl-premium-card p-5 transition-all duration-300 hover:-translate-y-0.5 sm:p-6 lg:p-7",
        className,
      )}
    >
      {children}
    </section>
  );
}

/** Midnight status tones: live=mint, setup=amber, beta=iris, roadmap=muted. */
function statusTone(value: string): string {
  switch (value) {
    case "Live":
    case "Done":
    case "Ready":
      return "border-mint/25 bg-mint/10 text-mint";
    case "Setup":
    case "Configure":
    case "Open":
    case "Needs pickup":
      return "border-amber/25 bg-amber/10 text-amber";
    case "Beta":
      return "border-brand/30 bg-brand/10 text-brand-bright";
    default: // Roadmap, Manual, Entitlement gated, …
      return "border-border bg-white/[0.03] text-muted-foreground";
  }
}

function Status({ value }: { value: string }) {
  return (
    <span
      className={cx(
        "inline-flex shrink-0 items-center rounded-full border px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.12em]",
        statusTone(value),
      )}
    >
      {value}
    </span>
  );
}

const SURFACE_LABEL: Record<string, string> = {
  App: "App",
  Siri: "Siri",
  Widget: "Widget",
  "Action Button": "Action Button",
  "Back Tap": "Back Tap",
  "Control Center": "Control Center",
  Spotlight: "Spotlight",
  CallKit: "CallKit",
  CarPlay: "CarPlay",
  Contacts: "Contacts",
  Calendar: "Calendar",
  Watch: "Watch",
  Android: "Android",
};

function SurfaceChips({ surfaces }: { surfaces: readonly string[] }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {surfaces.map((s) => (
        <span
          key={s}
          className="rounded-md border border-border bg-background px-2 py-0.5 text-[10px] font-medium text-muted-foreground"
        >
          {SURFACE_LABEL[s] ?? s}
        </span>
      ))}
    </div>
  );
}

/** Copy-to-clipboard chip with local "Copied" feedback (no global toast dep). */
function CopyPhrase({ phrase }: { phrase: string }) {
  const [copied, setCopied] = useState(false);
  const onCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(phrase);
    } catch {
      /* clipboard may be blocked; the visual feedback still confirms intent */
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  }, [phrase]);
  return (
    <button
      type="button"
      onClick={onCopy}
      aria-label={`Copy phrase: ${phrase}`}
      className="touch-press group flex w-full items-center justify-between gap-3 rounded-[12px] border border-border bg-background px-3 py-2 text-left text-sm transition-colors hover:border-brand/30 hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <span className="min-w-0 truncate text-foreground">
        <span className="text-muted-foreground">&ldquo;</span>
        {phrase}
        <span className="text-muted-foreground">&rdquo;</span>
      </span>
      <span
        className={cx(
          "flex shrink-0 items-center gap-1 text-[11px] font-semibold",
          copied ? "text-mint" : "text-muted-foreground group-hover:text-brand-bright",
        )}
      >
        {copied ? <Check size={13} /> : <Copy size={13} />}
        {copied ? "Copied" : "Copy"}
      </span>
    </button>
  );
}

/** Accessible guide sheet (modal) for step-by-step device / trigger setup. */
function GuideSheet({
  open,
  onClose,
  title,
  eyebrow,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  eyebrow?: string;
  children: ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-[120] flex items-end justify-center bg-black/70 p-0 backdrop-blur-sm sm:items-center sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onClick={onClose}
    >
      <div
        className="wl-panel-elevated max-h-[88vh] w-full max-w-lg overflow-y-auto rounded-b-none rounded-t-[24px] p-6 sm:rounded-[24px] sm:p-7"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            {eyebrow && <div className="wl-label mb-2">{eyebrow}</div>}
            <h2 className="wl-title text-2xl text-foreground">{title}</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="touch-press grid h-9 w-9 shrink-0 place-items-center rounded-full border border-border bg-background text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <X size={16} />
          </button>
        </div>
        <div className="mt-5">{children}</div>
      </div>
    </div>
  );
}

function StepList({ steps }: { steps: string[] }) {
  return (
    <ol className="space-y-3">
      {steps.map((step, i) => (
        <li key={step} className="flex items-start gap-3 text-sm leading-6 text-foreground">
          <span className="wl-numeral grid h-6 w-6 shrink-0 place-items-center rounded-full bg-brand/15 text-[12px] font-bold text-brand-bright">
            {i + 1}
          </span>
          <span className="text-muted-foreground">{step}</span>
        </li>
      ))}
    </ol>
  );
}

/** Accessible on/off switch (aria-checked); iris when on. */
function Switch({ on, onToggle, label }: { on: boolean; onToggle: () => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={onToggle}
      className={cx(
        "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        on ? "bg-brand" : "bg-white/10",
      )}
    >
      <span
        className={cx(
          "inline-block h-[18px] w-[18px] transform rounded-full bg-white shadow transition-transform duration-200",
          on ? "translate-x-[22px]" : "translate-x-[3px]",
        )}
      />
    </button>
  );
}

/** Custom model picker (card grid) — persists the choice across sessions. */
function ModelPicker({ value, onChange }: { value: string; onChange: (next: string) => void }) {
  return (
    <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
      {models.map(([name, tone, blurb]) => {
        const active = name === value;
        return (
          <button
            key={name}
            type="button"
            onClick={() => onChange(name)}
            aria-pressed={active}
            className={cx(
              "touch-press flex flex-col rounded-[16px] border p-3 text-left transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              active
                ? "border-brand/60 bg-brand/10"
                : "border-border bg-background hover:border-brand/30 hover:bg-accent",
            )}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-semibold text-foreground">{name}</span>
              <span
                className={cx(
                  "rounded-full border px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.12em]",
                  active
                    ? "border-brand/40 bg-brand/15 text-brand-bright"
                    : "border-border text-muted-foreground",
                )}
              >
                {tone}
              </span>
            </div>
            <span className="mt-2 text-xs leading-5 text-muted-foreground">{blurb}</span>
            {active && (
              <span className="mt-2 inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-[0.12em] text-mint">
                <Check size={11} /> Selected
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Shell + nav                                                                */
/* -------------------------------------------------------------------------- */

function RequirePersonal({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading)
    return (
      <div className="grid min-h-screen place-items-center bg-background">
        <Sparkles className="h-5 w-5 animate-pulse text-brand" />
      </div>
    );
  if (!user)
    return <Navigate to={`/signin?redirect=${encodeURIComponent(location.pathname)}`} replace />;
  return <>{children}</>;
}

function Shell({ children }: { children: ReactNode }) {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, signOut } = useAuth();
  const isActive = (path: string) =>
    path === "/app/personal"
      ? location.pathname === path
      : location.pathname === path ||
        (path.endsWith("automations") && location.pathname.endsWith("intents"));
  return (
    <div className="wl-grain min-h-screen w-full max-w-[100vw] overflow-x-hidden text-foreground">
      <header className="sticky top-0 z-40 border-b border-border bg-background/70 backdrop-blur-2xl">
        <div className="mx-auto flex h-16 max-w-[1500px] items-center justify-between px-4 sm:px-6 lg:px-8">
          <Link
            to="/"
            className="inline-flex items-center gap-2.5 transition-opacity hover:opacity-80"
          >
            <span className="grid h-8 w-8 place-items-center rounded-[10px] bg-brand font-display text-paper-deep">
              W
            </span>
            <span className="font-display text-[20px] font-semibold tracking-[-0.03em] text-foreground">
              Wireline
            </span>
          </Link>
          <div className="flex items-center gap-3">
            <span className="hidden rounded-full border border-brand/25 bg-brand/10 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-brand-bright sm:inline-flex">
              Personal workspace
            </span>
            <button className="grid h-9 w-9 place-items-center rounded-full bg-brand font-display text-paper-deep transition-all hover:brightness-110 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background">
              {user?.email?.[0]?.toUpperCase() ?? "W"}
            </button>
            <button
              onClick={() => {
                void signOut();
                navigate("/");
              }}
              className="rounded-md p-1 text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              aria-label="Sign out"
            >
              <LogOut size={17} />
            </button>
          </div>
        </div>
        <nav className="mx-auto flex max-w-[1500px] gap-1 overflow-x-auto px-3 pb-3 sm:px-6 lg:px-8">
          {nav.map(([label, path]) => (
            <Link
              key={path}
              to={path}
              className={cx(
                "touch-press flex shrink-0 items-center gap-2 rounded-full px-3 py-2 text-[13px] font-semibold transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                isActive(path)
                  ? "bg-brand text-paper-deep shadow-[0_8px_24px_-12px_var(--iris)]"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground",
              )}
            >
              {label}
            </Link>
          ))}
        </nav>
      </header>
      <main className="mx-auto w-full max-w-[1500px] px-4 py-8 sm:px-6 lg:px-10 lg:py-12 xl:px-12 xl:py-16">
        {children}
      </main>
    </div>
  );
}

function PageHeader({
  icon: Icon,
  eyebrow,
  title,
  text,
}: {
  icon: typeof Sparkles;
  eyebrow: string;
  title: string;
  text?: string;
}) {
  return (
    <div>
      <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-brand-bright">
        <Icon size={13} /> {eyebrow}
      </div>
      <h1 className="wl-title mt-4 text-4xl text-foreground sm:text-5xl">{title}</h1>
      {text && <p className="mt-3 max-w-3xl text-sm leading-6 text-muted-foreground">{text}</p>}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Home                                                                       */
/* -------------------------------------------------------------------------- */

function ModelSelector({ expanded = false }: { expanded?: boolean }) {
  const [model, setModel] = usePersistentState<string>("model", models[0][0]);
  const selected = models.find((item) => item[0] === model) ?? models[0];
  return (
    <Card>
      <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-brand-bright">
        <Sparkles size={13} /> Model selector
      </div>
      <div className="mt-4 flex items-start justify-between gap-4">
        <div>
          <h2 className="wl-title text-2xl text-foreground">Assistant model</h2>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            Choose the default model for personal calls, summaries, and automations.
          </p>
        </div>
        <Status value={selected[1]} />
      </div>
      {expanded ? (
        <div className="mt-5">
          <ModelPicker value={model} onChange={setModel} />
        </div>
      ) : (
        <>
          <select
            value={model}
            onChange={(e) => setModel(e.target.value)}
            aria-label="Assistant model"
            className="mt-5 h-12 w-full rounded-[14px] border border-input bg-background px-3 text-sm font-semibold text-foreground outline-none transition-colors hover:border-brand/40 focus:border-brand focus:ring-1 focus:ring-ring"
          >
            {models.map(([name]) => (
              <option key={name}>{name}</option>
            ))}
          </select>
          <p className="mt-3 rounded-[14px] border border-border bg-background p-3 text-sm leading-6 text-muted-foreground">
            {selected[2]}
          </p>
        </>
      )}
    </Card>
  );
}

function SetupRail() {
  const steps = [
    [
      "connect-number",
      "Connect number",
      "/app/personal/number",
      "Needed for callbacks and handoff",
    ],
    [
      "choose-model",
      "Choose model",
      "/app/personal/settings",
      "Default intelligence for personal work",
    ],
    [
      "enable-automations",
      "Enable automations",
      "/app/personal/automations",
      "Pick call jobs and confirmations",
    ],
    ["setup-siri", "Set up Siri", "/app/personal/siri", "Hands-free phrases for every job"],
    ["get-app", "Get the app", "/app/personal/download", "iPhone, widgets, CarPlay, Android"],
  ] as const;
  const [done, setDone] = usePersistentState<string[]>("setup-done", []);
  const completed = steps.filter((s) => done.includes(s[0])).length;
  const pct = Math.round((completed / steps.length) * 100);
  const toggle = (id: string) =>
    setDone((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  return (
    <Card className="border-brand/30">
      <div className="flex items-center justify-between gap-3">
        <div className="text-[11px] font-bold uppercase tracking-[0.14em] text-brand-bright">
          Setup path
        </div>
        <span className="font-mono text-[11px] text-muted-foreground">
          {completed}/{steps.length} done
        </span>
      </div>
      <h2 className="wl-title mt-4 text-2xl text-foreground">
        Make Assistant useful in five steps.
      </h2>
      <div
        className="mt-4 h-1.5 w-full overflow-hidden rounded-full bg-white/10"
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="Setup progress"
      >
        <div
          className="h-full rounded-full bg-brand transition-all duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="mt-5 space-y-3">
        {steps.map(([id, title, path, note], index) => {
          const isDone = done.includes(id);
          return (
            <div
              key={id}
              className={cx(
                "group flex items-center gap-3 rounded-[16px] border p-3 text-sm transition-all duration-200",
                isDone
                  ? "border-mint/25 bg-mint/[0.06]"
                  : "border-border bg-background hover:border-brand/30 hover:bg-accent",
              )}
            >
              <button
                type="button"
                onClick={() => toggle(id)}
                aria-pressed={isDone}
                aria-label={isDone ? `Mark ${title} not done` : `Mark ${title} done`}
                className={cx(
                  "grid h-8 w-8 shrink-0 place-items-center rounded-full font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  isDone ? "bg-mint text-paper-deep" : "bg-brand text-paper-deep",
                )}
              >
                {isDone ? <Check size={15} /> : index + 1}
              </button>
              <Link to={path} className="min-w-0 flex-1 focus-visible:outline-none">
                <span
                  className={cx(
                    "block font-semibold",
                    isDone ? "text-muted-foreground line-through" : "text-foreground",
                  )}
                >
                  {title}
                </span>
                <span className="block text-xs leading-5 text-muted-foreground">{note}</span>
              </Link>
              <Link to={path} aria-label={`Open ${title}`}>
                <ChevronRight
                  size={15}
                  className="text-muted-foreground transition-transform group-hover:translate-x-1"
                />
              </Link>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

function HomeView() {
  return (
    <div className="grid gap-6 xl:grid-cols-[1.25fr_.75fr]">
      <div className="space-y-6">
        <Card className="p-6 sm:p-8">
          <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-brand-bright">
            <Sparkles size={13} /> Personal call concierge
          </div>
          <h1 className="wl-title mt-5 max-w-4xl text-4xl text-foreground sm:text-5xl">
            Assistant handles routine phone work for you.
          </h1>
          <p className="mt-4 max-w-2xl text-[15px] leading-7 text-muted-foreground">
            One Assistant screens calls, places calls, waits on hold, summarizes outcomes, and tells
            you what needs attention. Siri, widgets, and CarPlay are launch surfaces for the same
            Assistant.
          </p>
          <div className="mt-6 grid gap-3 sm:grid-cols-3">
            {(
              [
                [
                  "3",
                  "unknown callers blocked",
                  PhoneMissed,
                  "text-brand-bright",
                  "border-brand/25",
                ],
                ["1", "appointment confirmed", CalendarClock, "text-mint", "border-mint/25"],
                ["2", "follow-ups open", Bell, "text-amber", "border-amber/25"],
              ] as const
            ).map(([value, label, Icon, tone, ring]) => (
              <div
                key={label}
                className={cx(
                  "rounded-[16px] border bg-background p-4 transition-colors hover:bg-accent",
                  ring,
                )}
              >
                <Icon size={16} className={tone} />
                <p className={cx("wl-numeral mt-2 font-display text-3xl", tone)}>{value}</p>
                <p className="mt-1 text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
                  {label}
                </p>
              </div>
            ))}
          </div>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link
              to="/app/personal/assistant"
              className="touch-press rounded-[14px] bg-brand px-5 py-3 text-sm font-semibold text-paper-deep transition-all duration-200 hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            >
              Open Assistant
            </Link>
            <Link
              to="/app/personal/automations"
              className="touch-press rounded-[14px] border border-border bg-background px-5 py-3 text-sm font-semibold text-foreground transition-all duration-200 hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              Tune automations
            </Link>
          </div>
        </Card>
        <ActivityView compact />
      </div>
      <div className="space-y-6">
        <SetupRail />
        <WidgetShowcaseCard />
      </div>
    </div>
  );
}

function WidgetShowcaseCard() {
  return (
    <Card>
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-brand-bright">
          <Smartphone size={13} /> On your phone
        </div>
        <Link
          to="/app/personal/devices"
          className="text-sm font-semibold text-brand-bright transition-colors hover:underline"
        >
          See all
        </Link>
      </div>
      <p className="mt-3 text-sm leading-6 text-muted-foreground">
        The same Assistant, one tap from your Home and Lock Screen.
      </p>
      <div className="mt-5 flex flex-wrap items-start justify-center gap-4">
        <AskWirelineTile />
        <NeedsAttentionTile count={2} />
      </div>
    </Card>
  );
}

/* -------------------------------------------------------------------------- */
/* Assistant                                                                  */
/* -------------------------------------------------------------------------- */

type ChatMsg = { from: "assistant" | "user"; text: string };

/** Canned-but-contextual reply so the composer feels alive (no backend). */
function assistantReply(input: string): string {
  const t = input.toLowerCase();
  if (t.includes("attention"))
    return "Two follow-ups are open: a pharmacy pickup before 6 PM and a refund from Support. Want me to chase the refund?";
  if (t.includes("hold"))
    return "I'll call and wait on hold, then ring you back the moment a human picks up. Which number should I call?";
  if (t.includes("missed"))
    return "Your last relevant missed call was the dentist at 1:12 PM. I can call them back and confirm your appointment — sound good?";
  if (t.includes("summar"))
    return "Your last call (Office, 2:04 PM): appointment confirmed for Thursday 2 PM. No action needed.";
  if (t.includes("pharmac") || t.includes("prescription"))
    return "I'll call the pharmacy, check if it's ready, and report back. I won't share any personal details without asking first.";
  if (t.includes("call") || t.includes("dial"))
    return "On it. I'll keep it brief, confirm before anything costs money or books a time, and report back with the outcome.";
  return "Got it. I'll handle that and report back — and I'll always ask before anything irreversible.";
}

function AssistantView() {
  const [messages, setMessages] = useState<ChatMsg[]>([
    {
      from: "assistant",
      text: "I reviewed your calls. One appointment is confirmed and three unknown callers were blocked.",
    },
  ]);
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  const send = useCallback((raw: string) => {
    const text = raw.trim();
    if (!text) return;
    setMessages((prev) => [...prev, { from: "user", text }]);
    setInput("");
    window.setTimeout(() => {
      setMessages((prev) => [...prev, { from: "assistant", text: assistantReply(text) }]);
    }, 450);
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  return (
    <div className="mx-auto flex min-h-[calc(100vh-9rem)] w-full max-w-5xl flex-col">
      <PageHeader
        icon={Sparkles}
        eyebrow="Assistant"
        title="Tell Assistant what phone work to handle."
        text="No named persona. Assistant is where you ask, review, approve, and hand off."
      />
      <Card className="mt-6 flex flex-1 flex-col">
        <div ref={scrollRef} className="scroll-viewport max-h-[46vh] space-y-4 pr-1">
          {messages.map((m, i) => (
            <div
              key={i}
              className={cx(
                "max-w-[86%] rounded-[16px] p-4 text-sm leading-6",
                m.from === "assistant"
                  ? "border border-border bg-background"
                  : "ml-auto bg-brand text-paper-deep",
              )}
            >
              {m.text}
            </div>
          ))}
        </div>
        <div className="mt-5 flex flex-wrap gap-2">
          {[
            "What needs attention?",
            "Wait on hold",
            "Call back missed call",
            "Summarize last call",
          ].map((item) => (
            <button
              key={item}
              onClick={() => send(item)}
              className="touch-press rounded-full border border-border bg-background px-3 py-1.5 text-xs font-semibold text-muted-foreground transition-all duration-200 hover:border-brand/30 hover:bg-accent hover:text-brand-bright focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {item}
            </button>
          ))}
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            send(input);
          }}
          className="mt-5 flex items-center gap-3 rounded-[16px] border border-border bg-background px-3 py-2 transition-colors focus-within:border-brand/50 focus-within:ring-1 focus-within:ring-ring"
        >
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            aria-label="Ask Assistant"
            className="min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground/60"
            placeholder="Ask Assistant to call, screen, summarize, wait on hold…"
          />
          <button
            type="submit"
            className="touch-press rounded-full bg-brand px-4 py-2 text-sm font-semibold text-paper-deep transition-all duration-200 hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            Send
          </button>
        </form>
      </Card>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Automations (Intent catalog)                                               */
/* -------------------------------------------------------------------------- */

function IntentCard({
  intent,
  enabled,
  onToggle,
}: {
  intent: IntentSpec;
  enabled: boolean;
  onToggle: () => void;
}) {
  const roadmap = intent.status === "Roadmap";
  return (
    <Card className={cx("flex flex-col", !enabled && "opacity-75")}>
      <div className="flex items-start justify-between gap-3">
        <h3 className="wl-title text-xl text-foreground">{intent.title}</h3>
        <Status value={intent.status} />
      </div>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">{intent.summary}</p>
      <div className="mt-4 space-y-2">
        <CopyPhrase phrase={intent.phrases[0]} />
      </div>
      <div className="mt-4 flex flex-col gap-3 border-t border-border pt-4">
        <SurfaceChips surfaces={intent.surfaces} />
        {intent.guardrail && (
          <p className="flex items-start gap-2 text-xs leading-5 text-muted-foreground">
            <ShieldCheck size={13} className="mt-0.5 shrink-0 text-brand-bright" />
            {intent.guardrail}
          </p>
        )}
        <div className="flex items-center justify-between gap-3">
          <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground/80">
            {intent.opensApp ? "Opens app" : "Hands-free"}
            {intent.nativeIntent ? " · Native intent" : ""}
          </p>
          {roadmap ? (
            <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground/60">
              Coming soon
            </span>
          ) : (
            <span className="flex items-center gap-2">
              <span
                className={cx(
                  "text-[10px] font-bold uppercase tracking-[0.12em]",
                  enabled ? "text-mint" : "text-muted-foreground/70",
                )}
              >
                {enabled ? "On" : "Off"}
              </span>
              <Switch on={enabled} onToggle={onToggle} label={`Toggle ${intent.title}`} />
            </span>
          )}
        </div>
      </div>
    </Card>
  );
}

function AutomationsView() {
  // Default: every shipped (non-roadmap) job is on.
  const defaultOn = useMemo(
    () => ALL_INTENTS.filter((i) => i.status !== "Roadmap").map((i) => i.id),
    [],
  );
  const [enabled, setEnabled] = usePersistentState<string[]>("automations-on", defaultOn);
  const [query, setQuery] = useState("");

  const toggle = (id: string) =>
    setEnabled((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const q = query.trim().toLowerCase();
  const matches = (i: IntentSpec) =>
    !q ||
    i.title.toLowerCase().includes(q) ||
    i.summary.toLowerCase().includes(q) ||
    i.phrases.some((p) => p.toLowerCase().includes(q)) ||
    i.surfaces.some((s) => s.toLowerCase().includes(q));

  const onCount = ALL_INTENTS.filter(
    (i) => i.status !== "Roadmap" && enabled.includes(i.id),
  ).length;
  const total = ALL_INTENTS.filter((i) => i.status !== "Roadmap").length;

  return (
    <div className="space-y-8">
      <PageHeader
        icon={Wand2}
        eyebrow="Automations"
        title="One hub for calls, scheduling, and follow-up."
        text="Siri, widgets, shortcuts, and the app all launch the same Assistant. Enable a job here; choose the launch surface on Devices."
      />
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2 rounded-[14px] border border-border bg-background px-3 py-2 focus-within:border-brand/50 focus-within:ring-1 focus-within:ring-ring sm:w-80">
          <Search size={15} className="text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Search call jobs"
            placeholder="Search jobs, phrases, surfaces…"
            className="min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground/60"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery("")}
              aria-label="Clear search"
              className="text-muted-foreground hover:text-foreground"
            >
              <X size={14} />
            </button>
          )}
        </div>
        <span className="font-mono text-xs text-muted-foreground">
          {onCount}/{total} jobs enabled
        </span>
      </div>
      {INTENT_GROUPS.map((group) => {
        const visible = group.intents.filter(matches);
        if (visible.length === 0) return null;
        return (
          <section key={group.id} className="space-y-4">
            <div className="border-t border-border pt-5">
              <h2 className="wl-title text-2xl text-foreground">{group.name}</h2>
              <p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">
                {group.blurb}
              </p>
            </div>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {visible.map((intent) => (
                <IntentCard
                  key={intent.id}
                  intent={intent}
                  enabled={enabled.includes(intent.id)}
                  onToggle={() => toggle(intent.id)}
                />
              ))}
            </div>
          </section>
        );
      })}
      {q && !INTENT_GROUPS.some((g) => g.intents.some(matches)) && (
        <p className="rounded-[16px] border border-border bg-background p-6 text-center text-sm text-muted-foreground">
          No jobs match &ldquo;{query}&rdquo;.
        </p>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Siri & Shortcuts                                                           */
/* -------------------------------------------------------------------------- */

function SiriShortcutsView() {
  const [guide, setGuide] = useState<FastTrigger | null>(null);
  return (
    <div className="space-y-8">
      <PageHeader
        icon={Mic}
        eyebrow="Siri & Shortcuts"
        title="Say it once. Assistant handles the call."
        text="These phrases light up in Siri, Spotlight, and the Shortcuts app the moment you install Wireline — no setup required. Tap any phrase to copy it."
      />

      <section className="space-y-4">
        <div className="flex items-end justify-between gap-3 border-t border-border pt-5">
          <div>
            <h2 className="wl-title text-2xl text-foreground">Ready-made Siri phrases</h2>
            <p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">
              Auto-registered App Shortcuts — broad wording that maps to the same Assistant jobs.
            </p>
          </div>
          <Status value="Live" />
        </div>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {SIRI_PHRASES.map((row) => (
            <Card key={row.intentId} className="flex flex-col">
              <div className="flex items-center justify-between gap-3">
                <h3 className="wl-title text-lg text-foreground">{row.shortTitle}</h3>
                <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground/70">
                  Add to Siri
                </span>
              </div>
              <div className="mt-4 space-y-2">
                {row.phrases.map((phrase) => (
                  <CopyPhrase key={phrase} phrase={phrase} />
                ))}
              </div>
            </Card>
          ))}
        </div>
      </section>

      <section className="space-y-4">
        <div className="border-t border-border pt-5">
          <h2 className="wl-title text-2xl text-foreground">Fast triggers</h2>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">
            Wire a one-press path to &ldquo;Ask Wireline&rdquo;. Apple keeps these user-assigned —
            we can&rsquo;t claim your hardware buttons — so here&rsquo;s exactly how.
          </p>
        </div>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {FAST_TRIGGERS.map((trigger) => (
            <Card key={trigger.id} className="flex flex-col">
              <Zap className="text-brand-bright" size={20} />
              <h3 className="wl-title mt-4 text-lg text-foreground">{trigger.name}</h3>
              <p className="mt-2 flex-1 text-sm leading-6 text-muted-foreground">
                {trigger.detail}
              </p>
              <p className="mt-3 font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground/70">
                {trigger.availability}
              </p>
              <button
                type="button"
                onClick={() => setGuide(trigger)}
                className="touch-press mt-4 inline-flex w-fit items-center gap-1.5 rounded-[12px] border border-border bg-background px-3 py-2 text-sm font-semibold text-foreground transition-all duration-200 hover:border-brand/30 hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                Open guide <ArrowUpRight size={14} />
              </button>
            </Card>
          ))}
        </div>
      </section>

      <GuideSheet
        open={guide !== null}
        onClose={() => setGuide(null)}
        eyebrow="Setup guide"
        title={guide ? `Set up ${guide.name}` : ""}
      >
        {guide && (
          <div className="space-y-5">
            <p className="text-sm leading-6 text-muted-foreground">{guide.detail}</p>
            <StepList steps={guide.steps} />
            <div className="flex items-center gap-2 rounded-[14px] border border-brand/25 bg-brand/10 p-3 text-xs leading-5 text-brand-bright">
              <MousePointerClick size={14} className="shrink-0" />
              Once assigned, the trigger opens the same &ldquo;Ask Wireline&rdquo; surface as Siri
              and the widget.
            </div>
          </div>
        )}
      </GuideSheet>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Devices                                                                    */
/* -------------------------------------------------------------------------- */

type DeviceGuide = { title: string; detail: string; steps: string[] };

function DevicesView() {
  const [guide, setGuide] = useState<DeviceGuide | null>(null);

  const widgetGuide = (name: string): DeviceGuide => ({
    title: `Add the ${name} widget`,
    detail: "Widgets put Assistant one tap from your Home or Lock Screen.",
    steps: [
      "Touch and hold an empty area of the Home or Lock Screen.",
      "Tap Edit, then the + (Add Widget) button.",
      "Search for Wireline and pick a widget size.",
      `Choose the ${name} widget and tap Add.`,
    ],
  });

  const carPlayGuide: DeviceGuide = {
    title: "CarPlay scope",
    detail:
      "CarPlay stays deliberately minimal so it's safe to use while driving — and to fit Apple's Communication category.",
    steps: [
      "Call a recent number back from a glanceable list.",
      "Hand an active call to Assistant without touching the phone.",
      "See which lines are active — no dashboards, setup, or free-form reading in the car.",
    ],
  };

  return (
    <div className="space-y-8">
      <PageHeader
        icon={Smartphone}
        eyebrow="Devices"
        title="Every surface launches the same Assistant."
        text="Assistant is the brain, Automations are the jobs, Devices are the launch surfaces. Widgets and deep links are live; CarPlay activates with the communication entitlement."
      />

      <section className="space-y-5">
        <div>
          <h2 className="wl-title text-2xl text-foreground">Home &amp; Lock Screen widgets</h2>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">
            Glanceable, one-tap surfaces — exactly how they look on your phone.
          </p>
        </div>
        {/* Live preview gallery — pixel-faithful to the native Midnight widgets. */}
        <Card>
          <div className="flex flex-wrap items-start justify-center gap-6 py-2">
            <AskWirelineTile />
            <NeedsAttentionTile count={2} />
            <AssistantHandoffTile />
            <WalletTile />
            <LockScreenAccessory count={2} />
          </div>
        </Card>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {WIDGETS.map((widget) => {
            const Icon = WIDGET_ICON[widget.id] ?? Bell;
            return (
              <Card key={widget.id} className="flex flex-col">
                <Icon className="text-brand-bright" size={20} />
                <div className="mt-4 flex items-start justify-between gap-2">
                  <h3 className="wl-title text-lg text-foreground">{widget.name}</h3>
                  <Status value={widget.status} />
                </div>
                <p className="mt-2 flex-1 text-sm leading-6 text-muted-foreground">
                  {widget.detail}
                </p>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {widget.families.map((f) => (
                    <span
                      key={f}
                      className="rounded-md border border-border bg-background px-2 py-0.5 text-[10px] text-muted-foreground"
                    >
                      {f}
                    </span>
                  ))}
                </div>
                <code className="mt-3 block truncate rounded-[10px] border border-border bg-background px-2.5 py-1.5 font-mono text-[11px] text-brand-bright">
                  {widget.deepLink}
                </code>
                <button
                  type="button"
                  onClick={() => setGuide(widgetGuide(widget.name))}
                  className="touch-press mt-4 inline-flex w-fit items-center gap-1.5 rounded-[12px] border border-border bg-background px-3 py-2 text-sm font-semibold text-foreground transition-all duration-200 hover:border-brand/30 hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  Add widget <ArrowUpRight size={14} />
                </button>
              </Card>
            );
          })}
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="wl-title text-2xl text-foreground">Driving &amp; wearable</h2>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <Card className="flex flex-col">
            <Car className="text-brand-bright" size={20} />
            <div className="mt-4 flex items-start justify-between gap-2">
              <h3 className="wl-title text-lg text-foreground">CarPlay</h3>
              <Status value="Beta" />
            </div>
            <p className="mt-2 flex-1 text-sm leading-6 text-muted-foreground">
              Recent callbacks, active-call handoff, and line visibility only.
            </p>
            <button
              type="button"
              onClick={() => setGuide(carPlayGuide)}
              className="touch-press mt-4 inline-flex w-fit items-center gap-1.5 rounded-[12px] border border-border bg-background px-3 py-2 text-sm font-semibold text-foreground transition-all duration-200 hover:border-brand/30 hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              Review scope <ArrowUpRight size={14} />
            </button>
          </Card>
          <Card className="flex flex-col">
            <Watch className="text-brand-bright" size={20} />
            <div className="mt-4 flex items-start justify-between gap-2">
              <h3 className="wl-title text-lg text-foreground">Apple Watch</h3>
              <Status value="Roadmap" />
            </div>
            <p className="mt-2 flex-1 text-sm leading-6 text-muted-foreground">
              Glanceable Ask Wireline and take-this-call triggers, mirroring the same App Intents.
            </p>
          </Card>
          <Card className="flex flex-col">
            <Link2 className="text-brand-bright" size={20} />
            <div className="mt-4 flex items-start justify-between gap-2">
              <h3 className="wl-title text-lg text-foreground">Deep links</h3>
              <Status value="Live" />
            </div>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              Every widget, shortcut, and Control Center tile opens one of these routes.
            </p>
            <div className="mt-3 space-y-1.5">
              {DEEP_LINKS.map((d) => (
                <div key={d.url} className="flex items-center justify-between gap-2 text-xs">
                  <code className="font-mono text-brand-bright">{d.url}</code>
                  <span className="text-muted-foreground">{d.target}</span>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </section>

      <GuideSheet
        open={guide !== null}
        onClose={() => setGuide(null)}
        eyebrow="Setup guide"
        title={guide?.title ?? ""}
      >
        {guide && (
          <div className="space-y-5">
            <p className="text-sm leading-6 text-muted-foreground">{guide.detail}</p>
            <StepList steps={guide.steps} />
          </div>
        )}
      </GuideSheet>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Get the app                                                                */
/* -------------------------------------------------------------------------- */

const PLATFORM_ICON: Record<PlatformSpec["icon"], typeof Smartphone> = {
  iphone: Smartphone,
  watch: Watch,
  car: Car,
  tablet: Tablet,
  android: Smartphone,
  globe: Globe,
};

const WIDGET_ICON: Record<string, typeof Smartphone> = {
  "ask-wireline": Mic,
  "needs-attention": Bell,
  assistant: Sparkles,
  wallet: CreditCard,
};

function StoreBadge({
  store,
  status,
  detail,
  href,
}: {
  store: string;
  status: string;
  detail: string;
  href?: string | null;
}) {
  const live = Boolean(href);
  const inner = (
    <div
      className={cx(
        "flex items-center gap-3 rounded-[16px] border px-4 py-3 transition-all duration-200",
        live
          ? "touch-press border-brand/40 bg-brand/10 hover:bg-brand/15"
          : "cursor-default border-border bg-background opacity-90",
      )}
    >
      <Download size={22} className={live ? "text-brand-bright" : "text-muted-foreground"} />
      <div className="text-left">
        <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
          {detail}
        </div>
        <div className="font-display text-base font-semibold text-foreground">{store}</div>
      </div>
      <span className="ml-auto">
        <Status value={status} />
      </span>
    </div>
  );
  return href ? (
    <a href={href} target="_blank" rel="noreferrer" className="block focus-visible:outline-none">
      {inner}
    </a>
  ) : (
    inner
  );
}

function GetTheAppView() {
  const { ios, android, landing } = APP_DISTRIBUTION;
  return (
    <div className="space-y-8">
      <PageHeader
        icon={Download}
        eyebrow="Get the app"
        title="Put Assistant in your pocket."
        text="The native apps add Siri, widgets, CarPlay, and call handling on top of this control panel. They're in pre-launch — join the build and you'll be first in."
      />

      <div className="grid gap-6 lg:grid-cols-[1fr_.85fr_.55fr]">
        <Card className="p-6 sm:p-8">
          <div className="wl-label">Download</div>
          <h2 className="wl-title mt-3 text-2xl text-foreground">Choose your platform</h2>
          <div className="mt-5 space-y-3">
            <StoreBadge
              store="App Store"
              detail={ios.label}
              status={ios.status}
              href={ios.storeUrl}
            />
            <StoreBadge
              store="Google Play"
              detail={android.label}
              status={android.status}
              href={android.storeUrl}
            />
          </div>
          <div className="mt-5 flex flex-wrap gap-3">
            <a
              href={ios.testflightUrl}
              target="_blank"
              rel="noreferrer"
              className="touch-press inline-flex items-center gap-1.5 rounded-[14px] bg-brand px-5 py-3 text-sm font-semibold text-paper-deep transition-all duration-200 hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              Join the TestFlight <ArrowUpRight size={15} />
            </a>
            <a
              href="mailto:hello@trywireline.com?subject=Send%20me%20the%20Wireline%20app%20link"
              className="touch-press inline-flex items-center gap-1.5 rounded-[14px] border border-border bg-background px-5 py-3 text-sm font-semibold text-foreground transition-all duration-200 hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <Mail size={15} /> Email me the link
            </a>
          </div>
        </Card>

        <Card className="flex items-center justify-center p-6">
          <PhoneMock />
        </Card>

        <Card className="flex flex-col items-center justify-center p-6 text-center">
          <div className="rounded-[18px] bg-white p-3 shadow-[0_18px_40px_-22px_rgba(0,0,0,0.8)]">
            <QRCodeSVG
              value={landing}
              size={132}
              bgColor="#ffffff"
              fgColor="#0C0D11"
              level="M"
              aria-label={`QR code linking to ${landing}`}
            />
          </div>
          <p className="mt-4 text-sm font-semibold text-foreground">Scan to continue</p>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            Opens{" "}
            <span className="font-mono text-brand-bright">{landing.replace("https://", "")}</span>{" "}
            on your phone.
          </p>
        </Card>
      </div>

      <section className="space-y-4">
        <h2 className="wl-title text-2xl text-foreground">Where Assistant runs</h2>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {PLATFORMS.map((platform) => {
            const Icon = PLATFORM_ICON[platform.icon];
            return (
              <Card key={platform.id} className="flex flex-col">
                <div className="flex items-start justify-between gap-2">
                  <Icon className="text-brand-bright" size={22} />
                  <Status value={platform.status} />
                </div>
                <h3 className="wl-title mt-4 text-lg text-foreground">{platform.name}</h3>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">{platform.detail}</p>
              </Card>
            );
          })}
        </div>
      </section>

      <Card className="border-brand/30">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="wl-title text-xl text-foreground">
              {ALL_INTENTS.length} call jobs. One Assistant. Every surface.
            </h2>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">
              Set everything up here on the web — it&rsquo;s ready the moment the app installs.
            </p>
          </div>
          <Link
            to="/app/personal/siri"
            className="touch-press inline-flex w-fit shrink-0 items-center gap-1.5 rounded-[14px] border border-border bg-background px-5 py-3 text-sm font-semibold text-foreground transition-all duration-200 hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            Set up Siri phrases <ChevronRight size={15} />
          </Link>
        </div>
      </Card>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Number / Activity / Settings                                               */
/* -------------------------------------------------------------------------- */

function NumberView() {
  const items = [
    ["Wireline number", "Your personal relay line for callbacks and handoff", "Setup"],
    ["Callback number", "Where Assistant should reach you after hold or transfer", "Setup"],
    ["Call forwarding", "Send eligible incoming calls to Assistant", "Setup"],
    ["Allowed contacts", "Trusted people and sensitive-call exceptions", "Ready"],
  ];
  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
      <Card>
        <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-brand-bright">
          <Phone size={13} /> Number setup
        </div>
        <h1 className="wl-title mt-4 text-4xl text-foreground">Make handoff reliable.</h1>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">
          Assistant needs a callback number and forwarding setup before take-this-call,
          wait-on-hold, and CarPlay callbacks work cleanly.
        </p>
        <div className="mt-6 grid gap-4 md:grid-cols-2">
          {items.map(([label, detail, status]) => (
            <div key={label} className="rounded-[16px] border border-border bg-background p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold text-foreground">{label}</div>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">{detail}</p>
                </div>
                <Status value={status} />
              </div>
            </div>
          ))}
        </div>
      </Card>
      <Card className="border-brand/30">
        <PhoneCall className="text-brand-bright" />
        <h2 className="wl-title mt-4 text-2xl text-foreground">Handoff rule</h2>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">
          Assistant asks before transferring sensitive calls, committing money, canceling
          appointments, or sharing details.
        </p>
      </Card>
    </div>
  );
}

function ActivityView({ compact = false }: { compact?: boolean }) {
  if (compact) {
    return (
      <Card>
        <div className="flex items-center justify-between gap-3">
          <h2 className="wl-title text-2xl text-foreground">Activity</h2>
          <Link
            to="/app/personal/activity"
            className="text-sm font-semibold text-brand-bright transition-colors hover:underline"
          >
            Open all
          </Link>
        </div>
        <ActivityList limit={3} />
      </Card>
    );
  }
  return (
    <div className="space-y-6">
      <PageHeader
        icon={Bell}
        eyebrow="Activity"
        title="Everything Assistant handled."
        text="Outcomes, blocks, and follow-ups across every call surface."
      />
      <Card>
        <ActivityList />
      </Card>
    </div>
  );
}

function ActivityList({ limit }: { limit?: number }) {
  const rows = limit ? activityRows.slice(0, limit) : activityRows;
  return (
    <div className="mt-4 divide-y divide-border overflow-hidden rounded-[16px] border border-border">
      {rows.map(([who, result, status]) => (
        <div
          key={who}
          className="grid gap-2 bg-background p-4 text-sm transition-colors hover:bg-accent sm:grid-cols-[1fr_auto]"
        >
          <div>
            <p className="font-semibold text-foreground">{who}</p>
            <p className="mt-1 text-muted-foreground">{result}</p>
          </div>
          <Status value={status} />
        </div>
      ))}
    </div>
  );
}

const GUARDRAILS = [
  { id: "confirm-bookings", label: "Confirm bookings", on: true },
  { id: "confirm-cancellations", label: "Confirm cancellations", on: true },
  { id: "confirm-costs", label: "Confirm costs", on: true },
  { id: "lock-screen-summaries", label: "Short lock-screen summaries", on: true },
  { id: "open-app-sensitive", label: "Open app for sensitive details", on: true },
  { id: "report-before-next", label: "Report back before next action", on: false },
] as const;

const CONNECTORS: { name: string; provider: string | null; detail: string }[] = [
  { name: "Gmail", provider: "google", detail: "Email summaries + safe drafts" },
  { name: "Google Calendar", provider: "google", detail: "Appointment context" },
  { name: "Outlook", provider: "microsoft", detail: "Mail + 365 calendar" },
  { name: "Yahoo Mail", provider: "yahoo", detail: "Mail follow-up" },
  { name: "Contacts", provider: null, detail: "On-device — granted in the app" },
  { name: "Reminders", provider: null, detail: "On-device — granted in the app" },
];

function Connector({
  name,
  provider,
  detail,
}: {
  name: string;
  provider: string | null;
  detail: string;
}) {
  const [busy, setBusy] = useState(false);
  const connect = useCallback(async () => {
    if (!provider) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/auth/${provider}/url`, {
        credentials: "include",
        headers: { Accept: "application/json" },
      });
      const data = (await res.json().catch(() => ({}))) as { url?: string };
      if (typeof data.url === "string") window.location.assign(data.url);
      else setBusy(false);
    } catch {
      setBusy(false);
    }
  }, [provider]);
  return (
    <div className="flex items-center justify-between gap-3 rounded-[14px] border border-border bg-background p-3">
      <div className="min-w-0">
        <div className="text-sm font-semibold text-foreground">{name}</div>
        <div className="truncate text-xs leading-5 text-muted-foreground">{detail}</div>
      </div>
      {provider ? (
        <button
          type="button"
          onClick={connect}
          disabled={busy}
          className="touch-press shrink-0 rounded-full border border-brand/40 px-3 py-1.5 text-xs font-semibold text-brand-bright transition hover:bg-brand/15 disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {busy ? "Opening…" : "Connect"}
        </button>
      ) : (
        <span className="shrink-0 rounded-full border border-border px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
          In app
        </span>
      )}
    </div>
  );
}

function SettingsView() {
  const defaultGuardrails = useMemo(() => GUARDRAILS.filter((g) => g.on).map((g) => g.id), []);
  const [enabled, setEnabled] = usePersistentState<string[]>("guardrails", defaultGuardrails);
  const toggle = (id: string) =>
    setEnabled((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  return (
    <div className="space-y-6">
      <PageHeader
        icon={ShieldCheck}
        eyebrow="Settings"
        title="Model, guardrails, and personal context."
        text="Tune the default intelligence and the approval rules Assistant follows on your behalf."
      />
      <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
        <div className="space-y-6">
          <ModelSelector expanded />
          <Card>
            <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-brand-bright">
              <ShieldCheck size={13} /> Guardrails
            </div>
            <h2 className="wl-title mt-4 text-2xl text-foreground">Personal approval rules</h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              Assistant always asks before anything enabled here. Saved automatically.
            </p>
            <div className="mt-5 grid gap-3 md:grid-cols-2">
              {GUARDRAILS.map((rule) => {
                const on = enabled.includes(rule.id);
                return (
                  <div
                    key={rule.id}
                    className={cx(
                      "flex items-center justify-between gap-3 rounded-[14px] border p-3 text-sm transition-colors",
                      on ? "border-brand/25 bg-brand/[0.05]" : "border-border bg-background",
                    )}
                  >
                    <span className="flex items-center gap-2.5">
                      <CheckCircle2
                        className={cx(
                          "h-4 w-4 shrink-0",
                          on ? "text-brand-bright" : "text-muted-foreground/50",
                        )}
                      />
                      <span className={on ? "text-foreground" : "text-muted-foreground"}>
                        {rule.label}
                      </span>
                    </span>
                    <Switch
                      on={on}
                      onToggle={() => toggle(rule.id)}
                      label={`Toggle ${rule.label}`}
                    />
                  </div>
                );
              })}
            </div>
          </Card>
        </div>
        <Card>
          <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-brand-bright">
            <Mail size={13} /> Personal context
          </div>
          <h2 className="wl-title mt-4 text-2xl text-foreground">Connect accounts</h2>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            Personal scopes only — kept separate from any business workspace.
          </p>
          <div className="mt-5 space-y-3">
            {CONNECTORS.map((c) => (
              <Connector key={c.name} {...c} />
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Routes                                                                     */
/* -------------------------------------------------------------------------- */

function PersonalRoutes() {
  return (
    <RequirePersonal>
      <Shell>
        <Routes>
          <Route path="/app/personal" element={<HomeView />} />
          <Route path="/app/personal/assistant" element={<AssistantView />} />
          <Route path="/app/personal/automations" element={<AutomationsView />} />
          <Route path="/app/personal/intents" element={<AutomationsView />} />
          <Route path="/app/personal/siri" element={<SiriShortcutsView />} />
          <Route path="/app/personal/devices" element={<DevicesView />} />
          <Route path="/app/personal/download" element={<GetTheAppView />} />
          <Route path="/app/personal/number" element={<NumberView />} />
          <Route path="/app/personal/activity" element={<ActivityView />} />
          <Route path="/app/personal/settings" element={<SettingsView />} />
          <Route path="*" element={<Navigate to="/app/personal" replace />} />
        </Routes>
      </Shell>
    </RequirePersonal>
  );
}

export default function PersonalWorkspace() {
  return (
    <BrowserRouter>
      <PersonalRoutes />
    </BrowserRouter>
  );
}
