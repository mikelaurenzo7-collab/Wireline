import { useState } from "react";
import { ArrowRight, Cable, CircleAlert, CreditCard, LogOut, MonitorDown, ShieldCheck, UsersRound } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { Badge } from "../components/atoms/Badge";
import { Button } from "../components/atoms/Button";
import WorkspaceShell from "../components/WorkspaceShell";
import { useAuth } from "../contexts/AuthContext";

const settingsDestinations = [
  {
    href: "/settings/billing",
    icon: CreditCard,
    label: "Billing & usage",
    description: "Manage your plan, Conversation Balance, invoices, and payment details.",
    action: "Open billing",
  },
  {
    href: "/settings/team",
    icon: UsersRound,
    label: "Team",
    description: "Invite collaborators and give each person the access they need.",
    action: "Manage team",
  },
  {
    href: "/actions",
    icon: Cable,
    label: "Connections",
    description: "Review the accounts and tools your assistants are allowed to use.",
    action: "Review connections",
  },
  {
    href: "/settings/apps",
    icon: MonitorDown,
    label: "Wireline everywhere",
    description: "Access the browser companion, native apps, and ChatGPT connection from one clear place.",
    action: "View client apps",
  },
] as const;

export default function SettingsPage() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const [signingOut, setSigningOut] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const displayName = user?.full_name?.trim() || user?.email || "Your account";

  async function handleSignOut() {
    if (signingOut) return;
    setSigningOut(true);
    setError(null);
    try {
      await signOut();
      navigate("/signin", { replace: true });
    } catch {
      setError("We could not sign you out just yet. Please try again.");
      setSigningOut(false);
    }
  }

  return (
    <WorkspaceShell eyebrow="Workspace" title="Settings" contentClassName="py-6">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 pb-8">
        <section className="studio-card p-6 sm:p-7">
          <div className="flex flex-wrap items-start justify-between gap-5">
            <div className="min-w-0">
              <p className="studio-kicker">Account</p>
              <h2 className="wl-section-title mt-2 truncate">{displayName}</h2>
              {user?.email ? <p className="mt-1 text-sm text-muted-foreground">{user.email}</p> : null}
              <p className="wl-page-copy mt-4">Your account is the control point for the assistants, connected systems, and people in this workspace.</p>
            </div>
            <div className="flex flex-col items-start gap-3 sm:items-end">
              <Badge tone="success">Secure session</Badge>
              <Button type="button" variant="secondary" loading={signingOut} onClick={handleSignOut} className="shrink-0">
                <LogOut aria-hidden="true" size={16} />
                Sign out
              </Button>
            </div>
          </div>
          {error ? <p className="mt-5 flex items-center gap-2 text-sm text-destructive" role="alert"><CircleAlert size={16} /> {error}</p> : null}
        </section>

        <section>
          <div className="mb-4 max-w-2xl">
            <p className="studio-kicker">Workspace controls</p>
            <h2 className="wl-section-title mt-2">The controls that shape how Wireline works.</h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">Keep the operating details, people, money, connected systems, and companion surfaces clear and intentionally scoped.</p>
          </div>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {settingsDestinations.map(({ href, icon: Icon, label, description, action }) => (
              <Link key={href} to={href} className="studio-card wl-card-action group flex min-h-[210px] flex-col p-5">
                <span className="grid size-10 place-items-center rounded-[var(--radius-md)] bg-accent text-primary"><Icon size={19} /></span>
                <div className="mt-7 flex-1">
                  <h3 className="wl-card-title text-[17px]">{label}</h3>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">{description}</p>
                </div>
                <span className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-primary">{action} <ArrowRight size={15} /></span>
              </Link>
            ))}
          </div>
        </section>

        <section className="studio-card border-primary/20 bg-secondary p-5 sm:p-6">
          <div className="flex gap-3">
            <ShieldCheck className="mt-0.5 size-5 shrink-0 text-primary" />
            <div>
              <p className="studio-kicker">Control by design</p>
              <h2 className="wl-card-title mt-2 text-[17px]">Only connect what the job needs.</h2>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">Wireline keeps billing, provider credentials, webhooks, and account-level changes on the server. A connected system should be useful, approved, and appropriately limited for the work at hand.</p>
              <div className="mt-4 flex flex-wrap gap-x-4 gap-y-2 text-sm font-semibold text-primary">
                <Link to="/security" className="inline-flex items-center gap-1.5 hover:text-[color:var(--wl-accent-hover)]">Security overview <ArrowRight size={14} /></Link>
                <Link to="/support" className="inline-flex items-center gap-1.5 hover:text-[color:var(--wl-accent-hover)]">Get support <ArrowRight size={14} /></Link>
              </div>
            </div>
          </div>
        </section>
      </div>
    </WorkspaceShell>
  );
}
