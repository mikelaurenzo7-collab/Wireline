import { Link } from "react-router-dom";
import {
  ArrowLeft,
  ArrowRight,
  Bot,
  Brain,
  MessageSquareText,
  Mic2,
  MonitorDown,
  Palette,
  ShieldCheck,
  SlidersHorizontal,
  Smartphone,
  Target,
} from "lucide-react";

import { Button } from "../components/atoms";
import { StatusNotice } from "../components/molecules";
import WorkspaceShell from "../components/WorkspaceShell";

const customizationLayers = [
  {
    label: "Brand",
    title: "Brand profile",
    detail: "Name. Color. Assets.",
    action: "Review apps",
    href: "/settings/apps",
    icon: Palette,
  },
  {
    label: "Voice",
    title: "Voice identity",
    detail: "Choice. Pace. Personality.",
    action: "Open Training",
    href: "/training",
    icon: Mic2,
  },
  {
    label: "Authority",
    title: "Operating authority",
    detail: "Rules. Handoff. Escalation.",
    action: "Review controls",
    href: "/settings",
    icon: SlidersHorizontal,
  },
  {
    label: "Goals",
    title: "Success targets",
    detail: "KPIs. Follow-up. Offer.",
    action: "Set guidance",
    href: "/training?section=guidance",
    icon: Target,
  },
] as const;

const appCarryover = [
  {
    label: "Studio",
    detail: "Same profile. Everywhere.",
    icon: Bot,
  },
  {
    label: "Browser",
    detail: "Context inherits.",
    icon: MonitorDown,
  },
  {
    label: "Mobile",
    detail: "Rules travel.",
    icon: Smartphone,
  },
  {
    label: "ChatGPT",
    detail: "Aligned drafts.",
    icon: MessageSquareText,
  },
] as const;

export default function CustomizationSettings() {
  return (
    <WorkspaceShell
      eyebrow="Workspace"
      title="Customization"
      contentClassName="pt-1 pb-8"
      action={
        <Button asChild variant="secondary" size="sm" className="shrink-0">
          <Link to="/settings" aria-label="Back to Settings">
            <ArrowLeft size={16} />
            <span className="hidden sm:inline">Settings</span>
          </Link>
        </Button>
      }
    >
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 pb-8">
        <section className="studio-card grid gap-5 border-primary/20 bg-secondary p-6 sm:p-7 xl:grid-cols-[minmax(0,.8fr)_minmax(320px,.55fr)] xl:items-end">
          <div className="text-center">
            <p className="studio-kicker">Profile</p>
            <h2 className="wl-section-title mt-1">One voice, everywhere.</h2>
          </div>
          <div className="rounded-[var(--radius-lg)] border border-border bg-card p-4">
            <div className="flex items-start gap-3">
              <span className="grid size-9 shrink-0 place-items-center rounded-[var(--radius-md)] bg-muted text-primary">
                <Brain aria-hidden="true" size={17} />
              </span>
              <div>
                <p className="font-mono text-[var(--wireline-typography-overline-size)] font-semibold uppercase tracking-[.06em] text-muted-foreground">
                  Rule
                </p>
                <p className="mt-1 text-sm text-foreground">Power where needed. Clarity everywhere.</p>
              </div>
            </div>
          </div>
        </section>

        <section>
          <div className="mb-3 text-center">
            <p className="studio-kicker">Layers</p>
            <h2 className="wl-section-title mt-1">System taste, not screens.</h2>
          </div>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {customizationLayers.map(({ label, title, detail, action, href, icon: Icon }) => (
              <Link
                key={label}
                to={href}
                className="studio-card wl-card-action flex min-h-[218px] flex-col p-5"
              >
                <div className="flex items-start justify-between gap-3">
                  <span className="font-mono text-[var(--wireline-typography-overline-size)] font-semibold uppercase tracking-[.06em] text-muted-foreground">
                    {label}
                  </span>
                  <span className="grid size-10 place-items-center rounded-[var(--radius-md)] bg-accent text-primary">
                    <Icon aria-hidden="true" size={18} />
                  </span>
                </div>
                <div className="mt-6 flex-1">
                  <h3 className="wl-card-title text-[var(--wireline-typography-body-size)]">
                    {title}
                  </h3>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">{detail}</p>
                </div>
                <span className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-primary">
                  {action} <ArrowRight aria-hidden="true" size={15} />
                </span>
              </Link>
            ))}
          </div>
        </section>

        <section className="studio-card p-5 sm:p-6">
          <div className="flex flex-col items-center gap-2 border-b border-border pb-3 text-center sm:flex-row sm:items-center sm:justify-between">
            <div className="text-center w-full sm:w-auto sm:text-left">
              <p className="studio-kicker">Carryover</p>
              <h2 className="wl-section-title mt-1">Taste travels.</h2>
            </div>
            <Button asChild variant="link" className="h-auto w-fit px-0 text-sm">
              <Link to="/settings/apps">
                Surfaces <ArrowRight aria-hidden="true" size={14} />
              </Link>
            </Button>
          </div>
          <div className="grid gap-3 pt-5 md:grid-cols-2 xl:grid-cols-4">
            {appCarryover.map(({ label, detail, icon: Icon }) => (
              <div key={label} className="rounded-[var(--radius-lg)] border border-border bg-background p-4">
                <span className="grid size-9 place-items-center rounded-[var(--radius-md)] bg-muted text-primary">
                  <Icon aria-hidden="true" size={17} />
                </span>
                <h3 className="mt-4 text-sm font-semibold text-foreground">{label}</h3>
                <p className="mt-2 text-xs leading-5 text-muted-foreground">{detail}</p>
              </div>
            ))}
          </div>
        </section>

        <StatusNotice
          tone="info"
          title="One profile."
          icon={<ShieldCheck aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-primary" />}
        >
          Override only where needed.
        </StatusNotice>
      </div>
    </WorkspaceShell>
  );
}
