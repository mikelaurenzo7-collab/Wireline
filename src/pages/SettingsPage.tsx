import { useState } from "react";
import { KeyRound, LogOut, Mail, ShieldCheck, Trash2, UserRound } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";

import { Button } from "../components/atoms";
import { StatusNotice } from "../components/molecules";
import { WorkspacePageFrame } from "../components/layout/WorkspacePageFrame";
import SettingsTabs from "../components/settings/SettingsTabs";
import WorkspaceShell from "../components/WorkspaceShell";
import { useAuth } from "../contexts/AuthContext";
import { workspaceSidebarLabel } from "../lib/user-display";
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
    <section className="wl-paper wl-paper-elevated border-[var(--wireline-color-feedback-error-border)] p-5 sm:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="wl-eyebrow wl-eyebrow--muted text-[var(--wireline-color-status-error)]">
            Delete account
          </p>
          <p className="mt-2 max-w-[48ch] text-sm leading-6 text-muted-foreground">
            Permanently delete your account and all workspace data. Requires typed confirmation.
          </p>
        </div>
        <Trash2 className="hidden size-5 shrink-0 text-[var(--wireline-color-status-error)] sm:block" />
      </div>
      <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center">
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

function ProfileRow({
  icon: Icon,
  label,
  value,
  wrapValue = false,
}: {
  icon: typeof UserRound;
  label: string;
  value: string;
  wrapValue?: boolean;
}) {
  return (
    <div className="wl-data-row wl-data-row--framed">
      <span className="wl-data-row__leading rounded-lg bg-muted p-2" aria-hidden="true">
        <Icon size={15} />
      </span>
      <span className="wl-data-row__main">
        <span className="wl-data-row__detail">{label}</span>
        <span
          className="wl-data-row__title"
          data-wireline-preserve-case
          title={value}
          style={
            wrapValue
              ? { whiteSpace: "normal", overflowWrap: "anywhere", textOverflow: "clip" }
              : undefined
          }
        >
          {value}
        </span>
      </span>
    </div>
  );
}

export default function SettingsPage() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const [signingOut, setSigningOut] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resetState, setResetState] = useState<"idle" | "sending" | "sent">("idle");
  const displayName = workspaceSidebarLabel(user?.full_name, user?.email, "Workspace owner");
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
      <WorkspacePageFrame mode="narrow">
        <SettingsTabs />

        <section className="wl-paper wl-paper-elevated p-5 sm:p-6">
          <div className="mb-5 flex items-center justify-between gap-4">
            <div>
              <p className="wl-eyebrow wl-eyebrow--muted">Profile</p>
              <h1 className="mt-2 font-[var(--wireline-font-family-display)] text-[clamp(1.55rem,4vw,2.1rem)] font-normal leading-tight tracking-[-0.035em] text-foreground">
                Account identity
              </h1>
              <p className="mt-2 max-w-prose text-sm leading-relaxed text-muted-foreground">
                Signed-in identity and session controls. Profile edits ship in a later release — use
                Security below for password and compliance.
              </p>
            </div>
          </div>
          <div className="grid gap-3">
            <ProfileRow icon={UserRound} label="Name" value={displayName} />
            <ProfileRow icon={Mail} label="Email" value={email || "—"} wrapValue />
          </div>
        </section>

        <section className="wl-paper wl-paper-elevated p-5 sm:p-6">
          <p className="wl-eyebrow wl-eyebrow--muted">Security</p>
          <div className="mt-5 grid gap-3">
            <div className="wl-data-row wl-data-row--framed">
              <span className="wl-data-row__leading rounded-lg bg-muted p-2" aria-hidden="true">
                <ShieldCheck size={15} />
              </span>
              <span className="wl-data-row__main">
                <span className="wl-data-row__title">Compliance Center</span>
                <span className="wl-data-row__detail">
                  DNC, consent ledger, scrub status, and audit export
                </span>
              </span>
              <span className="wl-data-row__trailing">
                <Button asChild variant="secondary" size="sm">
                  <Link to="/settings/compliance">Open</Link>
                </Button>
              </span>
            </div>
            <div className="wl-data-row wl-data-row--framed">
              <span className="wl-data-row__leading rounded-lg bg-muted p-2" aria-hidden="true">
                <KeyRound size={15} />
              </span>
              <span className="wl-data-row__main">
                <span className="wl-data-row__title">Password</span>
                <span className="wl-data-row__detail">
                  {resetState === "sent" ? "Reset email sent" : "Send a secure reset email"}
                </span>
              </span>
              <span className="wl-data-row__trailing">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  disabled={resetState !== "idle"}
                  onClick={() => void requestPasswordReset()}
                >
                  {resetState === "sending" ? "Sending…" : resetState === "sent" ? "Sent" : "Reset"}
                </Button>
              </span>
            </div>
            <div className="wl-data-row wl-data-row--framed">
              <span className="wl-data-row__leading rounded-lg bg-muted p-2" aria-hidden="true">
                <LogOut size={15} />
              </span>
              <span className="wl-data-row__main">
                <span className="wl-data-row__title">Session</span>
                <span className="wl-data-row__detail">Leave this workspace on this device</span>
              </span>
              <span className="wl-data-row__trailing">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  disabled={signingOut}
                  onClick={handleSignOut}
                >
                  {signingOut ? "Signing out…" : "Sign out"}
                </Button>
              </span>
            </div>
          </div>
          {error ? (
            <StatusNotice tone="destructive" className="mt-4" title="Security action unavailable">
              {error}
            </StatusNotice>
          ) : null}
        </section>

        <DangerZone />
      </WorkspacePageFrame>
    </WorkspaceShell>
  );
}
