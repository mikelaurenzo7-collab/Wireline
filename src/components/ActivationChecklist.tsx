import { useEffect, useState } from "react";
import { Check, Circle, Phone, Sparkles, GraduationCap, Cable, Play, Inbox } from "lucide-react";
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
      id: "agent",
      label: "Agent created",
      done: p.agents > 0,
      href: "/studio?create=1",
      icon: Sparkles,
    },
    {
      id: "train",
      label: "Training source added",
      done: p.knowledge > 0,
      href: "/knowledge",
      icon: GraduationCap,
    },
    {
      id: "wire",
      label: "Number wired",
      done: p.numbers > 0,
      href: "/settings/phone",
      icon: Cable,
    },
    {
      id: "test",
      label: "Voice previewed",
      done: p.calls > 0,
      href: "/knowledge?tab=simulator",
      icon: Play,
    },
    {
      id: "live",
      label: "Live call received",
      done: p.activated,
      href: "/phone?tab=logs",
      icon: Phone,
    },
    {
      id: "approve",
      label: "First action approved",
      done: p.approvedAction,
      href: "/inbox",
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
    void fetchAssistantSetupProgress().then((p) => {
      if (!cancelled) setProgress(p);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const steps = buildSteps(progress);
  const completed = steps.filter((s) => s.done).length;
  const allDone = completed >= steps.length;

  if (dismissed || allDone || !progress || progress.agents === 0) return null;

  const next = steps.find((s) => !s.done);

  return (
    <section
      className={cn("wl-paper wl-paper-elevated p-5 sm:p-6", className)}
      aria-label="Activation checklist"
    >
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <p className="wl-eyebrow wl-eyebrow--primary">First session</p>
          <h2 className="mt-1 text-sm font-semibold text-foreground">
            {completed} of {steps.length} activation steps complete
          </h2>
        </div>
        <button
          type="button"
          className="text-xs text-muted-foreground hover:text-foreground"
          onClick={() => {
            localStorage.setItem(DISMISS_KEY, "true");
            setDismissed(true);
          }}
        >
          Dismiss
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
                  "flex min-h-[44px] items-center gap-2 rounded-[var(--wireline-radius-md)] border px-3 py-2 text-xs font-medium wl-focus-ring-halo",
                  step.done
                    ? "border-[var(--wireline-color-feedback-success-border)] bg-[var(--wireline-color-feedback-success-surface)] text-foreground"
                    : step.id === next?.id
                      ? "border-primary/40 bg-primary/5 text-foreground"
                      : "border-border bg-card text-muted-foreground",
                )}
              >
                {step.done ? (
                  <Check className="size-3.5 shrink-0 text-[var(--wireline-color-action-primary-default)]" />
                ) : (
                  <Circle className="size-3.5 shrink-0 opacity-50" />
                )}
                <Icon className="size-3.5 shrink-0 opacity-70" aria-hidden="true" />
                <span>{step.label}</span>
              </Link>
            </li>
          );
        })}
      </ol>
      {next ? (
        <p className="mt-3 text-xs text-muted-foreground">
          Next:{" "}
          <Link to={next.href} className="font-semibold text-primary hover:underline">
            {next.label}
          </Link>
          {next.id === "test" ? <> · No training required for a quick browser preview</> : null}
        </p>
      ) : null}
    </section>
  );
}
