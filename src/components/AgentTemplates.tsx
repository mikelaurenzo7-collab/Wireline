import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  BarChart3,
  Building2,
  Calendar,
  Check,
  Headphones,
  Loader2,
  Mail,
  MessageCircle,
  PhoneIncoming,
  Receipt,
  Search,
  Sparkles,
  Target,
  User,
  Zap,
} from "lucide-react";
import { useNavigate } from "react-router-dom";

import DeployAgentModal, { DeployValues } from "./DeployAgentModal";
import { ClaudeRecipeButton } from "./ClaudeRecipes";
import { AGENTS_CHANGED_EVENT } from "../contexts/AgentsContext";
import { useToast } from "../contexts/ToastContext";
import { BRAND } from "../constants/brand-colors";
import { authFetch, isApiErrorBody, safeJson } from "../lib/api";
import { cn } from "../lib/utils";
import { Input } from "./ui/shadcn/Input";
import { ShadButton } from "./ui/shadcn/ShadButton";

const AGENT_TEMPLATES = [
  {
    id: "sales-sdr",
    category: "Sales & Revenue",
    name: "Outbound SDR",
    description:
      "Qualifies new leads, books demos, handles first objections, and passes clean context to your CRM.",
    role: "sales",
    channel: "voice" as const,
    icon: Target,
    accent: BRAND.colors.primary,
    badge: "Most popular",
    firstMessage:
      "Hi, this is Alex from [Company]. I saw you were interested in [Product] — got two minutes to see if we can help?",
  },
  {
    id: "sales-closer",
    category: "Sales & Revenue",
    name: "Deal Follow-up",
    description:
      "Follows up with warm prospects, answers pricing questions, and keeps next steps moving without sounding pushy.",
    role: "sales",
    channel: "voice" as const,
    icon: Zap,
    accent: BRAND.colors.primary,
    badge: null,
    firstMessage:
      "Hey [Name], following up on our conversation — happy to answer final questions and help with the next step.",
  },
  {
    id: "lead-qualifier-inbound",
    category: "Sales & Revenue",
    name: "Inbound Qualifier",
    description:
      "Screens inbound calls, captures fit signals, and routes promising leads to the right person immediately.",
    role: "lead_qualifier",
    channel: "voice" as const,
    icon: BarChart3,
    accent: BRAND.colors.primary,
    badge: "Inbound",
    firstMessage:
      "Thanks for calling. I can gather a few details and make sure the right person follows up with you.",
  },
  {
    id: "support-tier1",
    category: "Customer Support",
    name: "Support Triage",
    description:
      "Answers common questions, captures issue details, and escalates with enough context for a fast human handoff.",
    role: "customer_service",
    channel: "voice" as const,
    icon: Headphones,
    accent: BRAND.colors.primary,
    badge: null,
    firstMessage: "Thank you for calling support. I can help route this and capture what you need.",
  },
  {
    id: "support-email",
    category: "Customer Support",
    name: "Email Support",
    description:
      "Drafts precise, empathetic replies for refunds, status updates, account questions, and follow-up threads.",
    role: "customer_service",
    channel: "email" as const,
    icon: Mail,
    accent: BRAND.colors.primary,
    badge: null,
    firstMessage:
      "Thanks for reaching out. I have your message and will help get this resolved clearly.",
  },
  {
    id: "scheduler-medical",
    category: "Scheduling",
    name: "Office Scheduler",
    description:
      "Books appointments, handles cancellations, sends reminders, and keeps scheduling details organized.",
    role: "scheduler",
    channel: "voice" as const,
    icon: Calendar,
    accent: BRAND.colors.primary,
    badge: "Scheduling",
    firstMessage:
      "Hello, thanks for calling. I can help schedule, reschedule, or confirm an appointment.",
  },
  {
    id: "scheduler-realestate",
    category: "Scheduling",
    name: "Tour Booker",
    description:
      "Qualifies interested buyers, books property tours, and keeps listing follow-up from falling through.",
    role: "lead_qualifier",
    channel: "voice" as const,
    icon: Building2,
    accent: BRAND.colors.primary,
    badge: "Real estate",
    firstMessage:
      "Hi, I’m calling about [Property Address]. Are you still interested in scheduling a showing?",
  },
  {
    id: "ecommerce-support",
    category: "E-commerce",
    name: "Order Support",
    description:
      "Handles order status, returns, address changes, inventory questions, and discount follow-up.",
    role: "ecommerce",
    channel: "voice" as const,
    icon: Receipt,
    accent: BRAND.colors.onSurfaceMuted,
    badge: "Shopify · Square",
    firstMessage:
      "Thanks for calling. I can help with order status, returns, or anything about your purchase.",
  },
  {
    id: "personal-concierge",
    category: "Personal & Lifestyle",
    name: "Personal Concierge",
    description:
      "Books appointments, handles follow-ups, screens calls, and takes clear messages on your behalf.",
    role: "personal_assistant",
    channel: "voice" as const,
    icon: User,
    accent: BRAND.colors.primary,
    badge: "Personal",
    firstMessage: "Hi, this is [Your Name]’s agent. How can I help you today?",
  },
  {
    id: "personal-screener",
    category: "Personal & Lifestyle",
    name: "Call Screener",
    description:
      "Picks up unknown numbers, filters spam, takes legitimate messages, and only interrupts when it matters.",
    role: "personal_assistant",
    channel: "voice" as const,
    icon: PhoneIncoming,
    accent: BRAND.colors.primary,
    badge: "Inbound",
    firstMessage:
      "Hi, you’ve reached [Your Name]’s line. Can I take a quick message or let them know what this is about?",
  },
] as const;

