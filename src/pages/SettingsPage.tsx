import { Link } from "react-router-dom";
import { ArrowRight, CreditCard, Mic, Phone, ShieldCheck } from "lucide-react";
import WorkspaceShell from "../components/WorkspaceShell";

const sections = [
  {
    icon: CreditCard,
    title: "Plan & billing",
    detail: "Review your plan, payment details, invoices, and upgrades in one place.",
    href: "/settings/billing",
  },
  {
    icon: Phone,
    title: "Numbers & calling",
    detail: "Manage the numbers your assistants use and the phone settings that keep calls moving.",
    href: "/admin",
  },
  {
    icon: Mic,
    title: "Voice & personality",
    detail: "Choose how each assistant sounds and shape their personality in Studio.",
    href: "/studio",
  },
  {
    icon: ShieldCheck,
    title: "Connections",
    detail: "Choose the accounts your assistants can use and what they are allowed to do.",
    href: "/actions",
  },
] as const;

export default function SettingsPage() {
  return (
    <WorkspaceShell eyebrow="Your Wireline" title="Settings" contentClassName="pt-5">
      <div className="flex h-full min-h-0 flex-col">
        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {sections.map((section) => {
            const Icon = section.icon;
            return (
              <Link
                key={section.title}
                to={section.href}
                className="group flex min-h-[216px] flex-col rounded-lg border border-border bg-card p-6 shadow-[0_1px_2px_rgba(0,0,0,0.05)] transition-all duration-200 hover:scale-[1.005] hover:border-[color:var(--wl-line-strong)] hover:shadow-[0_4px_12px_rgba(0,0,0,0.05)] active:scale-[0.98]"
              >
                <span className="grid h-12 w-12 place-items-center rounded border border-border bg-muted text-foreground"><Icon size={20} /></span>
                <div className="mt-auto">
                  <h2 className="text-[20px] font-semibold tracking-[-.01em] text-foreground">{section.title}</h2>
                  <p className="mt-2 text-[14px] leading-5 text-muted-foreground">{section.detail}</p>
                  <span className="mt-6 inline-flex items-center gap-2 font-mono text-[11px] font-medium uppercase tracking-[.05em] text-foreground">Open <ArrowRight size={14} /></span>
                </div>
              </Link>
            );
          })}
        </section>
        <p className="mt-5 text-[13px] text-muted-foreground">Detailed account controls are available in <Link to="/admin" className="font-medium text-foreground underline underline-offset-4 hover:text-primary">advanced settings</Link>.</p>
      </div>
    </WorkspaceShell>
  );
}
