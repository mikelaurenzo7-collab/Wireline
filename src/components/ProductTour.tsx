import React, { useState, useEffect, useCallback } from "react";
import { AnimatePresence, motion } from "motion/react";
import { useNavigate } from "react-router-dom";
import { X } from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import { authFetch } from "../lib/api";

interface TourStep {
  id: string;
  title: string;
  body: string;
  anchor: string | null;
  cta: string;
}

const TOUR_STEPS: TourStep[] = [
  {
    id: "welcome",
    title: "Welcome to WIRELINE",
    body: "You're about to deploy AI voice + email agents that work 24/7. This quick tour shows you where everything lives.",
    anchor: null,
    cta: "Start tour",
  },
  {
    id: "dashboard",
    title: "Your Command Center",
    body: "The Dashboard shows live call activity, today's stats, and AI insights. It updates every 30 seconds automatically.",
    anchor: '[data-tour="dashboard"]',
    cta: "Next",
  },
  {
    id: "agents",
    title: "Your Agent Fleet",
    body: "Each agent has a role (Sales, Support, Scheduler...), a voice, a personality, and its own knowledge base. Your 14-day trial starts with 1 agent and 25 outbound calls.",
    anchor: '[data-tour="agents"]',
    cta: "Next",
  },
  {
    id: "training",
    title: "Train Agents with Wireline AI",
    body: "Type instructions, paste your website URL, or upload a PDF. Wireline AI reads it and extracts facts your agent will use in every call.",
    anchor: '[data-tour="training"]',
    cta: "Next",
  },
  {
    id: "insights",
    title: "AI-Powered Insights",
    body: "After calls, Wireline AI scores leads, clusters topics, and identifies what's working vs. what to fix — automatically.",
    anchor: '[data-tour="insights"]',
    cta: "Next",
  },
  {
    id: "complete",
    title: "You're ready!",
    body: "Start by creating your first agent and giving it a 30-second test call. We'll walk you through it step by step.",
    anchor: null,
    cta: "Build my first agent →",
  },
];

interface AnchorRect {
  top: number;
  left: number;
  width: number;
  height: number;
}

function useAnchorRect(anchor: string | null): AnchorRect | null {
  const [rect, setRect] = useState<AnchorRect | null>(null);

  useEffect(() => {
    if (!anchor) {
      setRect(null);
      return;
    }
    const measure = () => {
      const el = document.querySelector(anchor);
      if (el) {
        const r = el.getBoundingClientRect();
        setRect({ top: r.top, left: r.left, width: r.width, height: r.height });
      } else {
        setRect(null);
      }
    };
    measure();
    const timer = setTimeout(measure, 100);
    return () => clearTimeout(timer);
  }, [anchor]);

  return rect;
}

async function markTourComplete(): Promise<void> {
  try {
    await authFetch("/api/user-preferences", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tour_completed: true }),
    });
  } catch {
    // Non-critical; tour state can be re-shown on next visit
  }
}

