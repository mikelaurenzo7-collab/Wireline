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
import { useNavigate } from "react-router";
import { authFetch, safeJson, isApiErrorBody } from "../lib/api";
import { AGENTS_CHANGED_EVENT } from "../contexts/AgentsContext";
import { cn } from "../lib/utils";
import { BRAND } from "../constants/brand-colors";
import { isBusinessTemplateCategory } from "../lib/agent-create-defaults";
import { useToast } from "../contexts/ToastContext";
import { EmptyState } from "./ui/EmptyState";
import { Input } from "./ui/shadcn/Input";
import { NativeSelect } from "./atoms";
import { ShadButton } from "./ui/shadcn/ShadButton";
import { Skeleton } from "./ui/shadcn/Skeleton";
import { stashPostCreateWizard } from "../lib/wireline-create-flow";
import { setPostSignupFlowActive } from "../lib/post-signup-onboarding";
import { isBotMarkKey } from "../lib/bot-mark";

// ────────────────────────────────────────────────────────────────────────────
// Template definitions — unlocked starting points, not plan locks.
// ────────────────────────────────────────────────────────────────────────────

/**
 * Earlier template titles. A Bot keeps the name it was created with, so the
 * "Deployed" count still recognizes Bots made from a template before it was
 * renamed into plain language.
 */
const LEGACY_TEMPLATE_NAMES: Record<string, string> = {
  "sales-sdr": "SDR: Outbound Prospecting",
  "sales-closer": "Closer: Late Stage Deals",
  "support-tier1": "Tier 1: General Support",
  "marketing-survey": "NPS & Feedback Collector",
};

const CHANNEL_LABELS = { voice: "Voice", email: "Email" } as const;

