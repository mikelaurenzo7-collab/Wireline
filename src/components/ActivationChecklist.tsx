import { useEffect, useState } from "react";
import { Check, Circle, Phone, Sparkles, GraduationCap, Cable, Inbox } from "lucide-react";
import { Link } from "react-router-dom";

import {
  fetchAssistantSetupProgress,
  type AssistantSetupProgress,
} from "../lib/fleet-setup-progress";
import { cn } from "../lib/utils";

const DISMISS_KEY = "wireline_activation_checklist_dismissed";

type Step = {
  id: string;
  label: string;
  detail: string;
  done: boolean;
  href: string;
  icon: typeof Sparkles;
};

function buildSteps(progress: AssistantSetupProgress | null): Step[] {
  const p = progress ?? {
    agents: 0,
    knowledge: 0,
    numbers: 0,
    calls: 0,
    activated: false,
    approvedAction: false,
  };

  return [
    {
      id: "job",
      label: "Job and greeting defined",
      detail: "Give the employee one clear customer-facing responsibility.",
      done: p.agents > 0,
      href: "/studio?section=setup",
      icon: Sparkles,
    },
    {
      id: "facts",
      label: "Business facts added",
      detail: "Add pricing, hours, policies, FAQs, or other answers customers need.",
      done: p.knowledge > 0,
      href: "/studio?section=setup",
      icon: GraduationCap,
    },
    {
      id: "line",
      label: "Phone number connected",
      detail: "Give customers a live path to reach the employee by call or text.",
      done: p.numbers > 0,
      href: "/connections",
      icon: Cable,
    },
    {
      id: "live",
      label: "First live customer handled",
      detail: "Confirm the line received a real conversation and logged the outcome.",
      done: p.activated,
      href: "/phone?tab=logs",
      icon: Phone,
    },
    {
      id: "review",
      label: "First follow-up reviewed",
      detail: "Approve, edit, or decline the next action before it goes out.",
      done: p.approvedAction,
      href: "/approvals",
      icon: Inbox,
    },
  ];
}

export default function ActivationChecklist({ className }: { className?: string }) {
  const [progress, setProgress] = useState<AssistantSetupProgress | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (localStorage.getItem(DISMISS_KEY) === "true") setDismissed(true);
  }, []);

  useEffect(() => {
    let cancelled = false;
    void fetchAssistantSetupProgress().then((nextProgress) => {
      if (!cancelled) setProgress(nextProgress);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const steps = buildSteps(progress);
  const completed = steps.filter((step) => step.done).length;
  const allDone = completed >= steps.length;

  if (dismissed || allDone || !progress || progress.agents === 0) return null;

  const next = steps.find((step) => !step.done);

  return (
    <section
      className={cn("wl-paper wl-paper-elevated p-5 sm:p-6", className)}
      aria-label="Customer readiness checklist"
    >
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="wl-eyebrow wl-eyebrow--primary">Get ready for real customers</p>
          <h2 className="mt-1 text-base font-semibold text-foreground">
            {completed} of {steps.length} customer-ready steps complete
          </h2>
          <p className="mt-1 max-w-2xl text-xs leading-5 text-muted-foreground">
            Test freely in Studio. This checklist tracks only saved setup, live channels, and real customer outcomes.
          </p>
        </div>
        <button
          type="button"
          className="self-start text-xs text-muted-foreground hover:text-foreground"
          onClick={() => {
            localStorage.setItem(DISMISS_KEY, "true");
            setDismissed(true);
          }}
        >
          Hide checklist
        </button>
      </div>

      <ol className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {steps.map((step) => {
          const Icon = step.icon;
          return (
            <li key={step.id}>
              <Link
                to={step.href}
                className={cn(
                  "flex min-h-[76px] items-start gap-3 rounded-[var(--wireline-radius-md)] border px-3 py-3 text-left wl-focus-ring-halo",
                  step.done
                    ? "border-[var(--wireline-color-feedback-success-border)] bg-[var(--wireline-color-feedback-success-surface)] text-foreground"
                    : step.id === next?.id
                      ? "border-primary/40 bg-primary/5 text-foreground"
                      : "border-border bg-card text-muted-foreground",
                )}
              >
                <span className="mt-0.5 flex shrink-0 items-center gap-1.5">
                  {step.done ? (
                    <Check className="size-3.5 text-[var(--wireline-color-action-primary-default)]" />
                  ) : (
                    <Circle className="size-3.5 opacity-50" />
                  )}
                  <Icon className="size-3.5 opacity-70" aria-hidden="true" />
                </span>
                <span className="min-w-0">
                  <span className="block text-xs font-semibold text-foreground">{step.label}</span>
                  <span className="mt-1 block text-[11px] leading-4 text-muted-foreground">
                    {step.detail}
                  </span>
                </span>
              </Link>
            </li>
          );
        })}
      </ol>

      {next ? (
        <div className="mt-4 flex flex-col gap-2 rounded-xl border border-primary/25 bg-primary/5 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-muted-foreground">
            Do this next: <span className="font-semibold text-foreground">{next.label}</span>
          </p>
          <Link to={next.href} className="text-xs font-semibold text-primary hover:underline">
            Continue →
          </Link>
        </div>
      ) : null}
    </section>
  );
}
