import { useState } from "react";
import { LogOut, ShieldCheck, Trash2 } from "lucide-react";
import { useNavigate } from "react-router-dom";

import { Button } from "../components/atoms";
import { StatusNotice } from "../components/molecules";
import { WorkspacePageFrame } from "../components/layout/WorkspacePageFrame";
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
      const response = await authFetch("/api/account/delete", { method: "POST" });
      if (!response.ok) throw new Error(String(response.status));
      setMessage("Deletion in progress. You'll receive an email when it completes.");
    } catch {
      setError("Couldn't queue the deletion. Try again in a moment.");
    } finally {
      setWorking(false);
    }
  }

  return (
    <section className="studio-card border-[var(--wireline-color-feedback-error-border)] p-5 sm:p-6">
      <p
        className="wl-eyebrow wl-eyebrow--wired wl-eyebrow--wired--app"
        style={{ color: "var(--wireline-color-status-error)" }}
      >
        Danger zone
      </p>
      <h3 className="mt-2 text-sm font-semibold text-foreground">Delete account</h3>
      <p className="mt-1.5 text-xs text-muted-foreground">
        This permanently removes your agents, call logs, and billing history. Type DELETE to
        confirm.
      </p>
      <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center">
        <input
          aria-label="Type DELETE to confirm"
          value={confirmation}
          onChange={(event) => setConfirmation(event.target.value.toUpperCase())}
          placeholder="DELETE"
          className="h-11 rounded-xl border border-border bg-background px-4 text-sm font-medium tracking-[0.18em] text-foreground outline-none focus:border-[var(--wireline-color-status-error)] sm:w-44"
        />
        <Button
          type="button"
          variant="secondary"
          size="sm"
          disabled={confirmation !== "DELETE" || working}
          onClick={requestDeletion}
          className="border-[var(--wireline-color-feedback-error-border)] text-[var(--wireline-color-status-error)] hover:bg-[var(--wireline-color-feedback-error-surface)]"
        >
          <Trash2 size={14} aria-hidden="true" />
          {working ? "Queuing…" : "Delete account"}
        </Button>
      </div>
      {message ? (
        <StatusNotice tone="success" className="mt-4" title="Deletion queued">
          {message}
        </StatusNotice>
      ) : null}
      {error ? (
        <StatusNotice tone="destructive" className="mt-4" title="Deletion unavailable">
          {error}
        </StatusNotice>
      ) : null}
    </section>
  );
}

function ReadOnlyField({ label, value }: { label: string; value: string }) {
  return (
    <label className="grid gap-2 text-sm font-semibold text-foreground">
      {label}
      <input
        readOnly
        value={value}
        className="h-12 rounded-xl border border-border bg-background px-4 text-sm font-medium text-foreground outline-none"
      />
    </label>
  );
}

export default function SettingsPage() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const [signingOut, setSigningOut] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resetState, setResetState] = useState<"idle" | "sending" | "sent">("idle");
  const displayName = user?.full_name?.trim() || user?.email?.split("@")[0] || "Workspace owner";
  const email = user?.email || "";

  async function requestPasswordReset() {
    if (resetState !== "idle" || !email) return;
    setResetState("sending");
    setError(null);
    try {
      const response = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      if (!response.ok) throw new Error(String(response.status));
      setResetState("sent");
    } catch {
      setError("Couldn't send the reset email. Try again in a moment.");
      setResetState("idle");
    }
  }

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
    <WorkspaceShell contentClassName="pt-1 pb-10">
      <WorkspacePageFrame narrow>
        <SettingsTabs />

        <section className="studio-card p-5 sm:p-6">
          <p className="wl-eyebrow wl-eyebrow--wired wl-eyebrow--wired--app">Profile</p>
          <div className="mt-5 grid gap-4">
            <ReadOnlyField label="Name" value={displayName} />
            <ReadOnlyField label="Email" value={email || "—"} />
          </div>
        </section>

        <section className="studio-card p-5 sm:p-6">
          <p className="wl-eyebrow wl-eyebrow--wired wl-eyebrow--wired--app">Security</p>
          <div className="mt-5 grid gap-3">
            <div className="flex flex-col gap-3 rounded-xl bg-muted/40 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-semibold text-foreground">Password</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {resetState === "sent"
                    ? "Reset link sent — check your email."
                    : "Reset via email."}
                </p>
              </div>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                disabled={resetState !== "idle"}
                onClick={() => void requestPasswordReset()}
              >
                {resetState === "sending" ? "Sending…" : "Reset password"}
              </Button>
            </div>
            <div className="flex items-center justify-between gap-4 rounded-xl bg-muted/40 px-4 py-4">
              <div>
                <p className="flex items-center gap-2 text-sm font-semibold text-foreground">
                  <ShieldCheck size={15} className="text-primary" aria-hidden="true" />
                  Session
                </p>
                <p className="mt-1 text-xs text-muted-foreground">Sign out of this browser.</p>
              </div>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                disabled={signingOut}
                onClick={handleSignOut}
              >
                <LogOut aria-hidden="true" size={14} />
                {signingOut ? "Signing out..." : "Sign out"}
              </Button>
            </div>
          </div>
          {error ? (
            <StatusNotice tone="destructive" className="mt-4" title="Sign-out unavailable">
              {error}
            </StatusNotice>
          ) : null}
        </section>

        <DangerZone />
      </WorkspacePageFrame>
    </WorkspaceShell>
  );
}