export const AGENT_TEMPLATES = [
  // === SALES & REVENUE ===
  {
    id: "sales-sdr",
    category: "Sales & Revenue",
    name: "Outbound Sales Caller",
    description:
      "Qualifies prospects, books demos, and records the outcome. Updates your CRM when connected.",
    role: "sales",
    channel: "voice" as const,
    icon: Target,
    accent: BRAND.colors.primary,
    badge: "Most popular",
    firstMessage:
      "Hi, I'm following up because you showed interest in what we offer. Is now a good time for two quick questions?",
  },
  {
    id: "sales-closer",
    category: "Sales & Revenue",
    name: "Deal Closer",
    description: "Follows up with warm leads and answers pricing questions.",
    role: "sales",
    channel: "voice" as const,
    icon: Zap,
    accent: BRAND.colors.primary,
    badge: null,
    firstMessage:
      "Hi, I'm following up on your recent conversation with our team. What would help you decide on the next step?",
  },
  {
    id: "lead-qualifier-inbound",
    category: "Sales & Revenue",
    name: "Inbound Lead Qualifier",
    description: "Screens callers and routes qualified leads to sales.",
    role: "lead_qualifier",
    channel: "voice" as const,
    icon: Filter,
    accent: BRAND.colors.primary,
    badge: null,
    firstMessage:
      "Thanks for calling! Before I connect you with our team, let me gather a bit of information to make sure we're the right fit for you.",
  },
  // === CUSTOMER SUPPORT ===
  {
    id: "support-tier1",
    category: "Customer Support",
    name: "General Support",
    description: "Answers common questions and hands off when needed.",
    role: "customer_service",
    channel: "voice" as const,
    icon: Headphones,
    accent: BRAND.colors.primary,
    badge: null,
    firstMessage: "Thank you for calling support. I'm here to help. What can I take care of?",
  },
  {
    id: "support-email",
    category: "Customer Support",
    name: "Email Support Bot",
    description: "Replies to customer questions, complaints, and status requests.",
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
    description: "Books and reschedules patient appointments for approved practices.",
    role: "scheduler",
    channel: "voice" as const,
    icon: Calendar,
    accent: BRAND.colors.primary,
    badge: "Restricted",
    selfServeRestriction:
      "Self-serve deployment is unavailable. Healthcare use requires a signed BAA and an approved BotBound configuration.",
    firstMessage:
      "Hello, thank you for calling. I can help schedule or reschedule your appointment. What works best for you?",
  },
  {
    id: "scheduler-salon",
    category: "Scheduling",
    name: "Salon & Spa Receptionist",
    description: "Books appointments and answers service questions.",
    role: "receptionist",
    channel: "voice" as const,
    icon: Sparkles,
    accent: BRAND.colors.primary,
    badge: null,
    firstMessage:
      "Thanks for calling. I can help with service questions or find an appointment time. What do you need today?",
  },
  {
    id: "scheduler-realestate",
    category: "Scheduling",
    name: "Real Estate Tour Booker",
    description: "Qualifies buyers, books tours, and follows up on listings.",
    role: "lead_qualifier",
    channel: "voice" as const,
    icon: Building2,
    accent: BRAND.colors.primary,
    badge: null,
    firstMessage:
      "Hi, I'm following up about a property you asked about. Would you like to review details or request a showing time?",
  },
  // === COLLECTIONS & FINANCE ===
  {
    id: "collections-soft",
    category: "Collections & Finance",
    name: "Soft Collections: Payment Reminders",
    description: "Reminds customers about outstanding payments.",
    role: "collections",
    channel: "voice" as const,
    icon: DollarSign,
    accent: BRAND.colors.outlineVariant,
    badge: "Legal review required",
    selfServeRestriction:
      "Self-serve deployment is unavailable. Payment-reminder use requires legal review and an approved jurisdiction-specific BotBound configuration.",
    firstMessage:
      "This payment-reminder workflow is unavailable until its legal and account review is complete.",
  },
  {
    id: "collections-hard",
    category: "Collections & Finance",
    name: "Hard Collections: Recovery",
    description: "Payment recovery with FDCPA-aware guardrails.",
    role: "collections",
    channel: "voice" as const,
    icon: Shield,
    accent: BRAND.colors.outlineVariant,
    badge: "Legal review required",
    selfServeRestriction:
      "Self-serve deployment is unavailable. Debt-recovery use requires legal review and an approved jurisdiction-specific BotBound configuration.",
    firstMessage:
      "This debt-recovery workflow is unavailable until its legal and account review is complete.",
  },
  // === MARKETING ===
  {
    id: "marketing-reengagement",
    category: "Marketing",
    name: "Re-Engagement Campaigner",
    description: "Follows up with past customers about relevant offers.",
    role: "marketing",
    channel: "voice" as const,
    icon: RefreshCw,
    accent: BRAND.colors.primary,
    badge: null,
    firstMessage:
      "Hi, I'm reaching out because you've worked with us before. Is now a good time for a brief update?",
  },
  {
    id: "marketing-survey",
    category: "Marketing",
    name: "Customer Feedback Caller",
    description: "Collects satisfaction scores and customer feedback.",
    role: "marketing",
    channel: "voice" as const,
    icon: BarChart3,
    accent: BRAND.colors.primary,
    badge: null,
    firstMessage:
      "Hi, I'm calling to ask about your recent experience. Would you be open to a quick feedback survey?",
  },
  // === E-COMMERCE ===
  {
    id: "ecommerce-support",
    category: "E-commerce",
    name: "Connected Store Support",
    description:
      "Answers store questions from your Knowledge and captures requests. Looks up orders, customers, and inventory when Shopify or Square is connected.",
    role: "ecommerce",
    channel: "voice" as const,
    icon: Headphones,
    accent: BRAND.colors.onSurfaceMuted,
    badge: "Shopify or Square",
    firstMessage:
      "Thanks for calling! I can help with store questions and take details for follow-up. What can I help you with today?",
  },
  {
    id: "ecommerce-phone-order",
    category: "E-commerce",
    name: "Phone Order Bot",
    description:
      "Helps callers choose products and captures order details. Creates Square payment links or Shopify draft-order checkout links when the matching provider is connected.",
    role: "ecommerce",
    channel: "voice" as const,
    icon: Receipt,
    accent: BRAND.colors.onSurfaceMuted,
    badge: "Phone sales",
    firstMessage:
      "Hi, welcome to our store! I can help you find the right item and take your order details. What are you looking for today?",
  },
  // === EVERYDAY & LIFESTYLE ===
  // These are role starters in the same Bot workspace, not a separate product.
  {
    id: "personal-concierge",
    category: "Everyday & Lifestyle",
    name: "Personal Concierge",
    description: "Handles appointments, follow-ups, and messages for you.",
    role: "personal_assistant",
    channel: "voice" as const,
    icon: User,
    accent: BRAND.colors.primary,
    badge: "Everyday · most versatile",
    firstMessage: "Hi, you've reached the line. How can I help today?",
  },
  {
    id: "personal-screener",
    category: "Everyday & Lifestyle",
    name: "Call Screener",
    description: "Screens unknown callers and takes messages on your behalf.",
    role: "personal_assistant",
    channel: "voice" as const,
    icon: PhoneIncoming,
    accent: BRAND.colors.primary,
    badge: "Everyday · inbound",
    firstMessage: "Hi, you've reached the line. Can I take a message or ask what this is about?",
  },
  {
    id: "personal-errand",
    category: "Everyday & Lifestyle",
    name: "Errand Caller",
    description: "Calls businesses to book, confirm, or reschedule for you.",
    role: "personal_assistant",
    channel: "voice" as const,
    icon: ClipboardList,
    accent: BRAND.colors.primary,
    badge: "Everyday · outbound",
    firstMessage:
      "Hi, I'm calling with the account holder's permission about an appointment request. Is now a good time?",
  },
  {
    id: "personal-negotiator",
    category: "Everyday & Lifestyle",
    name: "Bill Negotiator",
    description: "Calls providers about rates, disputed charges, or cancellations.",
    role: "personal_assistant",
    channel: "voice" as const,
    icon: Receipt,
    accent: BRAND.colors.primary,
    badge: "Everyday · saves money",
    firstMessage:
      "Hi, I'm calling with the account holder's permission to ask about their current plan and pricing.",
  },
] as const;

