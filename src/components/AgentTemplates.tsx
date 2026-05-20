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
import { authFetch, safeJson } from "../lib/api";
import { cn } from "../lib/utils";
import { useToast } from "../contexts/ToastContext";
import { ClaudeRecipeButton } from "./ClaudeRecipes";

// ────────────────────────────────────────────────────────────────────────────
// Template definitions
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
    accent: "#4F1E7B",
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
    accent: "#4F1E7B",
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
    accent: "#4F1E7B",
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
      "Handles FAQs, account questions, and basic troubleshooting. Escalates to human when needed.",
    role: "customer_service",
    channel: "voice" as const,
    icon: Headphones,
    accent: "#10B981",
    badge: null,
    firstMessage:
      "Thank you for calling support. I'm your AI assistant — how can I help you today?",
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
    accent: "#10B981",
    badge: "Email",
    firstMessage:
      "Thank you for reaching out. I've received your message and I'm here to help resolve this for you today.",
  },
  // === SCHEDULING ===
  {
    id: "scheduler-medical",
    category: "Scheduling",
    name: "Medical Office Scheduler",
    description:
      "Books patient appointments, handles cancellations, sends reminders. HIPAA-aware communication style.",
    role: "scheduler",
    channel: "voice" as const,
    icon: Calendar,
    accent: "#4F1E7B",
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
    accent: "#4F1E7B",
    badge: null,
    firstMessage:
      "Welcome to [Salon Name]! I'm your virtual receptionist. Would you like to book an appointment or ask about our services?",
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
    accent: "#4F1E7B",
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
    accent: "#FFC07D",
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
    accent: "#FFC07D",
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
    accent: "#4F1E7B",
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
    accent: "#4F1E7B",
    badge: null,
    firstMessage:
      "Hi! I'm calling on behalf of [Company] — we'd love your feedback on your recent experience. This takes under 2 minutes.",
  },
  // === PERSONAL & LIFESTYLE ===
  // For individuals on the Personal tier ($29/mo, 1 agent) — agents
  // represent a single human rather than a business. Versatile concierge
  // by default plus three specialty sub-types for high-value individual
  // use cases (call screening, errand-running, bill negotiation).
  {
    id: "personal-concierge",
    category: "Personal & Lifestyle",
    name: "Personal Concierge",
    description:
      "Super-versatile personal assistant. Books appointments, handles follow-ups, screens calls, and takes messages — on your behalf.",
    role: "personal_assistant",
    channel: "voice" as const,
    icon: User,
    accent: "#4DFFC4",
    badge: "Personal · most versatile",
    firstMessage: "Hi, this is [Your Name]'s assistant. How can I help you today?",
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
    accent: "#4DFFC4",
    badge: "Personal · inbound",
    firstMessage:
      "Hi, you've reached [Your Name]'s line — I'm their assistant. Can I take a quick message or let them know what this is about?",
  },
  {
    id: "personal-errand",
    category: "Personal & Lifestyle",
    name: "Errand Caller",
    description:
      "Calls dentists, plumbers, hairdressers, restaurants, and government offices to book, confirm, or reschedule on your behalf.",
    role: "personal_assistant",
    channel: "voice" as const,
    icon: ClipboardList,
    accent: "#4DFFC4",
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
    accent: "#4DFFC4",
    badge: "Personal · saves $$",
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
  "Personal & Lifestyle",
] as const;

// Recommended default voice gender per template. Operator can override in
// the deploy modal — this is just a smart starting point so the toggle
// lands on a sensible default for the use case (e.g. assertive collections
// reads better as male, salon receptionist as female).
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
  "personal-concierge": "female",
  "personal-screener": "female",
  "personal-errand": "female",
  "personal-negotiator": "male",
};

// ────────────────────────────────────────────────────────────────────────────
// Template Card
// ────────────────────────────────────────────────────────────────────────────

