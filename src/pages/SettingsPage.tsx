import { useState } from "react";
import { LogOut, ShieldCheck } from "lucide-react";
import { useNavigate } from "react-router-dom";

import { Badge, Button } from "../components/atoms";
import { StatusNotice } from "../components/molecules";
import SettingsTabs from "../components/settings/SettingsTabs";
import WorkspaceShell from "../components/WorkspaceShell";
import { useAuth } from "../contexts/AuthContext";

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
  const displayName = user?.full_name?.trim() || user?.email?.split("@")[0] || "Workspace owner";
  const email = user?.email || "owner@example.com";

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
    <WorkspaceShell title="" eyebrow="" contentClassName="pt-0 pb-10">
      <div className="mx-auto flex w-full max-w-[700px] flex-col gap-5 pb-10">
        <SettingsTabs />

        <h1 className="font-[var(--wireline-font-family-display)] text-[clamp(2.1rem,4vw,3rem)] font-normal leading-none tracking-[-0.035em] text-foreground">
          Account
        </h1>

        <section className="studio-card p-5 sm:p-6">
          <p className="wl-overline">Profile</p>
          <div className="mt-5 grid gap-4">
            <ReadOnlyField label="Name" value={displayName} />
            <ReadOnlyField label="Email" value={email} />
            <ReadOnlyField label="Company" value="Wireline" />
          </div>
        </section>

        <section className="studio-card p-5 sm:p-6">
          <p className="wl-overline">Security</p>
          <div className="mt-5 grid gap-3">
            <div className="flex items-center justify-between gap-4 rounded-xl bg-muted/40 px-4 py-4">
              <div>
                <p className="text-sm font-semibold text-foreground">Password</p>
                <p className="mt-1 text-xs text-muted-foreground">Last changed 14 days ago</p>
              </div>
              <Button type="button" variant="secondary" size="sm">
                Change
              </Button>
            </div>
            <div className="flex items-center justify-between gap-4 rounded-xl bg-muted/40 px-4 py-4">
              <div>
                <p className="text-sm font-semibold text-foreground">Two-factor auth</p>
                <p className="mt-1 text-xs text-muted-foreground">TOTP via authenticator app</p>
              </div>
              <Badge variant="success">Enabled</Badge>
            </div>
            <div className="flex items-center justify-between gap-4 rounded-xl bg-muted/40 px-4 py-4">
              <div>
                <p className="flex items-center gap-2 text-sm font-semibold text-foreground">
                  <ShieldCheck size={15} className="text-primary" aria-hidden="true" />
                  Session
                </p>
                <p className="mt-1 text-xs text-muted-foreground">Sign out of this browser.</p>
              </div>
              <Button type="button" variant="secondary" size="sm" disabled={signingOut} onClick={handleSignOut}>
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
      </div>
    </WorkspaceShell>
  );
}
