import React, { useState, useEffect } from "react";
import { AnimatePresence, motion } from "motion/react";
import { useNavigate } from "react-router-dom";
import { ChevronLeft, Sparkles } from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import { useToast } from "../contexts/ToastContext";
import { authFetch } from "../lib/api";

// ─── Types ───────────────────────────────────────────────────────────────────

type Persona = "solo" | "power" | "technical" | "non_technical";
type Goal = "convert_leads" | "support_customers" | "automate_scheduling" | "collect_payments";
type Situation = "brand_new" | "has_some_setup" | "migrating";

interface OptionCard {
  id: string;
  icon: string;
  label: string;
  description: string;
}

// ─── Data ─────────────────────────────────────────────────────────────────────

const PERSONA_OPTIONS: OptionCard[] = [
  { id: "solo", icon: "🧑‍💼", label: "Solo Operator", description: "I run my business and want AI agents doing the heavy lifting" },
  { id: "power", icon: "🏢", label: "Team Lead / Agency", description: "I manage multiple clients or have a team using Wireline" },
  { id: "technical", icon: "🛠️", label: "Developer / Technical", description: "I'm integrating Wireline into a custom workflow or product" },
  { id: "non_technical", icon: "✨", label: "Business Owner", description: "I'm new to AI agents and want simple, guided setup" },
];

const GOAL_OPTIONS: OptionCard[] = [
  { id: "convert_leads", icon: "🎯", label: "Convert more leads", description: "I want agents handling inbound inquiries and booking demos" },
  { id: "support_customers", icon: "🤝", label: "Support my customers 24/7", description: "My customers need help outside business hours" },
  { id: "automate_scheduling", icon: "📅", label: "Automate scheduling", description: "I want AI booking appointments so I don't play phone tag" },
  { id: "collect_payments", icon: "💰", label: "Recover revenue", description: "Follow up on unpaid invoices and re-engage dormant customers" },
];

const SITUATION_OPTIONS: OptionCard[] = [
  { id: "brand_new", icon: "🚀", label: "Starting fresh", description: "No agents yet, need to set everything up" },
  { id: "has_some_setup", icon: "⚡", label: "Partially set up", description: "I have an account but haven't fully configured things" },
  { id: "migrating", icon: "🔄", label: "Moving from another tool", description: "Replacing an existing system with Wireline" },
];

interface Recommendation {
  headline: string;
  body: string;
  cta: string;
  route: string;
}

const RECOMMENDATIONS: Record<Goal, Recommendation> = {
  convert_leads: {
    headline: "Deploy your first Sales SDR agent",
    body: "Start with the SDR Outbound Prospecting template — it handles qualification and books demos automatically.",
    cta: "Go to Agent Templates",
    route: "/agents",
  },
  support_customers: {
    headline: "Set up a 24/7 support agent",
    body: "The Tier 1 Support template answers FAQs, handles complaints, and escalates when needed — all while you sleep.",
    cta: "Go to Agent Templates",
    route: "/agents",
  },
  automate_scheduling: {
    headline: "Deploy a scheduling agent",
    body: "Pick from Medical Scheduler, Salon Receptionist, or Real Estate Tour Booker — all pre-configured for your industry.",
    cta: "Go to Agent Templates",
    route: "/agents",
  },
  collect_payments: {
    headline: "Launch a collections campaign",
    body: "Your Outbound Dialer paired with a Collections agent is the fastest way to recover revenue without interrupting your day.",
    cta: "Go to Outbound Dialer",
    route: "/outbound",
  },
};

const PERSONA_LABELS: Record<Persona, string> = {
  solo: "Solo Operator",
  power: "Team Lead / Agency",
  technical: "Developer / Technical",
  non_technical: "Business Owner",
};

// ─── Sub-components ────────────────────────────────────────────────────────────

interface SelectCardProps {
  option: OptionCard;
  selected: boolean;
  onSelect: () => void;
  cols?: 2 | 3;
}