type Template = (typeof AGENT_TEMPLATES)[number];
type TemplateChannel = Template["channel"];

const CATEGORIES = [
  "All",
  "Sales & Revenue",
  "Customer Support",
  "Scheduling",
  "E-commerce",
  "Personal & Lifestyle",
] as const;

const CHANNEL_LABELS: Record<TemplateChannel, string> = {
  voice: "Voice",
  email: "Email",
};

const DEFAULT_GENDER_BY_TEMPLATE: Record<string, "female" | "male"> = {
  "sales-sdr": "male",
  "sales-closer": "male",
  "lead-qualifier-inbound": "female",
  "support-tier1": "female",
  "support-email": "female",
  "scheduler-medical": "female",
  "scheduler-realestate": "male",
  "ecommerce-support": "female",
  "personal-concierge": "female",
  "personal-screener": "female",
};

function TemplateCard({
  template,
  onUseTemplate,
  creating,
  createdCount,
}: {
  template: Template;
  onUseTemplate: (t: Template) => void;
  creating: boolean;
  createdCount: number;
}) {
  const [hovered, setHovered] = useState(false);
  const Icon = template.icon;
  const alreadyCreated = createdCount > 0;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.96 }}
      whileHover={{ y: -2 }}
      className={cn(
        "group relative flex flex-col overflow-hidden rounded-md border border-border bg-card transition-all duration-300 card-interactive-premium",
        hovered ? "border-brand/20 shadow-md shadow-brand/8" : "shadow-sm",
      )}
      data-accent={template.accent}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div className="pointer-events-none absolute -right-8 -top-8 hidden h-32 w-32 rounded-full opacity-0 blur-3xl transition-opacity group-hover:opacity-30 md:block" />

      <div className="relative z-10 flex flex-1 flex-col gap-3 p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-[var(--wireline-color-feedback-success-surface)]">
            <Icon className="h-5 w-5 text-[var(--wireline-color-action-primary-default)]" />
          </div>

          <div className="flex flex-wrap items-center justify-end gap-1.5">
            {alreadyCreated && (
              <span
                className="flex items-center gap-1 rounded-full border px-1.5 py-0.5 leading-none wl-label wl-status-success wl-text-success"
                title={
                  createdCount === 1 ? "Already in your agents" : `${createdCount} in your agents`
                }
              >
                <Check className="h-2.5 w-2.5" />
                {createdCount === 1 ? "In your agents" : `In your agents ×${createdCount}`}
              </span>
            )}
            <span
              className={cn(
                "rounded-full border px-1.5 py-0.5 leading-none wl-label",
                template.channel === "email"
                  ? "border-border bg-muted text-foreground/70"
                  : "border-brand/30 bg-brand/10 text-brand",
                alreadyCreated && "hidden sm:inline-flex",
              )}
            >
              {CHANNEL_LABELS[template.channel]}
            </span>
            {template.badge && (
              <span className="hidden rounded-full border border-border bg-muted px-1.5 py-0.5 leading-none text-foreground/70 wl-label sm:inline-flex">
                {template.badge}
              </span>
            )}
          </div>
        </div>

        <div>
          <h3 className="text-base font-semibold leading-tight tracking-[-0.01em] text-foreground">
            {template.name}
          </h3>
          <p className="mt-1 text-xs leading-relaxed text-foreground/70">{template.description}</p>
        </div>

        <AnimatePresence>
          {hovered && (
            <motion.div
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 4 }}
              className="relative rounded-md border bg-[var(--wireline-color-surface-subtle)] p-3 text-[var(--wireline-typography-caption-size)] italic leading-relaxed text-[var(--wireline-color-text-secondary)]/80"
            >
              <MessageCircle className="absolute -left-1.5 -top-2 h-4 w-4 text-[var(--wireline-color-action-primary-default)]" />
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
          onClick={() => onUseTemplate(template)}
          disabled={creating}
          className="flex w-full items-center justify-center gap-2 shadow-sm !py-2 !text-[var(--wireline-typography-overline-size)] !tracking-[0.22em]"
        >
          {creating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
          {alreadyCreated ? "Use again" : "Use template"}
        </ShadButton>
      </div>
    </motion.div>
  );
}