export default function ProductTour() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [active, setActive] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const step = TOUR_STEPS[stepIndex];
  const anchorRect = useAnchorRect(active ? step.anchor : null);

  // Load preferences and decide whether to show the tour
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    authFetch("/api/user-preferences")
      .then((r) => r.json())
      .then((prefs) => {
        // Show the tour to brand-new users who have no preferences row yet
        // (tour_completed === undefined) AND to users who explicitly haven't
        // completed it (tour_completed === false). Only suppress when the
        // user has explicitly finished the tour (=== true).
        const onboardingInProgress =
          localStorage.getItem("wireline_onboarding_start") &&
          !localStorage.getItem("wireline_onboarding_celebrated");
        if (!cancelled && prefs?.tour_completed !== true && !onboardingInProgress) {
          setActive(true);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [user]);

  const dismiss = useCallback(async () => {
    setActive(false);
    await markTourComplete();
  }, []);

  const advance = useCallback(async () => {
    if (stepIndex < TOUR_STEPS.length - 1) {
      setStepIndex((i) => i + 1);
    } else {
      // Complete step CTA
      setActive(false);
      await markTourComplete();
      navigate("/agents");
    }
  }, [stepIndex, navigate]);

  if (!active) return null;

  const isCentered = step.anchor === null;
  const isLast = stepIndex === TOUR_STEPS.length - 1;

  return (
    <>
      {/* Anchor highlight ring */}
      <AnimatePresence>
        {anchorRect && (
          <motion.div
            key={step.id + "-ring"}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed z-[900] pointer-events-none rounded-lg animate-pulse"
            style={{
              top: anchorRect.top - 4,
              left: anchorRect.left - 4,
              width: anchorRect.width + 8,
              height: anchorRect.height + 8,
              boxShadow: "0 0 0 2px rgba(0, 0, 0 ,0.7), 0 0 16px rgba(0, 0, 0 ,0.35)",
              border: "2px solid rgba(0, 0, 0 ,0.8)",
            }}
          />
        )}
      </AnimatePresence>

      {/* Backdrop for centered (welcome/complete) steps */}
      <AnimatePresence>
        {isCentered && (
          <motion.div
            key="backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[910] bg-black/60 backdrop-blur-sm"
          />
        )}
      </AnimatePresence>

      {/* Tour card */}
      <AnimatePresence mode="wait">
        <motion.div
          key={step.id}
          initial={isCentered ? { opacity: 0, scale: 0.94, y: 20 } : { opacity: 0, y: 40 }}
          animate={isCentered ? { opacity: 1, scale: 1, y: 0 } : { opacity: 1, y: 0 }}
          exit={isCentered ? { opacity: 0, scale: 0.94, y: -10 } : { opacity: 0, y: 20 }}
          transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
          className={
            isCentered
              ? "fixed z-[920] left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-sm px-4"
              : "fixed z-[920] bottom-6 right-6 w-80"
          }
        >
          <div
            className="glass-elevated rounded-2xl border p-5 shadow-2xl"
            style={{
              borderColor: "rgba(0, 0, 0 , 0.18)",
              boxShadow:
                "0 1px 0 rgba(255,255,255,0.9) inset, 0 24px 64px rgba(0,0,0,0.12), 0 0 0 1px rgba(0, 0, 0 ,0.06)",
            }}
          >
            {/* Header row */}
            <div className="flex items-start justify-between gap-3 mb-3">
              <h3 className="text-sm font-semibold text-ink leading-tight">{step.title}</h3>
              <button
                onClick={dismiss}
                aria-label="Skip tour"
                className="shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-ink/40 hover:text-ink/80 hover:bg-white/8 transition-all"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Body */}
            <p className="text-xs text-ink/65 leading-relaxed mb-4">{step.body}</p>

            {/* Footer: progress dots + CTA */}
            <div className="flex items-center justify-between gap-3">
              {/* Progress dots */}
              <div className="flex items-center gap-1.5">
                {TOUR_STEPS.map((_, i) => (
                  <motion.span
                    key={i}
                    animate={{
                      opacity: i === stepIndex ? 1 : 0.3,
                      scale: i === stepIndex ? 1 : 0.75,
                    }}
                    className="rounded-full"
                    style={{
                      width: i === stepIndex ? 16 : 6,
                      height: 6,
                      background: i === stepIndex ? "#0A0A0A" : "rgba(0,0,0,0.15)",
                      transition: "width 0.3s ease",
                    }}
                  />
                ))}
                <span className="ml-1 text-[9px] text-muted/60 tabular-nums">
                  {stepIndex + 1} / {TOUR_STEPS.length}
                </span>
              </div>

              <div className="flex items-center gap-2">
                {!isLast && stepIndex > 0 && (
                  <button
                    onClick={dismiss}
                    className="text-[10px] uppercase tracking-[0.3em] text-ink/40 hover:text-ink/70 transition-all"
                  >
                    Skip
                  </button>
                )}
                <button
                  onClick={advance}
                  className="brutal-btn !py-1.5 !px-3 !text-[10px] !tracking-[0.25em] whitespace-nowrap"
                >
                  {step.cta}
                </button>
              </div>
            </div>
          </div>
        </motion.div>
      </AnimatePresence>
    </>
  );
}