function SelectCard({ option, selected, onSelect, cols = 2 }: SelectCardProps) {
  return (
    <motion.button
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
      onClick={onSelect}
      className={[
        "relative text-left rounded-2xl p-4 border transition-all duration-200 cursor-pointer",
        cols === 3 ? "p-4" : "p-5",
        selected
          ? "border-cyan-400/70 bg-cyan-400/10 aurora-ring"
          : "border-white/10 bg-white/4 hover:border-white/20 hover:bg-white/8",
      ].join(" ")}
    >
      {selected && (
        <div className="absolute inset-0 rounded-2xl pointer-events-none"
          style={{ background: "linear-gradient(135deg, rgba(10,200,212,0.08), rgba(197,139,255,0.06))" }}
        />
      )}
      <div className="relative z-10">
        <span className="text-2xl mb-2 block">{option.icon}</span>
        <p className="font-semibold text-sm text-ink mb-1">{option.label}</p>
        <p className="text-xs text-ink/60 leading-relaxed">{option.description}</p>
      </div>
      {selected && (
        <div className="absolute top-2.5 right-2.5 w-5 h-5 rounded-full flex items-center justify-center"
          style={{ background: "linear-gradient(135deg, #0AC8D4, #9B59F5)" }}
        >
          <svg className="w-3 h-3 text-black" fill="none" viewBox="0 0 12 12" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M2 6l3 3 5-5" />
          </svg>
        </div>
      )}
    </motion.button>
  );
}

// ─── Main Component ────────────────────────────────────────────────────────────

