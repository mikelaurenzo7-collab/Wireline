import { useState } from "react";
import { LogOut, ShieldAlert, Trash2 } from "lucide-react";
import { useNavigate } from "react-router-dom";

import { Button } from "../components/atoms";
import { StatusNotice } from "../components/molecules";
import SettingsTabs from "../components/settings/SettingsTabs";
import WorkspaceShell from "../components/WorkspaceShell";
import { useAuth } from "../contexts/AuthContext";
import { authFetch } from "../lib/api";

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
      setMessage(`Delete queued. Purge scheduled for ${date}.`);
      setConfirmation("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Deletion request failed.");
    } finally {
      setWorking(false);
    }
  }

  return (
    <section className="studio-card border-destructive/20 p-5 sm:p-6">
      <div className="flex gap-3">
        <ShieldAlert aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-destructive" />
        <div className="min-w-0 flex-1">
          <p className="wl-overline text-destructive/80">Danger zone</p>
          <h2 className="mt-2 font-[var(--wireline-font-family-display)] text-2xl font-normal tracking-[-.025em] text-foreground">
            Account deletion
          </h2>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">
            Queue deletion only when the workspace should stop answering for good.
          </p>
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
  const displayName = user?.full_name?.trim() || user?.email?.split("@")[0] || "Mike";

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
    <WorkspaceShell eyebrow="Settings" title="Account" contentClassName="pt-1 pb-8">
      <div className="mx-auto flex w-full max-w-[1080px] flex-col gap-5 pb-10">
        <SettingsTabs />

        <section className="studio-card grid gap-5 p-5 sm:p-6 xl:grid-cols-[minmax(260px,0.45fr)_minmax(0,1fr)] xl:items-center">
          <div>
            <p className="wl-overline">Signed in as</p>
            <h2 className="mt-3 font-[var(--wireline-font-family-display)] text-3xl font-normal tracking-[-.03em] text-foreground">
              {displayName}
            </h2>
            <p data-wireline-preserve-case className="mt-2 truncate text-sm text-muted-foreground">
              {accountLabel}
            </p>
          </div>
          <div className="grid gap-3 rounded-2xl bg-muted/40 p-4 sm:grid-cols-3">
            {[
              ["Plan", "Pro"],
              ["Workspace", "Wireline"],
              ["Status", "Active"],
            ].map(([label, value]) => (
              <div key={label} className="rounded-xl border border-border bg-background px-4 py-3">
                <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                  {label}
                </p>
                <p className="mt-2 text-sm font-semibold text-foreground">{value}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="studio-card p-5 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="wl-overline">Session</p>
              <h2 className="mt-2 font-[var(--wireline-font-family-display)] text-2xl font-normal tracking-[-.025em] text-foreground">
                Device access
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">Sign out of this browser.</p>
            </div>
            <Button type="button" variant="secondary" disabled={signingOut} onClick={handleSignOut}>
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

        <DangerZone />
      </div>
    </WorkspaceShell>
  );
}
