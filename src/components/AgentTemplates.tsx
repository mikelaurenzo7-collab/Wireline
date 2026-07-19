import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import DeployAgentModal, { DeployValues } from "./DeployAgentModal";
import {
  Target,
  Zap,
  Calendar,
  Mail,
  DollarSign,
  Shield,
  RefreshCw,
  BarChart3,
  Filter,
  Headphones,
  Sparkles,
  Building2,
  Search,
  Loader2,
  MessageCircle,
  Check,
  User,
  PhoneIncoming,
  ClipboardList,
  Receipt,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { authFetch, safeJson, isApiErrorBody } from "../lib/api";
import { AGENTS_CHANGED_EVENT } from "../contexts/AgentsContext";
import { cn } from "../lib/utils";
import { BRAND } from "../constants/brand-colors";
import { useToast } from "../contexts/ToastContext";
import { ClaudeRecipeButton } from "./ClaudeRecipes";
import { EmptyState } from "./ui/EmptyState";
import { Input } from "./ui/shadcn/Input";
import { ShadButton } from "./ui/shadcn/ShadButton";
import { Skeleton } from "./ui/shadcn/Skeleton";

// ────────────────────────────────────────────────────────────────────────────
// Template definitions — unlocked starting points, not plan locks.
// ────────────────────────────────────────────────────────────────────────────

const AGENT_TEMPLATES = [
  // === SALES & REVENUE ===
  {
    id: "sales-sdr",
    category: "Sales & Revenue",
    name: "SDR — Outbound Prospecting",
    description:
      "Qualifies inbound leads with BANT, books demos, handles objections, and passes hot leads to your CRM.",
    role: "sales",
    channel: "voice" as const,
    icon: Target,
    accent: BRAND.colors.primary,
    badge: "Most popular",
    firstMessage:
      "Hi, this is Alex from [Company]. I saw you were interested in [Product] — got 2 minutes to see if we'd be a fit?",
  },
  {
    id: "sales-closer",
    category: "Sales & Revenue",
    name: "Closer — Late Stage Deals",
    description:
      "Handles warm follow-ups, pricing discussions, and closing calls with empathy and authority.",
    role: "sales",
    channel: "voice" as const,
    icon: Zap,
    accent: BRAND.colors.primary,
    badge: null,
    firstMessage:
      "Hey [Name], following up on our conversation — happy to answer any final questions and get you started today.",
  },
  {
    id: "lead-qualifier-inbound",
    category: "Sales & Revenue",
    name: "Inbound Lead Qualifier",
    description:
      "Screens inbound calls with BANT questions, scores leads, and routes hot leads to sales immediately.",
    role: "lead_qualifier",
    channel: "voice" as const,
    icon: Filter,
    accent: BRAND.colors.primary,
    badge: "Inbound",
    firstMessage:
      "Thanks for calling! Before I connect you with our team, let me gather a bit of information to make sure we're the right fit for you.",
  },
  // === CUSTOMER SUPPORT ===
  {
    id: "support-tier1",
    category: "Customer Support",
    name: "Tier 1 — General Support",
    description:
      "Handles FAQs, account questions, and basic troubleshooting. Escalates to a human when needed.",
    role: "customer_service",
    channel: "voice" as const,
    icon: Headphones,
    accent: BRAND.colors.primary,
    badge: null,
    firstMessage: "Thank you for calling support. I'm your agent — how can I help you today?",
  },
  {
    id: "support-email",
    category: "Customer Support",
    name: "Email Support Agent",
    description:
      "Responds to customer emails with empathy and precision. Handles complaints, refunds, and status updates.",
    role: "customer_service",
    channel: "email" as const,
    icon: Mail,
    accent: BRAND.colors.primary,
    badge: null,
    firstMessage:
      "Thank you for reaching out. I've received your message and I'm here to help resolve this for you today.",
  },
  // === SCHEDULING ===
  {
    id: "scheduler-medical",
    category: "Scheduling",
    name: "Medical Office Scheduler",
    description:
      "Books patient appointments, handles cancellations, sends reminders, and follows a careful healthcare communication style.",
    role: "scheduler",
    channel: "voice" as const,
    icon: Calendar,
    accent: BRAND.colors.primary,
    badge: "Healthcare",
    firstMessage:
      "Hello, thank you for calling. I can help schedule or reschedule your appointment — what works best for you?",
  },
  {
    id: "scheduler-salon",
    category: "Scheduling",
    name: "Salon & Spa Receptionist",
    description:
      "Books beauty appointments, recommends services, upsells treatments, and reduces no-shows.",
    role: "receptionist",
    channel: "voice" as const,
    icon: Sparkles,
    accent: BRAND.colors.primary,
    badge: null,
    firstMessage:
      "Welcome to [Salon Name]! I can help book an appointment or answer questions about services.",
  },
  {
    id: "scheduler-realestate",
    category: "Scheduling",
    name: "Real Estate Tour Booker",
    description:
      "Qualifies buyers, books property tours, follows up on listings, and nurtures long-cycle leads.",
    role: "lead_qualifier",
    channel: "voice" as const,
    icon: Building2,
    accent: BRAND.colors.primary,
    badge: "Real Estate",
    firstMessage:
      "Hi! I'm calling about [Property Address] — are you still interested in scheduling a showing?",
  },
  // === COLLECTIONS & FINANCE ===
  {
    id: "collections-soft",
    category: "Collections & Finance",
    name: "Soft Collections — Payment Reminders",
    description:
      "Friendly payment reminder calls with empathy. Offers payment plans and avoids escalation.",
    role: "collections",
    channel: "voice" as const,
    icon: DollarSign,
    accent: BRAND.colors.outlineVariant,
    badge: null,
    firstMessage:
      "Hi [Name], this is a friendly reminder about an outstanding balance on your account. I'd love to help you resolve this today.",
  },
  {
    id: "collections-hard",
    category: "Collections & Finance",
    name: "Hard Collections — Recovery",
    description:
      "Direct payment recovery calls. Compliant with FDCPA guidelines. Structured call flow with objection handling.",
    role: "collections",
    channel: "voice" as const,
    icon: Shield,
    accent: BRAND.colors.outlineVariant,
    badge: "FDCPA compliant",
    firstMessage:
      "This is an important call regarding your account. To protect your credit, I need to speak with you or an authorized representative today.",
  },
  // === MARKETING ===
  {
    id: "marketing-reengagement",
    category: "Marketing",
    name: "Re-Engagement Campaigner",
    description:
      "Reaches out to dormant customers with personalized offers. Reactivates churned accounts and upsells.",
    role: "marketing",
    channel: "voice" as const,
    icon: RefreshCw,
    accent: BRAND.colors.primary,
    badge: null,
    firstMessage:
      "Hi [Name], it's been a while! I'm reaching out with something special for our loyal customers — do you have 60 seconds?",
  },
  {
    id: "marketing-survey",
    category: "Marketing",
    name: "NPS & Feedback Collector",
    description:
      "Runs quick post-interaction surveys. Captures satisfaction scores, verbatim feedback, and follow-up sentiment.",
    role: "marketing",
    channel: "voice" as const,
    icon: BarChart3,
    accent: BRAND.colors.primary,
    badge: null,
    firstMessage:
      "Hi! I'm calling on behalf of [Company] — we'd love your feedback on your recent experience. This takes under 2 minutes.",
  },
  // === E-COMMERCE ===
  {
    id: "ecommerce-support",
    category: "E-commerce",
    name: "Shopify / Square Support",
    description:
      "Handles 'Where is my order?', returns, inventory questions, address changes, and discount codes — connected to your live store.",
    role: "ecommerce",
    channel: "voice" as const,
    icon: Headphones,
    accent: BRAND.colors.onSurfaceMuted,
    badge: "Shopify · Square",
    firstMessage:
      "Thanks for calling! I can help with order status, returns, or anything about your purchase. What can I look into for you?",
  },
  {
    id: "ecommerce-phone-order",
    category: "E-commerce",
    name: "Phone Order Agent",
    description:
      "Takes orders over the phone, builds draft orders, applies discounts, sends payment links, and handles address corrections — all live.",
    role: "ecommerce",
    channel: "voice" as const,
    icon: Receipt,
    accent: BRAND.colors.onSurfaceMuted,
    badge: "Phone sales",
    firstMessage:
      "Hi, welcome to our store! I can help you place an order right over the phone. What are you looking for today?",
  },
  // === PERSONAL & LIFESTYLE ===
  // Personal templates are unlocked starting points. They represent a single
  // person rather than a business, and they can be upgraded through Training.
  {
    id: "personal-concierge",
    category: "Personal & Lifestyle",
    name: "Personal Concierge",
    description:
      "Versatile personal agent. Books appointments, handles follow-ups, screens calls, and takes messages on your behalf.",
    role: "personal_assistant",
    channel: "voice" as const,
    icon: User,
    accent: BRAND.colors.primary,
    badge: "Personal · most versatile",
    firstMessage: "Hi, this is [Your Name]'s agent. How can I help you today?",
  },
  {
    id: "personal-screener",
    category: "Personal & Lifestyle",
    name: "Call Screener",
    description:
      "Picks up unknown numbers, screens spam and sales calls, takes messages from legitimate callers, and never bothers you for nothing.",
    role: "personal_assistant",
    channel: "voice" as const,
    icon: PhoneIncoming,
    accent: BRAND.colors.primary,
    badge: "Personal · inbound",
    firstMessage:
      "Hi, you've reached [Your Name]'s line — I'm their agent. Can I take a quick message or let them know what this is about?",
  },
  {
    id: "personal-errand",
    category: "Personal & Lifestyle",
    name: "Errand Caller",
    description:
      "Calls dentists, plumbers, hairdressers, restaurants, and offices to book, confirm, or reschedule on your behalf.",
    role: "personal_assistant",
    channel: "voice" as const,
    icon: ClipboardList,
    accent: BRAND.colors.primary,
    badge: "Personal · outbound",
    firstMessage:
      "Hi, I'm calling on behalf of [Your Name] — they asked me to [book / reschedule / confirm] [appointment type]. Is now a good time?",
  },
  {
    id: "personal-negotiator",
    category: "Personal & Lifestyle",
    name: "Bill Negotiator",
    description:
      "Calls your cable, internet, insurance, or wireless carrier to renegotiate rates, dispute charges, or cancel cleanly. Polite but firm.",
    role: "personal_assistant",
    channel: "voice" as const,
    icon: Receipt,
    accent: BRAND.colors.primary,
    badge: "Personal · saves money",
    firstMessage:
      "Hi, I'm calling on behalf of [Your Name], account [Account #] — they've asked me to discuss their current plan and pricing.",
  },
] as const;

type Template = (typeof AGENT_TEMPLATES)[number];

const CATEGORIES = [
  "All",
  "Sales & Revenue",
  "Customer Support",
  "Scheduling",
  "Collections & Finance",
  "Marketing",
  "E-commerce",
  "Personal & Lifestyle",
] as const;

const TEMPLATE_TOTAL = AGENT_TEMPLATES.length;

function searchableTemplateText(template: Template) {
  return [
    template.name,
    template.description,
    template.category,
    template.role,
    template.channel,
    template.badge ?? "",
    template.firstMessage,
  ]
    .join(" ")
    .toLowerCase();
}

// Recommended default voice gender per template. The account holder can override
// in the deploy modal. This is just a smart starting point for the use case.
const DEFAULT_GENDER_BY_TEMPLATE: Record<string, "female" | "male"> = {
  "sales-sdr": "male",
  "sales-closer": "male",
  "lead-qualifier-inbound": "female",
  "support-tier1": "female",
  "support-email": "female",
  "scheduler-medical": "female",
  "scheduler-salon": "female",
  "scheduler-realestate": "male",
  "collections-soft": "female",
  "collections-hard": "male",
  "marketing-reengagement": "female",
  "marketing-survey": "female",
  "ecommerce-support": "female",
  "ecommerce-phone-order": "female",
  "personal-concierge": "female",
  "personal-screener": "female",
  "personal-errand": "female",
  "personal-negotiator": "male",
};

function TemplateCard({
  template,
  onDeploy,
  deploying,
  deployedCount,
}: {
  template: Template;
  onDeploy: (t: Template) => void;
  deploying: boolean;
  deployedCount: number;
}) {
  const [previewOpen, setPreviewOpen] = useState(false);
  const Icon = template.icon;
  const alreadyDeployed = deployedCount > 0;

  return (
    <motion.article
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.96 }}
      whileHover={{ y: -2 }}
      className={cn(
        "relative studio-card rounded-md border border-border bg-card transition-all duration-300 flex flex-col group overflow-hidden card-interactive-premium",
        previewOpen ? "border-primary/20 shadow-md shadow-primary/8" : "shadow-sm",
      )}
      data-accent={template.accent}
      aria-label={`${template.name} template`}
      onMouseEnter={() => setPreviewOpen(true)}
      onMouseLeave={() => setPreviewOpen(false)}
      onFocus={() => setPreviewOpen(true)}
      onBlur={() => setPreviewOpen(false)}
    >
      <div className="absolute -top-8 -right-8 w-32 h-32 rounded-full blur-3xl opacity-0 group-hover:opacity-30 transition-opacity pointer-events-none hidden md:block" />

      <div className="relative z-10 p-4 flex flex-col gap-3 flex-1">
        <div className="flex items-start justify-between gap-2">
          <div className="w-10 h-10 rounded-md flex items-center justify-center shrink-0 bg-[var(--wireline-color-feedback-success-surface)]">
            <Icon
              aria-hidden="true"
              className="w-5 h-5 text-[var(--wireline-color-action-primary-default)]"
            />
          </div>

          <div className="flex items-center gap-1.5 flex-wrap justify-end">
            {alreadyDeployed && (
              <span
                className="px-1.5 py-0.5 rounded-full border wl-label leading-none flex items-center gap-1 wl-status-success wl-text-success"
                title={
                  deployedCount === 1 ? "Already in your agents" : `${deployedCount} in your agents`
                }
              >
                <Check aria-hidden="true" className="w-2.5 h-2.5" />
                {deployedCount === 1 ? "Deployed" : `Deployed ×${deployedCount}`}
              </span>
            )}
            <span
              className={cn(
                "px-1.5 py-0.5 rounded-full border wl-label leading-none",
                template.channel === "email"
                  ? "bg-muted border-border text-foreground/70"
                  : "bg-primary/10 border-primary/30 text-primary",
                alreadyDeployed && "hidden sm:inline-flex",
              )}
            >
              {template.channel}
            </span>
            {template.badge && (
              <span className="hidden sm:inline-flex px-1.5 py-0.5 rounded-full bg-muted border border-border wl-label leading-none text-foreground/70">
                {template.badge}
              </span>
            )}
          </div>
        </div>

        <div>
          <h3 className="text-base font-semibold text-foreground leading-tight tracking-[-0.01em]">
            {template.name}
          </h3>
          <p className="text-xs text-foreground/70 leading-relaxed mt-1">{template.description}</p>
        </div>

        <AnimatePresence>
          {previewOpen && (
            <motion.div
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 4 }}
              className="rounded-md p-3 border text-[var(--wireline-typography-caption-size)] text-[var(--wireline-color-text-secondary)]/80 leading-relaxed italic relative bg-[var(--wireline-color-surface-subtle)]"
            >
              <MessageCircle
                aria-hidden="true"
                className="absolute -top-2 -left-1.5 w-4 h-4 text-[var(--wireline-color-action-primary-default)]"
              />
              <span className="pl-2">&ldquo;{template.firstMessage}&rdquo;</span>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div className="relative z-10 px-4 pb-4">
        <ShadButton
          type="button"
          disableAnimations
          variant="default"
          onClick={() => onDeploy(template)}
          disabled={deploying}
          className="w-full !py-2 !text-[var(--wireline-typography-overline-size)] !tracking-[0.22em] flex items-center justify-center gap-2 shadow-sm"
          aria-label={`${alreadyDeployed ? "Use again" : "Use"} ${template.name} template`}
        >
          {deploying ? <Loader2 aria-hidden="true" className="w-3.5 h-3.5 animate-spin" /> : null}
          {alreadyDeployed ? "Use again" : "Use template"}
        </ShadButton>
      </div>
    </motion.article>
  );
}