export default function PersonaWizard() {
  const { user } = useAuth();
  const { success: toastSuccess, error: toastError } = useToast();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [visible, setVisible] = useState(false);
  const [step, setStep] = useState(0); // 0=step1, 1=step2, 2=step3, 3=recommendation
  const [direction, setDirection] = useState(1); // 1=forward, -1=back

  const [persona, setPersona] = useState<Persona | null>(null);
  const [goal, setGoal] = useState<Goal | null>(null);
  const [situation, setSituation] = useState<Situation | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;

    authFetch("/api/user-preferences")
      .then(async (res) => {
        if (!res.ok || cancelled) return;
        const data = await res.json() as { persona?: string | null; onboarding_completed?: boolean };
        if (!cancelled) {
          // Show wizard only when persona is null/undefined AND onboarding not completed
          const shouldShow = !data.persona && !data.onboarding_completed;
          setVisible(shouldShow);
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [user]);

  if (loading || !visible) return null;

  // ── Helpers ──────────────────────────────────────────────────────────────────

  const goForward = () => {
    setDirection(1);
    setStep((s) => s + 1);
  };

  const goBack = () => {
    setDirection(-1);
    setStep((s) => s - 1);
  };

  const handleSkip = async () => {
    try {
      await authFetch("/api/user-preferences", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ persona: null, onboarding_completed: true }),
      });
    } catch {
      // non-critical
    }
    setVisible(false);
  };

  const handleComplete = async () => {
    if (!persona || !goal || !situation) return;
    setSaving(true);
    try {
      const res = await authFetch("/api/user-preferences", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          persona,
          preferences: { goal, situation },
          onboarding_completed: true,
        }),
      });

      if (!res.ok) throw new Error("Failed to save preferences");

      const rec = RECOMMENDATIONS[goal];
      const route = goal === "convert_leads" ? `${rec.route}?tab=templates` : rec.route;

      setVisible(false);
      navigate(route);
      toastSuccess("Welcome to WIRELINE!", "Your experience is personalized.");
    } catch {
      toastError("Could not save preferences", "Please try again.");
    } finally {
      setSaving(false);
    }
  };

  // ── Slide animation variants ─────────────────────────────────────────────────

  const variants = {
    enter: (dir: number) => ({ x: dir * 60, opacity: 0 }),
    center: { x: 0, opacity: 1 },
    exit: (dir: number) => ({ x: dir * -60, opacity: 0 }),
  };

  const recommendation = goal ? RECOMMENDATIONS[goal] : null;

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div
      className="fixed inset-0 flex items-center justify-center z-[200] p-4"
      style={{ background: "rgba(0,0,0,0.55)", backdropFilter: "blur(20px)" }}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 16 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
        className="relative w-full max-w-2xl"
      >
        {/* Aurora glow ring */}
        <div className="absolute -inset-px rounded-3xl pointer-events-none z-0"
          style={{ background: "linear-gradient(135deg, rgba(10,200,212,0.4), rgba(197,139,255,0.3), rgba(255,107,217,0.25))", borderRadius: "24px" }}
        />

        <div className="relative z-10 rounded-3xl overflow-hidden glass-strong border border-white/10">
          {/* Header accent bar */}
          <div className="h-px w-full" style={{ background: "linear-gradient(90deg, transparent, #0AC8D4, #9B59F5, #E040C0, transparent)" }} />

          <div className="p-8">
            {/* Progress dots */}
            {step < 3 && (
              <div className="flex items-center gap-2 mb-8">
                {[0, 1, 2].map((i) => (
                  <div
                    key={i}
                    className="h-1.5 rounded-full transition-all duration-300"
                    style={{
                      width: i === step ? 32 : 8,
                      background: i <= step
                        ? "linear-gradient(90deg, #0AC8D4, #9B59F5)"
                        : "rgba(255,255,255,0.15)",
                    }}
                  />
                ))}
                <span className="ml-2 text-xs text-ink/40">Step {step + 1} of 3</span>
              </div>
            )}

            {/* Animated step content */}
            <div className="overflow-hidden">
              <AnimatePresence mode="wait" custom={direction}>
                {/* ── Step 1: Persona ── */}
                {step === 0 && (
                  <motion.div
                    key="step-0"
                    custom={direction}
                    variants={variants}
                    initial="enter"
                    animate="center"
                    exit="exit"
                    transition={{ duration: 0.3, ease: "easeInOut" }}
                  >
                    <div className="mb-6">
                      <h2 className="text-2xl font-bold text-ink mb-2">Let's personalize your experience</h2>
                      <p className="text-ink/60 text-sm">3 quick questions — takes 20 seconds</p>
                    </div>
                    <div className="grid grid-cols-2 gap-3 mb-8">
                      {PERSONA_OPTIONS.map((opt) => (
                        <SelectCard
                          key={opt.id}
                          option={opt}
                          selected={persona === opt.id}
                          onSelect={() => setPersona(opt.id as Persona)}
                        />
                      ))}
                    </div>
                    <div className="flex items-center justify-between">
                      <button
                        onClick={handleSkip}
                        className="text-xs text-ink/40 hover:text-ink/60 transition-colors"
                      >
                        Skip for now
                      </button>
                      <button
                        onClick={goForward}
                        disabled={!persona}
                        className="brutal-btn px-6 py-2.5 text-sm disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        Continue →
                      </button>
                    </div>
                  </motion.div>
                )}

                {/* ── Step 2: Goal ── */}
                {step === 1 && (
                  <motion.div
                    key="step-1"
                    custom={direction}
                    variants={variants}
                    initial="enter"
                    animate="center"
                    exit="exit"
                    transition={{ duration: 0.3, ease: "easeInOut" }}
                  >
                    <div className="mb-6">
                      <h2 className="text-2xl font-bold text-ink mb-2">What matters most to you right now?</h2>
                      <p className="text-ink/60 text-sm">We'll tailor your starting point to match.</p>
                    </div>
                    <div className="grid grid-cols-2 gap-3 mb-8">
                      {GOAL_OPTIONS.map((opt) => (
                        <SelectCard
                          key={opt.id}
                          option={opt}
                          selected={goal === opt.id}
                          onSelect={() => setGoal(opt.id as Goal)}
                        />
                      ))}
                    </div>
                    <div className="flex items-center justify-between">
                      <button onClick={goBack} className="flex items-center gap-1.5 text-sm text-ink/50 hover:text-ink/80 transition-colors">
                        <ChevronLeft className="w-4 h-4" /> Back
                      </button>
                      <button
                        onClick={goForward}
                        disabled={!goal}
                        className="brutal-btn px-6 py-2.5 text-sm disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        Continue →
                      </button>
                    </div>
                  </motion.div>
                )}

                {/* ── Step 3: Situation ── */}
                {step === 2 && (
                  <motion.div
                    key="step-2"
                    custom={direction}
                    variants={variants}
                    initial="enter"
                    animate="center"
                    exit="exit"
                    transition={{ duration: 0.3, ease: "easeInOut" }}
                  >
                    <div className="mb-6">
                      <h2 className="text-2xl font-bold text-ink mb-2">How would you describe where you're starting?</h2>
                      <p className="text-ink/60 text-sm">This helps us show you the right first steps.</p>
                    </div>
                    <div className="grid grid-cols-3 gap-3 mb-8">
                      {SITUATION_OPTIONS.map((opt) => (
                        <SelectCard
                          key={opt.id}
                          option={opt}
                          selected={situation === opt.id}
                          onSelect={() => setSituation(opt.id as Situation)}
                          cols={3}
                        />
                      ))}
                    </div>
                    <div className="flex items-center justify-between">
                      <button onClick={goBack} className="flex items-center gap-1.5 text-sm text-ink/50 hover:text-ink/80 transition-colors">
                        <ChevronLeft className="w-4 h-4" /> Back
                      </button>
                      <button
                        onClick={goForward}
                        disabled={!situation}
                        className="brutal-btn px-6 py-2.5 text-sm disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        See my path →
                      </button>
                    </div>
                  </motion.div>
                )}

                {/* ── Step 4: Recommendation ── */}
                {step === 3 && recommendation && persona && goal && (
                  <motion.div
                    key="step-3"
                    custom={direction}
                    variants={variants}
                    initial="enter"
                    animate="center"
                    exit="exit"
                    transition={{ duration: 0.3, ease: "easeInOut" }}
                  >
                    <div className="mb-6 text-center">
                      <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium mb-4"
                        style={{ background: "linear-gradient(135deg, rgba(10,200,212,0.15), rgba(197,139,255,0.15))", border: "1px solid rgba(10,200,212,0.3)" }}
                      >
                        <Sparkles className="w-3.5 h-3.5 text-cyan-300" />
                        <span className="text-cyan-300">Personalized for {PERSONA_LABELS[persona]}</span>
                      </div>
                      <h2 className="text-2xl font-bold text-ink mb-3">Your recommended path</h2>
                    </div>

                    {/* Recommendation card */}
                    <div className="relative rounded-2xl p-6 mb-8 overflow-hidden"
                      style={{
                        background: "linear-gradient(135deg, rgba(10,200,212,0.08), rgba(197,139,255,0.06))",
                        border: "1px solid rgba(10,200,212,0.25)",
                      }}
                    >
                      <div className="absolute -top-12 -right-12 w-40 h-40 rounded-full opacity-20 blur-3xl pointer-events-none"
                        style={{ background: "radial-gradient(circle, #0AC8D4, transparent)" }}
                      />
                      <div className="relative z-10">
                        <h3 className="text-lg font-bold text-ink mb-2">{recommendation.headline}</h3>
                        <p className="text-sm text-ink/70 leading-relaxed">{recommendation.body}</p>
                      </div>
                    </div>

                    <div className="flex items-center justify-between">
                      <button onClick={goBack} className="flex items-center gap-1.5 text-sm text-ink/50 hover:text-ink/80 transition-colors">
                        <ChevronLeft className="w-4 h-4" /> Back
                      </button>
                      <button
                        onClick={handleComplete}
                        disabled={saving}
                        className="brutal-btn px-8 py-2.5 text-sm disabled:opacity-60 disabled:cursor-not-allowed flex items-center gap-2"
                      >
                        {saving ? (
                          <>
                            <div className="w-3.5 h-3.5 rounded-full border-2 border-current border-t-transparent animate-spin" />
                            Saving…
                          </>
                        ) : (
                          <>{recommendation.cta} →</>
                        )}
                      </button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
