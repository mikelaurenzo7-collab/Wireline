import { useState } from "react";
import { ArrowRight, Cable, CreditCard, LogOut, MonitorDown, ShieldCheck, UsersRound } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { Badge, Button } from "../components/atoms";
import { StatusNotice } from "../components/molecules";
import WorkspaceShell from "../components/WorkspaceShell";
import { useAuth } from "../contexts/AuthContext";

const settingsDestinations = [
  { href: "/settings/billing", icon: CreditCard, label: "Billing", detail: "Plan, balance, and invoices", action: "Open billing" },
  { href: "/settings/team", icon: UsersRound, label: "Team", detail: "People and access", action: "Manage team" },
  { href: "/actions", icon: Cable, label: "Connections", detail: "Approved systems", action: "Review connections" },
  { href: "/settings/apps", icon: MonitorDown, label: "Apps", detail: "Every Wireline surface", action: "View apps" },
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
      setError("Sign-out did not complete. Try again.");
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
              {user?.email ? <p data-wireline-preserve-case className="mt-1 text-sm text-muted-foreground">{user.email}</p> : null}
            </div>
            <div className="flex flex-col items-start gap-3 sm:items-end">
              <Badge variant="success"><ShieldCheck aria-hidden="true" className="size-3.5" />Secure session</Badge>
              <Button type="button" variant="secondary" size="sm" disabled={signingOut} onClick={handleSignOut}>
                <LogOut aria-hidden="true" size={16} />{signingOut ? "Signing out…" : "Sign out"}
              </Button>
            </div>
          </div>
          {error ? <StatusNotice tone="destructive" className="mt-5" title="Sign-out unavailable">{error}</StatusNotice> : null}
        </section>

        <section>
          <div className="mb-4 max-w-2xl">
            <p className="studio-kicker">Workspace controls</p>
            <h2 className="wl-section-title mt-2">Set the operating rules.</h2>
          </div>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {settingsDestinations.map(({ href, icon: Icon, label, detail, action }) => (
              <Link key={href} to={href} className="studio-card wl-card-action flex min-h-[164px] flex-col p-5">
                <span className="grid size-10 place-items-center rounded-[var(--radius-md)] bg-accent text-primary"><Icon aria-hidden="true" size={19} /></span>
                <div className="mt-5 flex-1">
                  <h3 className="wl-card-title text-[var(--wireline-typography-body-size)]">{label}</h3>
                  <p className="mt-1 text-sm text-muted-foreground">{detail}</p>
                </div>
                <span className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-primary">{action} <ArrowRight aria-hidden="true" size={15} /></span>
              </Link>
            ))}
          </div>
        </section>

        <section className="studio-card border-primary/20 bg-secondary p-5 sm:p-6">
          <div className="flex gap-3">
            <ShieldCheck aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-primary" />
            <div>
              <p className="studio-kicker">Control by design</p>
              <h2 className="wl-card-title mt-2 text-[var(--wireline-typography-body-size)]">Connect only what the job needs.</h2>
              <div className="mt-4 flex flex-wrap gap-x-4 gap-y-2">
                <Button asChild variant="link" className="h-auto px-0 text-sm"><Link to="/actions">Review connections <ArrowRight aria-hidden="true" size={14} /></Link></Button>
                <Button asChild variant="link" className="h-auto px-0 text-sm"><Link to="/settings/team">Manage access <ArrowRight aria-hidden="true" size={14} /></Link></Button>
              </div>
            </div>
          </div>
        </section>
      </div>
    </WorkspaceShell>
  );
}
