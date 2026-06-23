import { useState } from "react";
import { ArrowRight, Cable, CreditCard, LogOut, ShieldCheck, UsersRound } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import WorkspaceShell from "../components/WorkspaceShell";
import { useAuth } from "../contexts/AuthContext";

const settingsDestinations = [
  {
    href: "/settings/billing",
    icon: CreditCard,
    label: "Billing & usage",
    description: "Manage your plan, conversation balance, invoices, and payment details.",
  },
  {
    href: "/settings/team",
    icon: UsersRound,
    label: "Team",
    description: "Invite collaborators and set the right level of workspace access.",
  },
  {
    href: "/connections",
    icon: Cable,
    label: "Connections",
    description: "Review the accounts and tools your assistants can use.",
  },
] as const;

export default function SettingsPage() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const [signingOut, setSigningOut] = useState(false);
  const displayName = user?.full_name?.trim() || user?.email || "Your account";

  async function handleSignOut() {
    if (signingOut) return;
    setSigningOut(true);
    await signOut();
    navigate("/signin", { replace: true });
  }

  return (
    <WorkspaceShell eyebrow="Workspace controls" title="Settings" contentClassName="py-6">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 pb-8">
        <section className="studio-card">
          <p className="studio-kicker">Account</p>
          <div className="mt-4 flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <h2 className="truncate font-[var(--wl-font-display)] text-xl font-semibold tracking-[-.03em] text-foreground">
                {displayName}
              </h2>
              {user?.email ? <p className="mt-1 text-sm text-muted-foreground">{user.email}</p> : null}
              <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
                Your Wireline session is protected with secure, server-managed authentication.
              </p>
            </div>
            <button
              type="button"
              onClick={handleSignOut}
              disabled={signingOut}
              className="workspace-btn-secondary shrink-0 px-4 py-2.5 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <LogOut size={16} />
              {signingOut ? "Signing out…" : "Sign out"}
            </button>
          </div>
        </section>

        <section>
          <div className="mb-3">
            <p className="studio-kicker">Workspace</p>
            <h2 className="mt-1 font-[var(--wl-font-display)] text-xl font-semibold tracking-[-.03em] text-foreground">
              Keep your operating system in order
            </h2>
          </div>
          <div className="grid gap-3 md:grid-cols-3">
            {settingsDestinations.map(({ href, icon: Icon, label, description }) => (
              <Link
                key={href}
                to={href}
                className="studio-card group flex min-h-48 flex-col justify-between transition hover:border-primary/45 hover:bg-secondary active:scale-[0.99]"
              >
                <span className="grid size-10 place-items-center rounded-[var(--radius)] bg-accent text-primary">
                  <Icon size={19} />
                </span>
                <div className="mt-8">
                  <h3 className="font-[var(--wl-font-display)] text-base font-semibold text-foreground">
                    {label}
                  </h3>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">{description}</p>
                  <span className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-primary">
                    Open {label.toLowerCase()} <ArrowRight size={15} />
                  </span>
                </div>
              </Link>
            ))}
          </div>
        </section>

        <section className="rounded-[var(--radius-lg)] border border-border bg-card p-5">
          <div className="flex gap-3">
            <ShieldCheck className="mt-0.5 size-5 shrink-0 text-primary" />
            <div>
              <h2 className="font-[var(--wl-font-display)] text-base font-semibold text-foreground">
                Built for controlled access
              </h2>
              <p className="mt-1 text-sm leading-6 text-muted-foreground">
                Wireline keeps billing, provider credentials, webhooks, and account-level changes on the server. Only connect the systems an assistant needs to complete an approved task.
              </p>
              <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-sm font-semibold text-primary">
                <Link to="/security" className="inline-flex items-center gap-1.5 hover:text-[color:var(--wl-accent-hover)]">
                  Security overview <ArrowRight size={14} />
                </Link>
                <Link to="/support" className="inline-flex items-center gap-1.5 hover:text-[color:var(--wl-accent-hover)]">
                  Get support <ArrowRight size={14} />
                </Link>
              </div>
            </div>
          </div>
        </section>
      </div>
    </WorkspaceShell>
  );
}
