import { useEffect, useState } from "react";
import { KeyRound, LogOut, Mail, ShieldCheck, Trash2, UserRound } from "lucide-react";
import { Link, useNavigate } from "react-router";

import { Button } from "../components/atoms";
import { StatusNotice } from "../components/molecules";
import { WorkspacePageFrame, WorkspacePageIntro } from "../components/layout/WorkspacePageFrame";
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
  const [renewalStopNeedsAttention, setRenewalStopNeedsAttention] = useState(false);
  const [deletionScheduled, setDeletionScheduled] = useState(false);
  const [deletionStatusLoading, setDeletionStatusLoading] = useState(true);
  const [cancelWorking, setCancelWorking] = useState(false);

  useEffect(() => {
    let active = true;

    void (async () => {
      try {
        const response = await authFetch("/api/account/deletion-status");
        const data = (await response.json().catch(() => null)) as {
          error?: string;
          pending?: boolean;
          scheduled_purge_at?: string | null;
        } | null;
        if (!response.ok) {
          throw new Error(data?.error || `Couldn't load deletion status (${response.status}).`);
        }
        if (!active || !data?.pending) return;

        const when = data.scheduled_purge_at
          ? new Date(data.scheduled_purge_at).toLocaleDateString()
          : "the end of the grace period";
        setDeletionScheduled(true);
        setMessage(
          `Deletion is scheduled for ${when}. Use Keep my account below to reverse it before the grace period ends. Review Billing if an upcoming renewal still appears.`,
        );
      } catch (err) {
        if (!active) return;
        setError(
          err instanceof Error
            ? err.message
            : "Couldn't verify whether deletion is already scheduled.",
        );
      } finally {
        if (active) setDeletionStatusLoading(false);
      }
    })();

    return () => {
      active = false;
    };
  }, []);

  async function requestDeletion() {
    if (confirmation !== "DELETE" || working) return;
    setWorking(true);
    setMessage(null);
    setError(null);
    setRenewalStopNeedsAttention(false);
    try {
      const response = await authFetch("/api/account/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmation: "DELETE" }),
      });
      const data = (await response.json().catch(() => null)) as {
        error?: string;
        scheduled_purge_at?: string;
        already_pending?: boolean;
        grace_days?: number;
        renewal_stopped?: boolean;
        billing_period_end?: string | null;
      } | null;
      if (!response.ok) {
        throw new Error(data?.error || `Couldn't queue deletion (${response.status}).`);
      }
      const when = data?.scheduled_purge_at
        ? new Date(data.scheduled_purge_at).toLocaleDateString()
        : "about 30 days";
      const renewalNeedsAttention = data?.renewal_stopped === false;
      setRenewalStopNeedsAttention(renewalNeedsAttention);
      setDeletionScheduled(true);
      const renewalDetail = renewalNeedsAttention
        ? " We could not confirm that subscription renewal stopped. Contact support@trywireline.com now so we can resolve billing without delaying deletion."
        : " Future subscription renewal is stopped. Paid access may remain available through the current billing period.";
      setMessage(
        data?.already_pending
          ? `Deletion is already scheduled for ${when}.${renewalDetail}`
          : `Deletion scheduled for ${when}.${renewalDetail}`,
      );
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Couldn't queue the deletion. Try again in a moment.",
      );
    } finally {
      setWorking(false);
    }
  }

  async function cancelDeletion() {
    if (!deletionScheduled || cancelWorking) return;
    setCancelWorking(true);
    setError(null);
    try {
      const response = await authFetch("/api/account/cancel-deletion", { method: "POST" });
      const data = (await response.json().catch(() => null)) as {
        error?: string;
        renewal_resumed?: boolean;
      } | null;
      if (!response.ok) {
        throw new Error(data?.error || `Couldn't cancel deletion (${response.status}).`);
      }
      setDeletionScheduled(false);
      setConfirmation("");
      const renewalNeedsAttention = data?.renewal_resumed === false;
      setRenewalStopNeedsAttention(renewalNeedsAttention);
      setMessage(
        renewalNeedsAttention
          ? "Deletion canceled. We could not confirm that subscription renewal resumed; review Billing before the current period ends."
          : "Deletion canceled. Your account remains active and subscription renewal is restored when applicable.",
      );
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Couldn't cancel deletion. Try again in a moment.",
      );
    } finally {
      setCancelWorking(false);
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
            Stops future subscription renewal and schedules permanent deletion after a 30-day grace
            period. Paid access may remain through the current billing period. Type DELETE to
            confirm.
          </p>
        </div>
        <Trash2 className="hidden size-5 shrink-0 text-[var(--wireline-color-status-error)] sm:block" />
      </div>
      {deletionStatusLoading ? (
        <p className="mt-5 text-sm text-muted-foreground" role="status">
          Checking deletion status…
        </p>
      ) : !deletionScheduled ? (
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
            {working ? "Scheduling…" : "Delete account"}
          </Button>
        </div>
      ) : null}
      {message ? (
        <StatusNotice
          tone={renewalStopNeedsAttention ? "warning" : "success"}
          className="mt-4"
          title={
            renewalStopNeedsAttention
              ? deletionScheduled
                ? "Deletion scheduled: billing action needed"
                : "Deletion canceled: billing review needed"
              : deletionScheduled
                ? "Deletion scheduled"
                : "Deletion canceled"
          }
        >
          {message}
        </StatusNotice>
      ) : null}
      {deletionScheduled ? (
        <Button
          type="button"
          variant="secondary"
          size="sm"
          disabled={cancelWorking}
          onClick={cancelDeletion}
          className="mt-3"
        >
          {cancelWorking ? "Keeping account…" : "Keep my account"}
        </Button>
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
          className={
            wrapValue ? "wl-data-row__title wl-data-row__title--multiline" : "wl-data-row__title"
          }
          data-wireline-preserve-case
          title={value}
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
    <WorkspaceShell contentClassName="pt-1 pb-6">
      <WorkspacePageFrame mode="standard">
        <SettingsTabs />
        <WorkspacePageIntro title="Account" titleHidden />

        <section className="wl-paper wl-paper-elevated p-5 sm:p-6">
          <p className="wl-eyebrow wl-eyebrow--muted">Profile</p>
          <div className="mt-5 grid gap-3">
            <ProfileRow icon={UserRound} label="Name" value={displayName} />
            <ProfileRow icon={Mail} label="Email" value={email || "N/A"} wrapValue />
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
                <span className="wl-data-row__title">Consent and DNC</span>
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
