import { Link } from "react-router-dom";
import {
  ArrowRight,
  Building2,
  Mic2,
  Phone,
  PlugZap,
  ShieldCheck,
  Target,
} from "lucide-react";

import AppearanceSettings from "../components/settings/AppearanceSettings";
import SettingsTabs from "../components/settings/SettingsTabs";
import WorkspaceBrandingSettings from "../components/settings/WorkspaceBrandingSettings";
import { WorkspacePageFrame, WorkspacePageIntro } from "../components/layout/WorkspacePageFrame";
import WorkspaceShell from "../components/WorkspaceShell";

const customizationLinks = [
  {
    label: "Caller identity",
    detail: "Legal name, CNAM, support channels for live calls.",
    href: "/settings/phone#company-identity",
    icon: Building2,
  },
  {
    label: "Voice & knowledge",
    detail: "Facts, documents, and tone that train the employee.",
    href: "/knowledge",
    icon: Mic2,
  },
  {
    label: "Phone line",
    detail: "Provision a number and attach the live employee.",
    href: "/settings/phone",
    icon: Phone,
  },
  {
    label: "Connections",
    detail: "Mailbox, CRM, and tools customers already use.",
    href: "/connections",
    icon: PlugZap,
  },
  {
    label: "Operating rules",
    detail: "Handoff, escalation, and compliance controls.",
    href: "/settings/compliance",
    icon: ShieldCheck,
  },
  {
    label: "Success targets",
    detail: "Goals and follow-up KPIs for live work.",
    href: "/insights?tab=performance&view=goals",
    icon: Target,
  },
] as const;

export default function CustomizationSettings() {
  return (
    <WorkspaceShell contentClassName="pt-1 pb-8">
      <WorkspacePageFrame mode="standard">
        <SettingsTabs />
        <WorkspacePageIntro title="Appearance & brand" />

        <AppearanceSettings />
        <WorkspaceBrandingSettings />

        <section className="mt-8" aria-label="Customization destinations">
          <p className="wl-eyebrow wl-eyebrow--muted">Customize next</p>
          <ul className="mt-3 divide-y divide-border border-y border-border">
            {customizationLinks.map(({ label, detail, href, icon: Icon }) => (
              <li key={href}>
                <Link
                  to={href}
                  className="flex min-h-[64px] items-center gap-4 py-3.5 transition-colors hover:bg-muted/40"
                >
                  <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-muted text-primary">
                    <Icon aria-hidden="true" size={16} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold text-foreground">{label}</span>
                    <span className="mt-0.5 block text-sm leading-5 text-muted-foreground">
                      {detail}
                    </span>
                  </span>
                  <ArrowRight
                    aria-hidden="true"
                    size={16}
                    className="shrink-0 text-muted-foreground"
                  />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      </WorkspacePageFrame>
    </WorkspaceShell>
  );
}
