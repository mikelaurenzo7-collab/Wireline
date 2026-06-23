import { Link } from "react-router-dom";
import {
  ArrowRight,
  CreditCard,
  Mic,
  Phone,
  ShieldCheck,
  SlidersHorizontal,
  Users,
} from "lucide-react";
import WorkspaceShell from "../components/WorkspaceShell";

const sections = [
  {
    icon: CreditCard,
    title: "Plan & billing",
    detail: "Review your plan, payment method, invoices, and available capacity.",
    href: "/settings/billing",
  },
  {
    icon: Users,
    title: "Team access",
    detail: "Invite teammates, manage roles, and keep ownership of your workspace clear.",
    href: "/settings/team",
  },
  {
    icon: Phone,
    title: "Numbers & calling",
    detail: "Manage the numbers assistants use and the call settings behind every handoff.",
    href: "/admin",
  },
  {
    icon: Mic,
    title: "Voice & personality",
    detail: "Set how each assistant sounds and refine its behavior in Studio.",
    href: "/studio",
  },
  {
    icon: ShieldCheck,
    title: "Connected accounts",
    detail: "Review the accounts assistants can use and the permissions you have approved.",
    href: "/actions",
  },
  {
    icon: SlidersHorizontal,
    title: "Advanced controls",
    detail: "Open phone, workspace, and account-level controls when you need deeper setup.",
    href: "/admin",
  },
] as const;

export default function SettingsPage() {
  return (
    <WorkspaceShell eyebrow="Your Wireline" title="Settings" contentClassName="pt-6 pb-8">
      <div className="flex h-full min-h-0 flex-col">
        <section className="grid max-w-[1280px] gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {sections.map((section) => {
            const Icon = section.icon;
            return (
              <Link
                key={section.title}
                to={section.href}
                className="group flex min-h-[224px] flex-col rounded-xl border border-border bg-card p-6 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md active:scale-[0.98]"
              >
                <span className="grid h-11 w-11 place-items-center rounded-lg border border-border bg-muted text-primary">
                  <Icon size={19} />
                </span>
                <div className="mt-auto">
                  <h2 className="text-[20px] font-semibold tracking-[-.02em] text-foreground">
                    {section.title}
                  </h2>
                  <p className="mt-2 max-w-[34ch] text-[14px] leading-5 text-muted-foreground">
                    {section.detail}
                  </p>
                  <span className="mt-5 inline-flex items-center gap-2 text-[13px] font-semibold text-primary">
                    Open {section.title.toLowerCase()} <ArrowRight size={15} />
                  </span>
                </div>
              </Link>
            );
          })}
        </section>
      </div>
    </WorkspaceShell>
  );
}