function CustomAgentCard() {
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="studio-card rounded-md border border-primary/25 border-dashed flex flex-col items-center justify-center gap-3 p-6 text-center min-h-[240px]"
    >
      <div className="w-12 h-12 rounded-md border border-border bg-card flex items-center justify-center">
        <Sparkles aria-hidden="true" className="w-5 h-5 text-primary" />
      </div>
      <div className="space-y-1">
        <h3 className="text-base font-semibold text-foreground tracking-[-0.01em]">Custom Agent</h3>
        <p className="text-[var(--wireline-typography-caption-size)] text-foreground/70 leading-relaxed max-w-[12.5rem]">
          Let Wireline wire a bespoke agent for your exact use case.
        </p>
      </div>
      <ClaudeRecipeButton recipe="agent-wire" label="Open Wire Agent" variant="ghost" />
    </motion.div>
  );
}

export default function AgentTemplates() {
  const navigate = useNavigate();
  const { success: toastSuccess, error: toastError } = useToast();

  const [activeCategory, setActiveCategory] = useState<(typeof CATEGORIES)[number]>("All");
  const [search, setSearch] = useState("");
  const [deploying, setDeploying] = useState<string | null>(null);
  const [deployedNames, setDeployedNames] = useState<string[]>([]);
  const [modalTemplate, setModalTemplate] = useState<Template | null>(null);
  const [initialLoading, setInitialLoading] = useState(true);

  const refetchAgents = async () => {
    try {
      const r = await authFetch("/api/agents");
      if (!r.ok) return;
      const data = (await r.json()) as { agents?: Array<{ name?: string | null }> };
      setDeployedNames((data.agents ?? []).map((a) => (a.name ?? "").toLowerCase()));
    } catch {
      /* non-critical — gallery still works without the badge */
    }
  };

  useEffect(() => {
    refetchAgents().finally(() => setInitialLoading(false));
  }, []);

  useEffect(() => {
    const templateId = new URLSearchParams(window.location.search).get("template");
    if (!templateId) return;
    const template = AGENT_TEMPLATES.find((t) => t.id === templateId);
    if (!template) return;
    setActiveCategory(template.category);
    setSearch(template.name);
    setModalTemplate(template);
  }, []);

  const deployedCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const n of deployedNames) {
      counts.set(n, (counts.get(n) ?? 0) + 1);
    }
    return counts;
  }, [deployedNames]);

  const q = search.trim().toLowerCase();
  const visible = AGENT_TEMPLATES.filter((t) => {
    const matchesCategory = activeCategory === "All" || t.category === activeCategory;
    const matchesSearch = !q || searchableTemplateText(t).includes(q);
    return matchesCategory && matchesSearch;
  });
  const resultLabel = initialLoading
    ? "Loading templates"
    : `${visible.length} of ${TEMPLATE_TOTAL} templates`;

  const handleOpenDeploy = (template: Template) => {
    if (deploying) return;
    setModalTemplate(template);
  };

  const handleConfirmedDeploy = async (values: DeployValues) => {
    if (!modalTemplate) return;
    setDeploying(modalTemplate.id);
    try {
      const uniqueId = `${modalTemplate.id}-${Date.now()}`;
      const resp = await authFetch("/api/agents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: uniqueId,
          name: values.name,
          channel: modalTemplate.channel,
          role: modalTemplate.role,
          voice_id: values.voiceId,
          templateId: modalTemplate.id,
          firstMessage: modalTemplate.firstMessage,
        }),
      });
      const data = await safeJson(resp);
      if (!resp.ok) {
        const errorMessage = isApiErrorBody(data) ? data.error : "Please try again.";
        toastError("Deployment failed", errorMessage);
        setDeploying(null);
        return;
      }
      toastSuccess("Agent deployed", values.name);
      setModalTemplate(null);
      setDeploying(null);
      await refetchAgents();
      window.dispatchEvent(new Event(AGENTS_CHANGED_EVENT));
      const createdId =
        typeof data === "object" && data && "id" in data && typeof data.id === "string"
          ? data.id
          : uniqueId;
      navigate(`/studio?agent=${encodeURIComponent(createdId)}`);
    } catch {
      toastError("Deployment failed", "Could not reach the server. Please try again.");
      setDeploying(null);
    }
  };

  return (
    <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
      <div className="px-4 py-3 border-b border-border flex flex-col gap-3 shrink-0">
        <div className="relative">
          <Search
            aria-hidden="true"
            className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted/70 pointer-events-none"
          />
          <Input
            type="search"
            aria-label="Search templates"
            placeholder="Search templates, roles, channels…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-md border border-border bg-muted/20 py-2 pl-9 pr-4 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-primary/50"
          />
        </div>

        <div className="flex items-center justify-between gap-3">
          <div
            className="flex gap-1.5 flex-wrap"
            role="group"
            aria-label="Template category filter"
          >
            {CATEGORIES.map((cat) => {
              const selected = activeCategory === cat;
              return (
                <ShadButton
                  key={cat}
                  type="button"
                  disableAnimations
                  variant={selected ? "secondary" : "outline"}
                  size="sm"
                  onClick={() => setActiveCategory(cat)}
                  aria-pressed={selected}
                  className={cn(
                    "rounded-full wl-label",
                    selected
                      ? "bg-primary/15 border-primary/40 text-primary"
                      : "text-muted hover:text-foreground hover:border-primary/25",
                  )}
                >
                  {cat}
                </ShadButton>
              );
            })}
          </div>
          <span className="hidden shrink-0 font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground sm:inline">
            {resultLabel}
          </span>
        </div>
      </div>

      <div className="flex-1 min-h-0 scroll-viewport px-4 py-4" aria-live="polite">
        {initialLoading ? (
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 sm:gap-3 xl:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                className="studio-card rounded-md border border-border bg-card p-4 space-y-3"
              >
                <div className="flex items-start justify-between">
                  <Skeleton className="h-10 w-10 rounded-md" />
                  <Skeleton className="h-5 w-14 rounded-full" />
                </div>
                <Skeleton className="h-5 w-3/4" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-5/6" />
                <Skeleton className="h-9 w-full rounded-md mt-2" />
              </div>
            ))}
          </div>
        ) : (
          <>
            <AnimatePresence mode="popLayout">
              {visible.length === 0 && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                  <EmptyState
                    framed
                    density="compact"
                    titleTone="ui"
                    withHalo={false}
                    icon={Search}
                    title={q ? `No templates match “${search.trim()}”` : "No templates match"}
                    description={
                      search
                        ? "Try a broader job name, or clear the search to browse everything."
                        : "Adjust the filters to see available starting points."
                    }
                    actions={
                      search
                        ? [
                            {
                              label: "Clear search",
                              onClick: () => setSearch(""),
                              primary: true,
                            },
                          ]
                        : [{ label: "Create from scratch", to: "/studio?create=1", primary: true }]
                    }
                  />
                </motion.div>
              )}
            </AnimatePresence>

            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 sm:gap-3 xl:grid-cols-3">
              <AnimatePresence mode="popLayout">
                {visible.map((template) => (
                  <TemplateCard
                    key={template.id}
                    template={template}
                    onDeploy={handleOpenDeploy}
                    deploying={deploying === template.id}
                    deployedCount={deployedCounts.get(template.name.toLowerCase()) ?? 0}
                  />
                ))}
              </AnimatePresence>

              <CustomAgentCard />
            </div>
          </>
        )}
      </div>

      <DeployAgentModal
        open={modalTemplate !== null}
        template={
          modalTemplate
            ? {
                id: modalTemplate.id,
                name: modalTemplate.name,
                description: modalTemplate.description,
                category: modalTemplate.category,
                role: modalTemplate.role,
                channel: modalTemplate.channel,
                firstMessage: modalTemplate.firstMessage,
                defaultGender: DEFAULT_GENDER_BY_TEMPLATE[modalTemplate.id] ?? "female",
              }
            : null
        }
        onClose={() => {
          if (deploying) return;
          setModalTemplate(null);
        }}
        onConfirm={handleConfirmedDeploy}
        deploying={deploying === modalTemplate?.id}
      />
    </div>
  );
}
