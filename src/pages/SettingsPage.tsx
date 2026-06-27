import { useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Cable,
  CreditCard,
  LogOut,
  MonitorDown,
  ShieldAlert,
  ShieldCheck,
  SlidersHorizontal,
  Trash2,
  UsersRound,
} from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { Badge, Button } from "../components/atoms";
import { StatusNotice } from "../components/molecules";
import WorkspaceShell from "../components/WorkspaceShell";
import { useAuth } from "../contexts/AuthContext";
import { authFetch } from "../lib/api";

const settingsDestinations = [
  {
    href: "/settings/billing",
    icon: CreditCard,
    label: "Billing",
    detail: "Plan and balance",
    action: "Open",
  },
  {
    href: "/settings/team",
    icon: UsersRound,
    label: "Team",
    detail: "People and access",
    action: "Manage",
  },
  {
    href: "/settings/customization",
    icon: SlidersHorizontal,
    label: "Customize",
    detail: "Brand and voice",
    action: "Tune",
  },
  {
    href: "/actions",
    icon: Cable,
    label: "Integrations",
    detail: "Approved systems",
    action: "Review",
  },
  {
    href: "/settings/apps",
    icon: MonitorDown,
    label: "Apps",
    detail: "Mobile and browser",
    action: "View",
  },
] as const;

function DangerZone() {
  const [confirmation, setConfirmation] = useState("");
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function requestDeletion() {
    if (confirmation !== "DELETE" || working) return;
    setWorking(true);
    setMessage(null);
    setError(null);
    try {
      const response = await authFetch("/api/account/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmation }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body?.error || "Deletion request failed.");
      const date = body?.scheduled_purge_at
        ? new Date(body.scheduled_purge_at).toLocaleDateString()
        : "after the grace window";
      setMessage(`Deletion queued for ${date}.`);
      setConfirmation("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Deletion request failed.");
    } finally {
      setWorking(false);
    }
  }

  return (
    <section className="studio-card border-destructive/20 p-4 sm:p-5">
      <div className="flex gap-3">
        <ShieldAlert aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-destructive" />
        <div className="min-w-0 flex-1">
          <p className="studio-kicker">Danger</p>
          <h2 className="mt-2 text-base font-semibold tracking-[-.02em] text-foreground">
            Delete account.
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">Queues account deletion.</p>
          <div className="mt-4 grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
            <label className="grid gap-1.5 text-sm font-semibold text-foreground">
              Type DELETE
              <input
                value={confirmation}
                onChange={(event) => setConfirmation(event.target.value)}
                className="h-11 rounded-xl border border-border bg-background px-3 text-sm font-semibold text-foreground outline-none focus:border-primary/40"
                autoComplete="off"
                inputMode="text"
              />
            </label>
            <Button
              type="button"
              variant="secondary"
              disabled={confirmation !== "DELETE" || working}
              onClick={requestDeletion}
            >
              <Trash2 aria-hidden="true" size={16} />
              {working ? "Requesting..." : "Request deletion"}
            </Button>
          </div>
          {message ? (
            <StatusNotice tone="info" className="mt-4" title="Deletion queued">
              {message}
            </StatusNotice>
          ) : null}
          {error ? (
            <StatusNotice tone="destructive" className="mt-4" title="Deletion unavailable">
              {error}
            </StatusNotice>
          ) : null}
        </div>
      </div>
    </section>
  );
}

export default function SettingsPage() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const [signingOut, setSigningOut] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const accountLabel = user?.email || user?.full_name?.trim() || "Signed in";

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
    <WorkspaceShell eyebrow="Workspace" title="Settings" contentClassName="py-3 sm:py-6">
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-4 pb-8">
        <header className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="studio-kicker">Workspace</p>
            <h1 className="mt-1 text-2xl font-semibold tracking-[-.045em] text-foreground sm:text-3xl">
              Settings
            </h1>
          </div>
          <Button asChild variant="secondary" size="sm" className="shrink-0">
            <Link to="/studio">
              <ArrowLeft aria-hidden="true" size={15} />
              Studio
            </Link>
          </Button>
        </header>

        <section className="studio-card p-4 sm:p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="studio-kicker">Account</p>
              <p
                data-wireline-preserve-case
                className="mt-2 truncate text-base font-semibold tracking-[-.02em] text-foreground"
              >
                {accountLabel}
              </p>
            </div>
            <Badge variant="success">
              <ShieldCheck aria-hidden="true" className="size-3.5" />
              Secure
            </Badge>
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={signingOut}
              onClick={handleSignOut}
            >
              <LogOut aria-hidden="true" size={16} />
              {signingOut ? "Signing out..." : "Sign out"}
            </Button>
          </div>
          {error ? (
            <StatusNotice tone="destructive" className="mt-4" title="Sign-out unavailable">
              {error}
            </StatusNotice>
          ) : null}
        </section>

        <section>
          <div className="mb-3">
            <p className="studio-kicker">Controls</p>
            <h2 className="text-xl font-semibold tracking-[-.035em] text-foreground">
              Choose a control.
            </h2>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            {settingsDestinations.map(({ href, icon: Icon, label, detail, action }) => (
              <Link
                key={href}
                to={href}
                className="studio-card flex items-center gap-3 p-3 transition-colors hover:border-primary/30 hover:bg-accent sm:p-4"
              >
                <span className="grid size-9 shrink-0 place-items-center rounded-[var(--radius-md)] bg-muted text-primary sm:size-10">
                  <Icon aria-hidden="true" size={18} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold tracking-[-.02em] text-foreground sm:text-base">
                    {label}
                  </span>
                  <span className="mt-0.5 block truncate text-xs text-muted-foreground sm:text-sm">
                    {detail}
                  </span>
                </span>
                <span className="inline-flex shrink-0 items-center gap-1 text-xs font-semibold text-primary sm:text-sm">
                  {action} <ArrowRight aria-hidden="true" size={14} />
                </span>
              </Link>
            ))}
          </div>
        </section>

        <DangerZone />
      </div>
    </WorkspaceShell>
  );
}
