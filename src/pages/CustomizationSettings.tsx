import { Link } from "react-router-dom";
import {
  ArrowRight,
  Bot,
  MessageSquareText,
  Mic2,
  MonitorDown,
  Palette,
  SlidersHorizontal,
  Smartphone,
  Target,
} from "lucide-react";

import { Button } from "../components/atoms";
import { WorkspacePageFrame } from "../components/layout/WorkspacePageFrame";
import WorkspaceShell from "../components/WorkspaceShell";

const customizationLayers = [
  {
    label: "Brand",
    title: "Brand profile",
    detail: "Name. Color. Assets.",
    action: "Review",
    href: "/settings/apps",
    icon: Palette,
  },
  {
    label: "Voice",
    title: "Voice identity",
    detail: "Choice. Pace. Personality.",
    action: "Train",
    href: "/training",
    icon: Mic2,
  },
  {
    label: "Authority",
    title: "Operating authority",
    detail: "Rules. Handoff. Escalation.",
    action: "Open",
    href: "/settings",
    icon: SlidersHorizontal,
  },
  {
    label: "Goals",
    title: "Success targets",
    detail: "KPIs. Follow-up. Offer.",
    action: "Set",
    href: "/training?section=guidance",
    icon: Target,
  },
] as const;

const appCarryover = [
  {
    label: "Studio",
    detail: "Same profile.",
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
    <WorkspaceShell contentClassName="pt-1 pb-8">
      <WorkspacePageFrame>
        <section>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {customizationLayers.map(({ label, title, detail, action, href, icon: Icon }) => (
              <Link
                key={label}
                to={href}
                className="studio-card wl-card-action flex min-h-[172px] flex-col p-5"
              >
                <div className="flex items-start justify-between gap-3">
                  <span className="font-mono text-[var(--wireline-typography-overline-size)] font-semibold uppercase tracking-[.06em] text-muted-foreground">
                    {label}
                  </span>
                  <span className="grid size-10 place-items-center rounded-[var(--radius-md)] bg-accent text-primary">
                    <Icon aria-hidden="true" size={18} />
                  </span>
                </div>
                <div className="mt-5 flex-1">
                  <h3 className="wl-card-title text-[var(--wireline-typography-body-size)]">
                    {title}
                  </h3>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">{detail}</p>
                </div>
                <span className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-primary">
                  {action} <ArrowRight aria-hidden="true" size={15} />
                </span>
              </Link>
            ))}
          </div>
        </section>

        <section className="studio-card p-5 sm:p-6">
          <div className="flex flex-col items-center gap-2 border-b border-border pb-3 text-center sm:flex-row sm:items-center sm:justify-between">
            <div className="w-full text-center sm:w-auto sm:text-left">
              <h2 className="text-sm font-semibold tracking-[-0.01em] text-foreground">Surfaces</h2>
            </div>
            <Button asChild variant="link" className="h-auto w-fit px-0 text-sm">
              <Link to="/settings/apps">
                Surfaces <ArrowRight aria-hidden="true" size={14} />
              </Link>
            </Button>
          </div>
          <div className="grid gap-3 pt-5 md:grid-cols-2 xl:grid-cols-4">
            {appCarryover.map(({ label, detail, icon: Icon }) => (
              <div
                key={label}
                className="rounded-[var(--radius-lg)] border border-border bg-background p-4"
              >
                <span className="grid size-9 place-items-center rounded-[var(--radius-md)] bg-muted text-primary">
                  <Icon aria-hidden="true" size={17} />
                </span>
                <h3 className="mt-4 text-sm font-semibold text-foreground">{label}</h3>
                <p className="mt-2 text-xs leading-5 text-muted-foreground">{detail}</p>
              </div>
            ))}
          </div>
        </section>
      </WorkspacePageFrame>
    </WorkspaceShell>
  );
}
