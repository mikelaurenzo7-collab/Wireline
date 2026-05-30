/* eslint-disable @typescript-eslint/no-explicit-any -- API response shapes vary by endpoint and aren't shared as client types yet. */
import React, { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "motion/react";
import {
  Sparkles,
  Hammer,
  Globe,
  Phone,
  Mic,
  Check,
  ArrowRight,
  Waves,
  PlayCircle,
  PhoneCall,
  Mail,
  Link2,
  BarChart3,
  Users,
  Zap,
  Rocket,
} from "lucide-react";
import { authFetch } from "../lib/api";
import WirelineMark from "./WirelineMark";
import { ClaudeRecipeButton } from "./ClaudeRecipes";
import { useToast } from "../contexts/ToastContext";
import { Skeleton } from "./Skeleton";
import { getSignupWedgeRecommendation } from "../lib/signup-intent";
import FastStartWizard from "./FastStartWizard";
import YoureLiveModal from "./YoureLiveModal";

interface ProgressData {
  agents: number;
  knowledge: number;
  numbers: number;
  calls: number;
}

const STEPS = [
  {
    id: "agent",
    title: "Create your first agent",
    body: "Describe what your agent should do in one sentence. We'll generate the name, personality, instructions, and starter knowledge for you.",
    icon: Hammer,
    accent: "#8B3FD6",
    badge: "~30 seconds",
  },
  {
    id: "knowledge",
    title: "Teach it about your business",
    body: "Paste your website URL and we'll pull in your services, pricing, hours, and policies automatically — ready in one click.",
    icon: Globe,
    accent: "#8B3FD6",
    badge: "Instant",
  },
  {
    id: "number",
    title: "Wire up a phone number",
    body: "Every Wireline plan includes a dedicated voice number — no Twilio bill, no separate setup. Provision yours in Integrations and route inbound calls to your agent.",
    icon: Phone,
    accent: "#8B3FD6",
    badge: "1 click",
  },
  {
    id: "call",
    title: "Run a live test call",
    body: "Talk to your agent live from your browser — no phone needed. Make sure it sounds the way you want.",
    icon: Mic,
    accent: "#8B3FD6",
    badge: "Try it now",
  },
] as const;

export default function OnboardingQuickstart({
  onComplete,
}: {
  onComplete?: (completed: boolean) => void;
}) {
  const [progress, setProgress] = useState<ProgressData | null>(null);
  const [loading, setLoading] = useState(true);
  // Tier drives whether we show the 4-step self-serve flow or a
  // white-glove onboarding card (Business / Enterprise tier). Without
  // this gate, a 500-seat call center buyer lands on the same setup
  // screen as a $49 solo operator — sets the wrong expectations.
  const [planId, setPlanId] = useState<string | null>(null);
  const [signupWedge, setSignupWedge] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const { success: toastSuccess } = useToast();
  const navigate = useNavigate();

  // Fast Start Wizard state
  const [showFastStart, setShowFastStart] = useState(false);

  // You're Live celebration state
  const [showYoureLive, setShowYoureLive] = useState(false);
  const [completionData, setCompletionData] = useState<{
    agentName: string;
    phoneNumber: string | null;
    timeToFirstCallMs: number;
    knowledgeItems: number;
  } | null>(null);

  // Check if user has dismissed the onboarding card
  useEffect(() => {
    if (localStorage.getItem("wireline_onboarding_dismissed") === "true") {
      setDismissed(true);
    }
  }, []);

  const handleDismiss = () => {
    localStorage.setItem("wireline_onboarding_dismissed", "true");
    setDismissed(true);
  };

  useEffect(() => {
    (async () => {
      try {
        const [a, k, n, c, billingStatus] = await Promise.all([
          authFetch("/api/agents")
            .then((r) => r.json())
            .then((d) => d.agents?.length ?? 0)
            .catch(() => 0),
          authFetch("/api/agent-config/default-agent")
            .then((r) => r.json())
            .then((d) => d.knowledge?.length ?? 0)
            .catch(() => 0),
          authFetch("/api/phone-numbers")
            .then((r) => r.json())
            .then((d) => d.numbers?.length ?? 0)
            .catch(() => 0),
          authFetch("/api/calls?limit=1")
            .then((r) => r.json())
            .then((d) => d.total ?? 0)
            .catch(() => 0),
          authFetch("/api/billing/status")
            .then((r) => r.json())
            .then((d) => ({
              planId:
                d.subscription?.plan_id || d.subscription?.plan || d.signup_intent?.plan_id || null,
              signupWedge: d.signup_intent?.wedge || null,
            }))
            .catch(() => null),
        ]);
        setProgress({ agents: a, knowledge: k, numbers: n, calls: c });
        setPlanId(billingStatus?.planId || null);
        setSignupWedge(billingStatus?.signupWedge || null);

        const isComplete = a > 0 && k > 0 && n > 0 && c > 0;

        // Timer tracking logic
        if (!isComplete) {
          if (!localStorage.getItem("wireline_onboarding_start")) {
            localStorage.setItem("wireline_onboarding_start", Date.now().toString());
          }
        } else {
          const startTs = localStorage.getItem("wireline_onboarding_start");
          const celebrated = localStorage.getItem("wireline_onboarding_celebrated");

          if (startTs && !celebrated) {
            const elapsedMs = Date.now() - parseInt(startTs, 10);
            const elapsedMins = Math.max(1, Math.round(elapsedMs / 60000));

            // Celebrate the time-to-first-value!
            setTimeout(() => {
              toastSuccess(
                "Incredible speed 🚀",
                `You got your first AI agent live in just ${elapsedMins} minute${elapsedMins === 1 ? "" : "s"}!`,
              );
            }, 500); // Slight delay for dramatic effect after rendering the AllSetCard

            localStorage.setItem("wireline_onboarding_celebrated", "true");
          }
        }

        onComplete?.(isComplete);
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one-time mount load
  }, []);

  /**
   * Business / Enterprise customers don't onboard themselves. Show a
   * white-glove card pointing them at human-led onboarding instead of
   * the 4-step self-serve flow. The CTAs route to Maya (our scheduling
   * agent) and the company support inbox — (630) 642-5927 and
   * trywireline@yahoo.com.
   */
  if (planId === "business" || planId === "enterprise") {
    return (
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative aurora-ring rounded-3xl"
      >
        <div className="relative rounded-3xl glass-strong overflow-hidden p-6 md:p-8">
          <div
            className="absolute -top-32 -right-32 w-96 h-96 rounded-full max-w-[60vw] max-h-[60vw] sm:max-w-none sm:max-h-none opacity-30 blur-3xl pointer-events-none"
            style={{ background: "radial-gradient(circle, #8B3FD6, transparent)" }}
          />
          <div
            className="absolute -bottom-40 -left-40 w-96 h-96 rounded-full max-w-[60vw] max-h-[60vw] sm:max-w-none sm:max-h-none opacity-25 blur-3xl pointer-events-none"
            style={{ background: "radial-gradient(circle, #8B3FD6, transparent)" }}
          />
          <div className="relative z-10 flex flex-col md:flex-row md:items-center md:justify-between gap-5">
            <div className="flex items-start gap-4 flex-1 min-w-0">
              <div
                className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0"
                style={{ background: "linear-gradient(135deg, #8B3FD6, #8B3FD6, #8B3FD6)" }}
              >
                <Sparkles className="w-5 h-5 text-paper" strokeWidth={2.5} />
              </div>
              <div className="min-w-0">
                <div className="text-[10px] uppercase tracking-[0.4em] text-brand flex items-center gap-1.5 mb-1">
                  White-glove onboarding · {planId === "enterprise" ? "Enterprise" : "Business"}
                </div>
                <h2 className="font-display italic text-2xl md:text-3xl text-ink leading-tight">
                  Let's get your fleet live
                </h2>
                <p className="text-sm text-muted/80 mt-1.5 leading-relaxed max-w-xl">
                  Your account includes a dedicated onboarding session — voice cloning,
                  integrations, team setup, and the first 100 calls reviewed together. Book a 30-min
                  kickoff with our scheduling lead and we'll have your first agent live within 48
                  hours.
                </p>
              </div>
            </div>
            <div className="flex flex-col gap-2 shrink-0 w-full md:w-auto">
              <a
                href="tel:+16306425927"
                className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-full bg-brand text-on-brand text-[11px] uppercase tracking-[0.3em] hover:bg-brand/90 transition-colors"
              >
                <Phone className="w-3.5 h-3.5" />
                Call Maya — (630) 642-5927
              </a>
              <a
                href="mailto:trywireline@yahoo.com?subject=Wireline%20kickoff"
                className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-full glass border border-white/12 text-ink text-[11px] uppercase tracking-[0.3em] hover:border-white/24 transition-colors"
              >
                <Mail className="w-3.5 h-3.5" />
                Email the founder
              </a>
            </div>
          </div>
        </div>
      </motion.div>
    );
  }

  // User has dismissed the onboarding card
  if (dismissed) {
    return null;
  }

  if (loading || !progress)
    return (
      <div className="space-y-3 px-1 py-2">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="flex items-center gap-3">
            <Skeleton className="w-6 h-6 rounded-full shrink-0" accent="violet" />
            <Skeleton
              className="h-4 rounded-lg"
              style={{ width: `${60 + i * 10}%` }}
              accent="violet"
            />
          </div>
        ))}
      </div>
    );

  const completion = {
    agent: progress.agents > 0,
    knowledge: progress.knowledge > 0,
    number: progress.numbers > 0,
    call: progress.calls > 0,
  };
  const completedCount = Object.values(completion).filter(Boolean).length;
  const completionPct = Math.round((completedCount / STEPS.length) * 100);
  const wedgeRecommendation = getSignupWedgeRecommendation(signupWedge);

  // When all 4 steps are complete, show a compact "you're all set" card.
  if (completedCount === STEPS.length) {
    return (
      <>
        <AllSetCard
          onDismiss={handleDismiss}
          onCelebrate={() => {
            // Show the celebration modal with time to first call
            const startTs = localStorage.getItem("wireline_onboarding_start");
            const elapsedMs = startTs ? Date.now() - parseInt(startTs, 10) : 0;

            setCompletionData({
              agentName: progress?.agents > 0 ? "Your AI Agent" : "My Receptionist",
              phoneNumber: progress?.numbers > 0 ? null : null, // Would need actual number from state
              timeToFirstCallMs: elapsedMs,
              knowledgeItems: progress?.knowledge ?? 0,
            });
            setShowYoureLive(true);
          }}
        />

        <AnimatePresence>
          {showYoureLive && completionData && (
            <YoureLiveModal
              isOpen={showYoureLive}
              onClose={() => setShowYoureLive(false)}
              agentName={completionData.agentName}
              phoneNumber={completionData.phoneNumber}
              timeToFirstCallMs={completionData.timeToFirstCallMs}
              knowledgeItems={completionData.knowledgeItems}
              onTestCall={() => navigate("/")}
              onViewDashboard={() => navigate("/")}
            />
          )}
        </AnimatePresence>
      </>
    );
  }

  // Find the first incomplete step so we can spotlight it.
  const activeStepId = STEPS.find((s) => !completion[s.id as keyof typeof completion])?.id ?? null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="relative aurora-ring rounded-3xl"
    >
      <div className="relative rounded-3xl glass-strong overflow-hidden">
        <div
          className="absolute -top-32 -right-32 w-96 h-96 rounded-full max-w-[60vw] max-h-[60vw] sm:max-w-none sm:max-h-none opacity-30 blur-3xl pointer-events-none"
          style={{ background: "radial-gradient(circle, #8B3FD6, transparent)" }}
        />
        <div
          className="absolute -bottom-40 -left-40 w-96 h-96 rounded-full max-w-[60vw] max-h-[60vw] sm:max-w-none sm:max-h-none opacity-25 blur-3xl pointer-events-none"
          style={{ background: "radial-gradient(circle, #8B3FD6, transparent)" }}
        />

        {/* Header — tightened so the 4 step cards land above the fold
            even at 900px viewport heights. Previously px-7 + pt-8 + pb-6
            + 12x12 logo + text-4xl heading pushed the steps down ~150px;
            this trims ~60px without losing the welcome moment. */}
        <div className="relative z-10 px-4 md:px-5 pt-4 pb-3 border-b border-white/8">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-3">
              <div
                className="w-9 h-9 rounded-xl flex items-center justify-center"
                style={{ background: "linear-gradient(135deg, #8B3FD6, #8B3FD6, #8B3FD6)" }}
              >
                <WirelineMark className="w-4 h-4 text-paper" strokeWidth={130} />
              </div>
              <div>
                <div className="text-[9px] uppercase tracking-[0.4em] text-brand flex items-center gap-1.5">
                  <Sparkles className="w-3 h-3" aria-hidden="true" /> Get started in 4 steps
                </div>
                <h2 className="font-display italic text-lg md:text-xl text-ink leading-tight mt-0.5">
                  Welcome to WIRELINE
                </h2>
              </div>
            </div>
            <div className="flex items-center gap-2.5">
              <span className="text-[10px] uppercase tracking-[0.3em] text-muted">
                {completedCount} / {STEPS.length} done
              </span>
              <div className="w-28 h-1.5 rounded-full bg-black/10 overflow-hidden">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${completionPct}%` }}
                  transition={{ duration: 1, ease: [0.16, 1, 0.3, 1] }}
                  className="h-full rounded-full"
                  style={{ background: "linear-gradient(90deg, #8B3FD6, #8B3FD6, #8B3FD6)" }}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Fast Start CTA — one-shot wizard for <8min time-to-first-call */}
        {completedCount < 2 && (
          <div className="relative z-10 px-3 md:px-4 pt-3">
            <div className="rounded-2xl border border-emerald-500/30 bg-gradient-to-r from-emerald-500/10 to-brand/5 p-3 flex flex-col sm:flex-row sm:items-center gap-3">
              <div className="flex-1 min-w-0">
                <p className="text-[9px] uppercase tracking-[0.34em] text-emerald-600 mb-1 flex items-center gap-1.5">
                  <Rocket className="w-3 h-3" /> Fastest path to live
                </p>
                <p className="text-xs text-ink/70 leading-relaxed">
                  Skip the individual steps. Our guided wizard combines agent creation, business
                  knowledge, voice, and phone number into one streamlined flow — under 3 minutes.
                </p>
              </div>
              <button
                onClick={() => setShowFastStart(true)}
                className="shrink-0 px-4 py-2.5 rounded-full bg-gradient-to-r from-emerald-500 to-brand text-white text-[10px] uppercase tracking-[0.28em] hover:shadow-lg hover:shadow-brand/20 transition-all inline-flex items-center justify-center gap-1.5"
              >
                <Rocket className="w-3.5 h-3.5" />
                Fast Start Wizard
                <ArrowRight className="w-3 h-3" />
              </button>
            </div>
          </div>
        )}

        {wedgeRecommendation && !completion.agent && (
          <div className="relative z-10 px-3 md:px-4 pt-3">
            <div className="rounded-2xl border border-brand/20 bg-brand/5 p-3 flex flex-col sm:flex-row sm:items-center gap-3">
              <div className="flex-1 min-w-0">
                <p className="text-[9px] uppercase tracking-[0.34em] text-brand mb-1">
                  Matched setup · {wedgeRecommendation.label}
                </p>
                <p className="text-xs text-ink/70 leading-relaxed">
                  Start with the <strong>{wedgeRecommendation.templateLabel}</strong> template, then
                  tune the script to your business.
                </p>
              </div>
              <Link
                to={`/agents?template=${encodeURIComponent(wedgeRecommendation.templateId)}`}
                className="shrink-0 px-3 py-2 rounded-full bg-brand text-on-brand text-[10px] uppercase tracking-[0.28em] hover:bg-brand/90 transition-colors inline-flex items-center justify-center gap-1.5"
              >
                Deploy matched agent
                <ArrowRight className="w-3 h-3" />
              </Link>
            </div>
          </div>
        )}

        {/* Steps — 4 columns on lg so all four 'Get Started' cards fit
            in a single row above the fold. 2 cols on tablet, 1 on mobile. */}
        <div className="relative z-10 p-3 md:p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
          {STEPS.map((s, i) => (
            <Step
              key={s.id}
              step={s}
              index={i}
              done={completion[s.id as keyof typeof completion]}
              isActive={s.id === activeStepId}
              recommendedTemplateId={wedgeRecommendation?.templateId ?? null}
              recommendedTemplateLabel={wedgeRecommendation?.templateLabel ?? null}
            />
          ))}
        </div>

        {/* Demo call CTA strip */}
        {!completion.call && completion.agent && (
          <div className="relative z-10 px-7 md:px-10 pb-7 pt-0">
            <div className="rounded-2xl border border-brand/20 bg-brand/5 p-4 flex flex-col sm:flex-row sm:items-center gap-3">
              <div className="flex items-center gap-3 flex-1">
                <PhoneCall className="w-5 h-5 text-brand shrink-0" />
                <div>
                  <p className="text-sm font-medium text-ink leading-tight">
                    Your agent is ready to talk
                  </p>
                  <p className="text-xs text-ink/65 mt-0.5">
                    Open the dashboard and select <strong>Start Test Call</strong> to place a live
                    browser test.
                  </p>
                </div>
              </div>
              <Link
                to="/"
                className="shrink-0 px-4 py-2.5 rounded-full glass border border-brand/40 text-[11px] uppercase tracking-[0.3em] text-brand hover:bg-brand/10 hover:border-brand/60 transition-all flex items-center gap-2"
              >
                <PlayCircle className="w-3.5 h-3.5" />
                Open Dashboard
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>
          </div>
        )}

        {/* Power Up: integration connect cards — shown once at least 2 core steps are done */}
        {completedCount >= 2 && (
          <div className="relative z-10 px-7 md:px-10 pb-7 pt-0">
            <div className="app-section-title mb-3 flex items-center gap-2">
              <Link2 className="w-3 h-3" /> Power up your fleet
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <PowerUpCard
                icon={Mail}
                label="Connect Email"
                desc="Link Gmail or Outlook for email agents."
                to="/admin"
                accent="#8B3FD6"
              />
              <PowerUpCard
                icon={BarChart3}
                label="Connect CRM"
                desc="Salesforce or HubSpot — sync calls and deals."
                to="/admin"
                accent="#8B3FD6"
              />
              <PowerUpCard
                icon={Waves}
                label="Webhooks & SLOs"
                desc="Push events to Slack, CRM, or Zapier."
                to="/admin"
                accent="#8B3FD6"
              />
            </div>
          </div>
        )}
      </div>

      {/* Fast Start Wizard Modal */}
      <AnimatePresence>
        {showFastStart && (
          <FastStartWizard
            isOpen={showFastStart}
            onClose={() => setShowFastStart(false)}
            onComplete={(result) => {
              // Update local progress state
              setProgress((prev) =>
                prev
                  ? {
                      ...prev,
                      agents: 1,
                      knowledge: result.knowledgeItems,
                      numbers: result.phoneNumber ? 1 : 0,
                    }
                  : prev,
              );

              // Show celebration modal
              setCompletionData({
                agentName: result.agentName,
                phoneNumber: result.phoneNumber,
                timeToFirstCallMs: result.timeToCompleteMs,
                knowledgeItems: result.knowledgeItems,
              });

              // Small delay for smooth transition
              setTimeout(() => {
                setShowYoureLive(true);
              }, 300);
            }}
          />
        )}
      </AnimatePresence>

      {/* You're Live Celebration Modal */}
      <AnimatePresence>
        {showYoureLive && completionData && (
          <YoureLiveModal
            isOpen={showYoureLive}
            onClose={() => setShowYoureLive(false)}
            agentName={completionData.agentName}
            phoneNumber={completionData.phoneNumber}
            timeToFirstCallMs={completionData.timeToFirstCallMs}
            knowledgeItems={completionData.knowledgeItems}
            onTestCall={() => navigate("/")}
            onViewDashboard={() => navigate("/")}
          />
        )}
      </AnimatePresence>
    </motion.div>
  );
}

const Step: React.FC<{
  step: (typeof STEPS)[number];
  index: number;
  done: boolean;
  isActive: boolean;
  recommendedTemplateId: string | null;
  recommendedTemplateLabel: string | null;
}> = ({ step, index, done, isActive, recommendedTemplateId, recommendedTemplateLabel }) => {
  const Icon = step.icon;
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ y: -4, scale: 1.02 }}
      transition={{ delay: 0.05 * index }}
      className="relative aurora-ring rounded-2xl"
    >
      <div
        className={`relative rounded-xl glass border p-3.5 overflow-hidden h-full flex flex-col gap-2.5 transition-all duration-300 ${
          done
            ? "border-emerald-500/40 shadow-sm shadow-emerald-500/5 bg-emerald-500/[0.02]"
            : isActive
              ? "border-brand/40 shadow-md shadow-brand/10 bg-brand/[0.01] active-neon-card"
              : "border-black/5 hover:border-black/15 hover:bg-black/[0.01]"
        }`}
      >
        <div
          className="absolute -top-10 -right-10 w-24 h-24 rounded-full opacity-20 blur-3xl pointer-events-none"
          style={{ background: `radial-gradient(circle, ${step.accent}, transparent)` }}
        />
        <div className="relative z-10 flex items-start justify-between">
          <div
            className={`w-9 h-9 rounded-xl glass border flex items-center justify-center transition-all duration-300 ${
              done
                ? "border-emerald-500/40 text-emerald-500 shadow-sm shadow-emerald-500/10"
                : isActive
                  ? "border-brand/40 text-brand shadow-sm shadow-brand/10"
                  : "border-black/10 text-muted"
            }`}
            style={!done ? { color: step.accent } : {}}
          >
            {done ? (
              <motion.div
                initial={{ scale: 0, rotate: -45 }}
                animate={{ scale: 1, rotate: 0 }}
                transition={{ type: "spring", stiffness: 300, damping: 20 }}
              >
                <Check className="w-4 h-4" strokeWidth={2.5} />
              </motion.div>
            ) : (
              <Icon className="w-4 h-4" />
            )}
          </div>
          <div className="flex items-center gap-1.5">
            {!done && isActive && (
              <span className="text-[8px] uppercase tracking-[0.3em] text-brand bg-brand/10 border border-brand/20 px-1.5 py-0.5 rounded-full animate-pulse">
                Next
              </span>
            )}
            <span className="text-[8px] uppercase tracking-[0.25em] text-muted">{step.badge}</span>
          </div>
        </div>
        <div className="relative z-10 flex-1">
          <h3 className="font-display italic text-lg text-ink leading-tight mb-1">{step.title}</h3>
          <p className="text-[12px] text-ink/70 leading-snug">{step.body}</p>
        </div>
        <div className="relative z-10 flex items-center gap-2 mt-auto">
          {done ? (
            <div className="px-3 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-500 text-[9px] uppercase tracking-[0.3em] flex items-center gap-1">
              <Check className="w-3 h-3" /> Complete
            </div>
          ) : (
            <StepCTA
              stepId={step.id}
              recommendedTemplateId={recommendedTemplateId}
              recommendedTemplateLabel={recommendedTemplateLabel}
            />
          )}
        </div>
      </div>
    </motion.div>
  );
};

function StepCTA({
  stepId,
  recommendedTemplateId,
  recommendedTemplateLabel,
}: {
  stepId: string;
  recommendedTemplateId: string | null;
  recommendedTemplateLabel: string | null;
}) {
  if (stepId === "agent" && recommendedTemplateId) {
    return (
      <CTAButton
        to={`/agents?template=${encodeURIComponent(recommendedTemplateId)}`}
        label={
          recommendedTemplateLabel ? `Deploy ${recommendedTemplateLabel}` : "Deploy Matched Agent"
        }
      />
    );
  }
  if (stepId === "agent") return <ClaudeRecipeButton recipe="agent-forge" label="Forge an Agent" />;
  if (stepId === "knowledge")
    return <ClaudeRecipeButton recipe="knowledge-from-url" label="Ingest from URL" />;
  if (stepId === "number") return <CTAButton to="/admin?tab=carrier" label="Provision a Number" />;
  if (stepId === "call")
    return (
      <CTAButton to="/chat" label="Start Test Call" icon={<PlayCircle className="w-3.5 h-3.5" />} />
    );
  return null;
}

function CTAButton({ to, label, icon }: { to: string; label: string; icon?: React.ReactNode }) {
  return (
    <Link
      to={to}
      className="px-4 py-2.5 rounded-full glass border border-brand/30 text-[11px] uppercase tracking-[0.3em] text-brand hover:bg-brand/10 hover:border-brand/60 transition-all flex items-center gap-2"
    >
      {icon ?? <Sparkles className="w-3.5 h-3.5" />}
      {label}
      <ArrowRight className="w-3.5 h-3.5" />
    </Link>
  );
}

function PowerUpCard({
  icon: Icon,
  label,
  desc,
  to,
  accent,
}: {
  icon: any;
  label: string;
  desc: string;
  to: string;
  accent: string;
}) {
  return (
    <Link
      to={to}
      className="rounded-xl glass border border-black/8 p-4 card-interactive group overflow-hidden relative"
    >
      <div
        className="absolute -top-8 -right-8 w-24 h-24 rounded-full opacity-15 blur-2xl pointer-events-none"
        style={{ background: accent }}
      />
      <div
        className="w-7 h-7 rounded-lg flex items-center justify-center mb-2.5 border border-black/8 shrink-0"
        style={{ background: `linear-gradient(135deg, ${accent}18, ${accent}06)`, color: accent }}
      >
        <Icon className="w-3.5 h-3.5" />
      </div>
      <p className="text-[11px] font-medium text-ink leading-tight group-hover:text-brand transition-colors">
        {label}
      </p>
      <p className="text-[10px] text-muted mt-1 leading-relaxed">{desc}</p>
    </Link>
  );
}

/* ──────────────  Completion card (shown when all 4 steps are done)  ──── */

const POWER_LINKS = [
  { to: "/triage", icon: Zap, label: "Triage Inbox", hint: "Review hot leads" },
  { to: "/insights", icon: BarChart3, label: "Insights", hint: "Funnel + analytics" },
  { to: "/agents", icon: Users, label: "Manage Agents", hint: "Edit & train" },
] as const;

function AllSetCard({
  onDismiss,
  onCelebrate,
}: {
  onDismiss: () => void;
  onCelebrate?: () => void;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.97 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
      className="relative aurora-ring rounded-3xl"
    >
      <div className="relative rounded-3xl glass-strong overflow-hidden p-6 md:p-8 flex flex-col h-full">
        {/* Dismiss button */}
        <button
          onClick={onDismiss}
          className="absolute top-4 right-4 text-[10px] uppercase tracking-[0.2em] text-muted hover:text-ink transition-colors"
          aria-label="Dismiss onboarding"
        >
          Dismiss
        </button>
        {/* Aurora glow */}
        <div
          className="absolute -top-20 -right-20 w-64 h-64 rounded-full max-w-[50vw] max-h-[50vw] sm:max-w-none sm:max-h-none opacity-20 blur-3xl pointer-events-none"
          style={{ background: "radial-gradient(circle, #8B3FD6, transparent)" }}
        />
        <div
          className="absolute -bottom-20 -left-20 w-64 h-64 rounded-full max-w-[50vw] max-h-[50vw] sm:max-w-none sm:max-h-none opacity-15 blur-3xl pointer-events-none"
          style={{ background: "radial-gradient(circle, #8B3FD6, transparent)" }}
        />

        {/* Hero row */}
        <div className="relative z-10 flex flex-col items-center text-center gap-4 pb-5">
          {/* Animated checkmark ring */}
          <div className="relative w-16 h-16">
            <motion.div
              className="absolute inset-0 rounded-full"
              style={{
                background: "conic-gradient(from 0deg, #8B3FD6, #8B3FD6, #8B3FD6, #8B3FD6)",
              }}
              animate={{ rotate: 360 }}
              transition={{ duration: 12, repeat: Infinity, ease: "linear" }}
            />
            <div className="absolute inset-[2px] rounded-full glass flex items-center justify-center">
              <Check className="w-7 h-7 text-emerald-400" strokeWidth={2.5} />
            </div>
          </div>

          <div>
            <p className="text-[9px] uppercase tracking-[0.45em] text-emerald-600 mb-1.5 font-medium">
              Setup complete
            </p>
            <h3 className="font-display italic text-3xl text-ink leading-tight">
              You're live on Wireline
            </h3>
            <p className="text-[12px] text-ink/70 mt-1.5 leading-relaxed max-w-[220px] mx-auto">
              Your agents are running. Here's what to do next.
            </p>

            {/* Celebrate button */}
            {onCelebrate && (
              <button
                onClick={onCelebrate}
                className="mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-full bg-brand text-white text-[11px] uppercase tracking-[0.24em] hover:bg-brand/90 transition-all"
              >
                <Sparkles className="w-3.5 h-3.5" />
                View Your Achievement
              </button>
            )}
          </div>
        </div>

        {/* Quick links */}
        <div className="relative z-10 flex flex-col gap-2">
          {POWER_LINKS.map(({ to, icon: Icon, label, hint }) => (
            <Link
              key={to}
              to={to}
              className="group flex items-center gap-3 h-11 rounded-xl glass border border-white/8 px-3.5 hover:border-white/20 hover:bg-white/4 transition-all"
            >
              <div className="w-7 h-7 rounded-lg bg-brand/12 border border-brand/20 flex items-center justify-center shrink-0 text-brand">
                <Icon className="w-3.5 h-3.5" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[11px] text-ink group-hover:text-brand transition-colors">
                  {label}
                </div>
                <div className="text-[8px] uppercase tracking-[0.24em] text-muted">{hint}</div>
              </div>
              <ArrowRight className="w-3.5 h-3.5 text-muted/70 group-hover:text-brand transition-colors shrink-0" />
            </Link>
          ))}
        </div>
      </div>
    </motion.div>
  );
}