function TemplateCard({
  template,
  onDeploy,
  deploying,
  deployedCount,
}: {
  key?: any;
  template: Template;
  onDeploy: (t: Template) => void;
  deploying: boolean;
  deployedCount: number;
}) {
  const [hovered, setHovered] = useState(false);
  const Icon = template.icon;
  const alreadyDeployed = deployedCount > 0;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.96 }}
      whileHover={{ y: -4, scale: 1.01 }}
      className={cn(
        "relative rounded-2xl glass border transition-all duration-300 flex flex-col group overflow-hidden card-interactive-premium",
        hovered
          ? "aurora-ring border-transparent shadow-xl shadow-brand/10"
          : "border-white/10 shadow-sm",
      )}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Accent glow on hover */}
      <div
        className="absolute -top-8 -right-8 w-32 h-32 rounded-full blur-3xl opacity-0 group-hover:opacity-30 transition-opacity pointer-events-none"
        style={{ background: template.accent }}
      />

      <div className="relative z-10 p-4 flex flex-col gap-3 flex-1">
        {/* Header row */}
        <div className="flex items-start justify-between gap-2">
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
            style={{ background: `${template.accent}18`, border: `1px solid ${template.accent}40` }}
          >
            <Icon className="w-5 h-5" style={{ color: template.accent }} />
          </div>

          <div className="flex items-center gap-1.5 flex-wrap justify-end">
            {/* Deployed-in-fleet badge — surfaces when this tenant already
                has one or more agents instantiated from this template, so
                operators don't accidentally double-deploy. */}
            {alreadyDeployed && (
              <span
                className="px-1.5 py-0.5 rounded-full border text-[9px] uppercase tracking-[0.22em] leading-none flex items-center gap-1 bg-emerald-500/10 border-emerald-500/30 text-emerald-600"
                title={
                  deployedCount === 1 ? "Already in your fleet" : `${deployedCount} in your fleet`
                }
              >
                <Check className="w-2.5 h-2.5" />
                {deployedCount === 1 ? "Deployed" : `Deployed ×${deployedCount}`}
              </span>
            )}
            {/* Channel badge */}
            <span
              className={cn(
                "px-1.5 py-0.5 rounded-full border text-[9px] uppercase tracking-[0.22em] leading-none",
                template.channel === "email"
                  ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-600"
                  : "bg-brand/10 border-brand/30 text-brand",
              )}
            >
              {template.channel}
            </span>
            {/* Extra badge */}
            {template.badge && (
              <span className="px-1.5 py-0.5 rounded-full bg-white/8 border border-white/15 text-[9px] uppercase tracking-[0.18em] leading-none text-ink/70">
                {template.badge}
              </span>
            )}
          </div>
        </div>

        {/* Name */}
        <div>
          <h3 className="font-display italic text-lg text-ink leading-tight">{template.name}</h3>
          <p className="text-xs text-ink/60 leading-relaxed mt-1">{template.description}</p>
        </div>

        {/* First-message speech bubble on hover */}
        <AnimatePresence>
          {hovered && (
            <motion.div
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 4 }}
              className="rounded-xl p-3 border text-[11px] text-ink/80 leading-relaxed italic relative"
              style={{
                background: `${template.accent}0D`,
                borderColor: `${template.accent}30`,
              }}
            >
              <MessageCircle
                className="absolute -top-2 -left-1.5 w-4 h-4"
                style={{ color: template.accent }}
              />
              <span className="pl-2">&ldquo;{template.firstMessage}&rdquo;</span>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Deploy button — label changes when the template is already in
          the fleet so operators don't double-deploy without realizing it. */}
      <div className="relative z-10 px-4 pb-4">
        <button
          onClick={() => onDeploy(template)}
          disabled={deploying}
          className="brutal-btn w-full !py-2 !text-[11px] !tracking-[0.3em] disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {deploying ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
          {alreadyDeployed ? "Deploy Another" : "Deploy Agent"}
        </button>
      </div>
    </motion.div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Custom Agent card
// ────────────────────────────────────────────────────────────────────────────

