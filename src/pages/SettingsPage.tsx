import { Link } from "react-router-dom";
import { ArrowRight, Bot, CreditCard, Mic, ShieldCheck } from "lucide-react";
import WorkspaceShell from "../components/WorkspaceShell";

const sections = [
  {
    icon: CreditCard,
    title: "Billing & plan",
    detail: "Review your plan, manage payment and invoices, and upgrade or cancel anytime.",
    href: "/settings/billing",
  },
  {
    icon: Mic,
    title: "Voice",
    detail: "Pick the voice each assistant speaks with and tune how it sounds — set up in Studio.",
    href: "/studio",
  },
  {
    icon: ShieldCheck,
    title: "Permissions",
    detail: "Control integrations, authorized actions, and access for each assistant.",
    href: "/actions",
  },
] as const;

export default function SettingsPage() {
  return (
    <WorkspaceShell eyebrow="Administration" title="Settings" contentClassName="pt-6">
      <div className="flex h-full min-h-0 flex-col">
        <section className="grid gap-6 md:grid-cols-3">
          {sections.map((section) => {
            const Icon = section.icon;
            return (
              <Link
                key={section.title}
                to={section.href}
                className="group flex min-h-[260px] flex-col rounded-lg border border-border bg-card p-6 shadow-[0_1px_2px_rgba(0,0,0,0.05)] transition-all duration-200 hover:scale-[1.005] hover:border-[color:var(--wl-line-strong)] hover:shadow-[0_4px_12px_rgba(0,0,0,0.05)]"
              >
                <span className="grid h-12 w-12 place-items-center rounded border border-border bg-muted text-foreground">
                  <Icon size={20} />
                </span>
                <div className="mt-auto">
                  <h2 className="text-[20px] font-semibold tracking-[-.01em] text-foreground">
                    {section.title}
                  </h2>
                  <p className="mt-2 text-[14px] leading-5 text-muted-foreground">
                    {section.detail}
                  </p>
                  <span className="mt-7 inline-flex items-center gap-2 font-mono text-[11px] font-medium uppercase tracking-[.05em] text-foreground">
                    Configure <ArrowRight size={14} />
                  </span>
                </div>
              </Link>
            );
          })}
        </section>
        <p className="mt-6 text-[13px] text-muted-foreground">
          Need account, team, or compliance controls?{" "}
          <Link
            to="/admin"
            className="font-medium text-foreground underline underline-offset-4 hover:text-primary"
          >
            Open advanced workspace settings
          </Link>
        </p>
        <section className="mt-auto grid gap-4 rounded-lg border border-black bg-[#20211f] p-6 text-white shadow-[0_1px_2px_rgba(0,0,0,0.12)] sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:items-center">
          <span className="grid h-10 w-10 place-items-center rounded-sm bg-[color:var(--wl-accent)]">
            <Bot size={18} />
          </span>
          <div>
            <p className="font-mono text-[11px] font-medium uppercase tracking-[.05em] text-white/60">
              Infrastructure
            </p>
            <p className="mt-1 text-[15px] text-white">
              Powered by Brain, Voice, Calls — managed AI and voice stack
            </p>
          </div>
          <Link to="/ops" className="workspace-btn-primary justify-center px-4 py-2.5 text-sm">
            View status
          </Link>
        </section>
      </div>
    </WorkspaceShell>
  );
}