function CustomAgentCard() {
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex min-h-[240px] flex-col items-center justify-center gap-3 rounded-md border border-dashed border-brand/25 p-6 text-center"
    >
      <div className="flex h-12 w-12 items-center justify-center rounded-md border border-border bg-card">
        <Sparkles className="h-5 w-5 text-brand" />
      </div>
      <div className="space-y-1">
        <h3 className="text-base font-semibold tracking-[-0.01em] text-foreground">Custom agent</h3>
        <p className="max-w-[12.5rem] text-[var(--wireline-typography-caption-size)] leading-relaxed text-foreground/70">
          Start from a blank agent and train it around your exact workflow.
        </p>
      </div>
      <ClaudeRecipeButton recipe="agent-wire" label="Start custom agent" variant="ghost" />
    </motion.div>
  );
}

export default function AgentTemplates() {
  const navigate = useNavigate();
  const { success: toastSuccess, error: toastError } = useToast();

  const [activeCategory, setActiveCategory] = useState<(typeof CATEGORIES)[number]>("All");
  const [search, setSearch] = useState("");
  const [creatingTemplateId, setCreatingTemplateId] = useState<string | null>(null);
  const [createdNames, setCreatedNames] = useState<string[]>([]);
  const [modalTemplate, setModalTemplate] = useState<Template | null>(null);

  const refetchAgents = async () => {
    try {
      const r = await authFetch("/api/agents");
      if (!r.ok) return;
      const data = (await r.json()) as { agents?: Array<{ name?: string | null }> };
      setCreatedNames((data.agents ?? []).map((a) => (a.name ?? "").toLowerCase()));
    } catch {
      /* non-critical — gallery still works without the badge */
    }
  };

  useEffect(() => {
    refetchAgents();
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

  const createdCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const n of createdNames) {
      counts.set(n, (counts.get(n) ?? 0) + 1);
    }
    return counts;
  }, [createdNames]);

  const q = search.toLowerCase();
  const visible = AGENT_TEMPLATES.filter((t) => {
    const matchesCategory = activeCategory === "All" || t.category === activeCategory;
    const matchesSearch =
      !q ||
      t.name.toLowerCase().includes(q) ||
      t.description.toLowerCase().includes(q) ||
      t.category.toLowerCase().includes(q);
    return matchesCategory && matchesSearch;
  });

  const handleOpenTemplate = (template: Template) => {
    if (creatingTemplateId) return;
    setModalTemplate(template);
  };

  const handleConfirmedCreate = async (values: DeployValues) => {
    if (!modalTemplate) return;
    setCreatingTemplateId(modalTemplate.id);
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
        toastError("Creation failed", errorMessage);
        setCreatingTemplateId(null);
        return;
      }
      toastSuccess("Agent created", values.name);
      setModalTemplate(null);
      setCreatingTemplateId(null);
      await refetchAgents();
      window.dispatchEvent(new Event(AGENTS_CHANGED_EVENT));
      const createdId =
        typeof data === "object" && data && "id" in data && typeof data.id === "string"
          ? data.id
          : uniqueId;
      navigate(`/studio?agent=${encodeURIComponent(createdId)}`);
    } catch {
      toastError("Creation failed", "Could not reach the server. Please try again.");
      setCreatingTemplateId(null);
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="flex shrink-0 flex-col gap-3 border-b border-border px-4 py-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted/70" />
          <Input
            type="search"
            aria-label="Search templates"
            placeholder="Search templates…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-md border border-border bg-muted/20 py-2 pl-9 pr-4 text-sm text-foreground outline-none placeholder:text-muted/70 focus:border-brand/50"
          />
        </div>

        <div className="flex flex-wrap gap-1.5">
          {CATEGORIES.map((cat) => (
            <ShadButton
              key={cat}
              type="button"
              disableAnimations
              variant={activeCategory === cat ? "secondary" : "outline"}
              size="sm"
              onClick={() => setActiveCategory(cat)}
              className={cn(
                "rounded-full wl-label",
                activeCategory === cat
                  ? "border-brand/40 bg-brand/15 text-brand"
                  : "text-muted hover:border-brand/25 hover:text-foreground",
              )}
            >
              {cat}
            </ShadButton>
          ))}
        </div>
      </div>

      <div className="min-h-0 flex-1 px-4 py-4 scroll-viewport">
        <AnimatePresence mode="popLayout">
          {visible.length === 0 && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="py-20 text-center font-[var(--wireline-font-family-display)] text-lg text-[var(--wireline-color-text-tertiary)]"
            >
              No templates match your search
            </motion.div>
          )}
        </AnimatePresence>

        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 sm:gap-3 lg:grid-cols-3">
          <AnimatePresence mode="popLayout">
            {visible.map((template) => (
              <TemplateCard
                key={template.id}
                template={template}
                onUseTemplate={handleOpenTemplate}
                creating={creatingTemplateId === template.id}
                createdCount={createdCounts.get(template.name.toLowerCase()) ?? 0}
              />
            ))}
          </AnimatePresence>

          <CustomAgentCard />
        </div>
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
          if (creatingTemplateId) return;
          setModalTemplate(null);
        }}
        onConfirm={handleConfirmedCreate}
        deploying={creatingTemplateId === modalTemplate?.id}
      />
    </div>
  );
}