function CustomAgentCard() {
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl border border-white/10 border-dashed flex flex-col items-center justify-center gap-3 p-6 text-center min-h-[240px]"
    >
      <div className="w-12 h-12 rounded-2xl glass border border-white/10 flex items-center justify-center">
        <Sparkles className="w-5 h-5 text-brand" />
      </div>
      <div className="space-y-1">
        <h3 className="font-display italic text-lg text-ink">Custom Agent</h3>
        <p className="text-xs text-ink/50 leading-relaxed max-w-[200px]">
          Let Claude Forge design a bespoke agent for your exact use case.
        </p>
      </div>
      <ClaudeRecipeButton recipe="agent-forge" label="Open Agent Forge" variant="ghost" />
    </motion.div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Main component
// ────────────────────────────────────────────────────────────────────────────

export default function AgentTemplates() {
  const navigate = useNavigate();
  const { success: toastSuccess, error: toastError } = useToast();

  const [activeCategory, setActiveCategory] = useState<(typeof CATEGORIES)[number]>("All");
  const [search, setSearch] = useState("");
  const [deploying, setDeploying] = useState<string | null>(null);
  const [deployedNames, setDeployedNames] = useState<string[]>([]);
  const [modalTemplate, setModalTemplate] = useState<Template | null>(null);

  // Pull the current fleet so each template card can render a 'Deployed'
  // badge + 'Deploy Another' button when an agent with the matching name
  // already exists. Refetches after every successful deploy below.
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
    refetchAgents();
  }, []);

  const deployedCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const n of deployedNames) {
      counts.set(n, (counts.get(n) ?? 0) + 1);
    }
    return counts;
  }, [deployedNames]);

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

  // Step 1: clicking "Deploy" opens the modal so the operator can name
  // the agent and pick a voice (male / female + specific voice). Step 2
  // (handleConfirmedDeploy) actually POSTs to /api/agents with the
  // values the operator chose.
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
          // Operator-chosen name (defaults to template.name, fully editable)
          name: values.name,
          channel: modalTemplate.channel,
          role: modalTemplate.role,
          // Operator-chosen voice — 11labs/OpenAI id selected by gender
          // toggle + optional specific voice picker in the modal.
          voice_id: values.voiceId,
          // templateId drives the server-side personality overlay; firstMessage
          // is the opener with {{businessName}}-style placeholders substituted
          // server-side from the operator's settings row.
          templateId: modalTemplate.id,
          firstMessage: modalTemplate.firstMessage,
        }),
      });
      const data = await safeJson(resp);
      if (!resp.ok) {
        toastError("Deployment failed", data.error || "Please try again.");
        setDeploying(null);
        return;
      }
      toastSuccess("Agent deployed", values.name);
      setModalTemplate(null);
      setDeploying(null);
      await refetchAgents();
      navigate("/agents");
    } catch {
      toastError("Deployment failed", "Could not reach the server. Please try again.");
      setDeploying(null);
    }
  };

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Top bar — page title removed per design direction; the left
          nav already labels this "Templates". Search stays. */}
      <div className="px-4 py-3 border-b border-white/8 flex flex-col gap-3 shrink-0">
        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted/60 pointer-events-none" />
          <input
            type="text"
            placeholder="Search templates…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 text-sm bg-black/5 border border-black/10 rounded-xl outline-none focus:border-brand/50 text-ink placeholder:text-muted/50"
          />
        </div>

        {/* Category tabs */}
        <div className="flex gap-1.5 flex-wrap">
          {CATEGORIES.map((cat) => (
            <button
              key={cat}
              onClick={() => setActiveCategory(cat)}
              className={cn(
                "px-3 py-1 rounded-full text-[10px] uppercase tracking-[0.25em] transition-all border",
                activeCategory === cat
                  ? "bg-brand/15 border-brand/40 text-brand"
                  : "glass border-white/10 text-muted hover:text-ink hover:border-white/25",
              )}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* Grid */}
      <div className="flex-1 overflow-y-auto px-4 py-4 scrollbar-hide">
        <AnimatePresence mode="popLayout">
          {visible.length === 0 && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="py-20 text-center text-[10px] uppercase tracking-[0.4em] text-muted/60"
            >
              No templates match your search
            </motion.div>
          )}
        </AnimatePresence>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
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

          {/* Custom agent card always at the end */}
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
                // Recommend a default gender per template — operator can override
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