type Template = (typeof AGENT_TEMPLATES)[number];

export function getTemplateSelfServeRestriction(template: Template): string | null {
  return "selfServeRestriction" in template ? template.selfServeRestriction : null;
}

export function isTemplateSelfServeAvailable(template: Template): boolean {
  return getTemplateSelfServeRestriction(template) === null;
}

const CATEGORIES = [
  "All",
  "Sales & Revenue",
  "Customer Support",
  "Scheduling",
  "Collections & Finance",
  "Marketing",
  "E-commerce",
  "Everyday & Lifestyle",
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
  const Icon = template.icon;
  const alreadyDeployed = deployedCount > 0;
  const selfServeRestriction = getTemplateSelfServeRestriction(template);
  const selfServeAvailable = selfServeRestriction === null;

  return (
    <motion.article
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.96 }}
      whileHover={selfServeAvailable ? { y: -2 } : undefined}
      className="relative studio-card !p-0 rounded-md border border-border bg-card transition-all duration-300 flex flex-col group overflow-hidden card-interactive-premium shadow-sm"
      data-accent={template.accent}
      aria-label={`${template.name} template${selfServeAvailable ? "" : ", self-serve deployment unavailable"}`}
    >
      <div className="absolute -top-8 -right-8 w-32 h-32 rounded-full blur-3xl opacity-0 group-hover:opacity-30 transition-opacity pointer-events-none hidden md:block" />

      <div className="relative z-10 p-4 flex flex-col gap-3 flex-1">
        <div className="flex items-start justify-between gap-2">
          <div className="flex size-5 items-center justify-center shrink-0">
            <Icon aria-hidden="true" className="size-4 text-muted-foreground" />
          </div>

          <div className="flex items-center gap-1.5 flex-wrap justify-end">
            {alreadyDeployed && (
              <span
                className="px-1.5 py-0.5 rounded-full border wl-label leading-none flex items-center gap-1 wl-status-success wl-text-success"
                title={
                  deployedCount === 1 ? "Already in your Bots" : `${deployedCount} in your Bots`
                }
              >
                <Check aria-hidden="true" className="w-2.5 h-2.5" />
                {deployedCount === 1 ? "Deployed" : `Deployed ×${deployedCount}`}
              </span>
            )}
            <span
              className={cn(
                // The channel is a raw enum ("voice", "email"); its visible
                // label comes from CHANNEL_LABELS, not from text-transform.
                "px-1.5 py-0.5 rounded-full border wl-label leading-none",
                template.channel === "email"
                  ? "bg-muted border-border text-foreground/70"
                  : "bg-primary/10 border-primary/30 text-primary",
                alreadyDeployed && "hidden sm:inline-flex",
              )}
            >
              {CHANNEL_LABELS[template.channel]}
            </span>
            {template.badge && (
              // whitespace-nowrap: a pill that wraps mid-phrase ("EVERYDAY ·
              // MOST / VERSATILE") reads as a broken chip, not a badge.
              <span className="hidden sm:inline-flex whitespace-nowrap px-1.5 py-0.5 rounded-full bg-muted border border-border wl-label leading-none text-foreground/70">
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
          {selfServeRestriction ? (
            <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
              {selfServeRestriction}
            </p>
          ) : null}
        </div>

        <details className="mt-auto">
          <summary className="min-h-11 cursor-pointer rounded-md py-3 text-xs font-medium text-foreground/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            Sample Greeting
          </summary>
          <div className="flex gap-2 px-3 pb-3 text-xs leading-relaxed text-muted-foreground">
            <MessageCircle aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
            <p>&ldquo;{template.firstMessage}&rdquo;</p>
          </div>
        </details>
      </div>

      <div className="relative z-10 px-4 pb-4">
        <ShadButton
          type="button"
          disableAnimations
          variant="outline"
          onClick={() => onDeploy(template)}
          disabled={deploying || !selfServeAvailable}
          className="w-full flex items-center justify-center gap-2"
          aria-label={
            selfServeAvailable
              ? `${alreadyDeployed ? "Use again" : "Use"} ${template.name} template`
              : `${template.name} requires review before deployment`
          }
        >
          {deploying ? <Loader2 aria-hidden="true" className="w-3.5 h-3.5 animate-spin" /> : null}
          {selfServeAvailable
            ? alreadyDeployed
              ? "Use Again"
              : "Use Template"
            : "Review Required"}
        </ShadButton>
      </div>
    </motion.article>
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
    if (isTemplateSelfServeAvailable(template)) setModalTemplate(template);
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
    if (deploying || !isTemplateSelfServeAvailable(template)) return;
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
          is_business_agent: isBusinessTemplateCategory(modalTemplate.category),
        }),
      });
      const data = await safeJson(resp);
      if (!resp.ok) {
        const errorMessage = isApiErrorBody(data) ? data.error : "Please try again.";
        toastError("Deployment failed", errorMessage);
        setDeploying(null);
        return;
      }
      toastSuccess("Bot created", values.name);
      setModalTemplate(null);
      setDeploying(null);
      await refetchAgents();
      window.dispatchEvent(new Event(AGENTS_CHANGED_EVENT));
      const createdId =
        typeof data === "object" && data && "id" in data && typeof data.id === "string"
          ? data.id
          : uniqueId;
      stashPostCreateWizard({
        agentId: createdId,
        agentName: values.name,
        markKey:
          typeof data === "object" && data && "mark_key" in data && isBotMarkKey(data.mark_key)
            ? data.mark_key
            : null,
        phoneProvisionRequested: false,
        phoneProvisioned: false,
      });
      setPostSignupFlowActive(true);
      navigate(`/studio?agent=${encodeURIComponent(createdId)}&section=setup`);
    } catch {
      toastError("Deployment failed", "Could not reach the server. Please try again.");
      setDeploying(null);
    }
  };

  return (
    <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
      <div className="py-3 border-b border-border flex flex-col gap-3 shrink-0">
        <div className="relative">
          <Search
            aria-hidden="true"
            className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted/70 pointer-events-none"
          />
          <Input
            type="search"
            aria-label="Search templates"
            placeholder="Search templates"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-md border border-border bg-muted/20 py-2 pl-9 pr-4 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-primary/50"
          />
        </div>

        <div className="flex items-center justify-between gap-3">
          <div
            className="min-w-0 flex-1 sm:max-w-xs"
            role="group"
            aria-label="Template category filter"
          >
            <NativeSelect
              aria-label="Template category"
              value={activeCategory}
              onChange={(event) =>
                setActiveCategory(event.target.value as (typeof CATEGORIES)[number])
              }
            >
              {CATEGORIES.map((cat) => (
                <option key={cat} value={cat}>
                  {cat === "All" ? "All Categories" : cat}
                </option>
              ))}
            </NativeSelect>
          </div>
          <span className="hidden shrink-0 font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground sm:inline">
            {resultLabel}
          </span>
        </div>
      </div>

      <div className="flex-1 min-h-0 scroll-viewport py-4" aria-live="polite">
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
                    title={q ? `No Templates Match “${search.trim()}”` : "No Templates Match"}
                    description={
                      search
                        ? "Try a broader job name, or clear the search to browse everything."
                        : "Adjust the filters to see available starting points."
                    }
                    actions={
                      search
                        ? [
                            {
                              label: "Clear Search",
                              onClick: () => setSearch(""),
                              primary: true,
                            },
                          ]
                        : [{ label: "Create from Scratch", to: "/studio?create=1", primary: true }]
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
                    deployedCount={
                      (deployedCounts.get(template.name.toLowerCase()) ?? 0) +
                      (deployedCounts.get(
                        LEGACY_TEMPLATE_NAMES[template.id]?.toLowerCase() ?? "",
                      ) ?? 0)
                    }
                  />
                ))}
              </AnimatePresence>
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
