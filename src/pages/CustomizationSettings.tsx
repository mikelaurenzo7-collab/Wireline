import { Link } from "react-router-dom";
import { ArrowRight, Mic2, Palette, SlidersHorizontal, Target } from "lucide-react";

import AppearanceSettings from "../components/settings/AppearanceSettings";
import SettingsTabs from "../components/settings/SettingsTabs";
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
    href: "/knowledge",
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

const surfaceLinks = [
  { label: "Apps", href: "/settings/apps" },
  { label: "Studio", href: "/studio" },
] as const;

export default function CustomizationSettings() {
  return (
    <WorkspaceShell contentClassName="pt-1 pb-8">
      <WorkspacePageFrame mode="standard">
        <SettingsTabs />
        <AppearanceSettings />

        <section className="mt-6">
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

        <section className="mt-6 flex flex-wrap gap-2">
          {surfaceLinks.map(({ label, href }) => (
            <Link
              key={label}
              to={href}
              className="inline-flex min-h-[42px] items-center gap-2 rounded-full border border-border bg-card px-4 text-sm font-semibold text-foreground transition-colors hover:border-primary/30 hover:bg-muted"
            >
              {label}
              <ArrowRight aria-hidden="true" size={14} className="text-primary" />
            </Link>
          ))}
        </section>
      </WorkspacePageFrame>
    </WorkspaceShell>
  );
}
