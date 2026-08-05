import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { Loader2, Plus, Users, X } from "lucide-react";
import { Link } from "react-router";

import { Badge, Button, Input, NativeSelect } from "../components/atoms";
import { FormField, StatusNotice } from "../components/molecules";
import { WorkspacePageFrame, WorkspacePageIntro } from "../components/layout/WorkspacePageFrame";
import SettingsTabs from "../components/settings/SettingsTabs";
import { EmptyState } from "../components/ui/EmptyState";
import WorkspaceShell from "../components/WorkspaceShell";
import { useAuth } from "../contexts/AuthContext";
import { authFetch } from "../lib/api";
import { WL_APP_CLASSES } from "../lib/wireline-design-system";
import { useBodyScrollLock } from "../lib/use-body-scroll-lock";
import { useModalFocusTrap } from "../lib/use-modal-focus-trap";

type InviteRole = "admin" | "member" | "viewer";
type TeamAccess = "ok" | "restricted" | "certifying" | "error";

type TeamMemberRecord = {
  id: string;
  email: string | null;
  role: string | null;
};

type TeamErrorPayload = {
  code?: string;
  error?: string;
  message?: string;
};

const inviteRoleOptions: { value: InviteRole; label: string }[] = [
  { value: "admin", label: "Admin" },
  { value: "member", label: "Member" },
  { value: "viewer", label: "Viewer" },
];

function formatRole(role: string | null | undefined) {
  if (!role) return "Member";
  return role.charAt(0).toUpperCase() + role.slice(1);
}

function memberInitial(email?: string | null) {
  return (email?.trim().charAt(0) || "?").toUpperCase();
}

export default function TeamSettings() {
  const { user } = useAuth();
  const [members, setMembers] = useState<TeamMemberRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [teamAccess, setTeamAccess] = useState<TeamAccess>("ok");
  const [isInviteOpen, setIsInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<InviteRole>("member");
  const [inviting, setInviting] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [inviteSuccess, setInviteSuccess] = useState<string | null>(null);
  const inviteDialogRef = useRef<HTMLDivElement>(null);

  function openInviteDialog() {
    if (teamAccess !== "ok") return;
    setInviteError(null);
    setIsInviteOpen(true);
  }

  function closeInviteDialog() {
    if (inviting) return;
    setIsInviteOpen(false);
  }

  useBodyScrollLock(isInviteOpen);
  useModalFocusTrap(inviteDialogRef, {
    active: isInviteOpen,
    onEscape: closeInviteDialog,
  });

  const displayMembers = useMemo(() => {
    if (members.length > 0) return members;
    if (!user?.email) return [];
    return [
      {
        id: user.id || "self",
        email: user.email,
        role: "owner",
      },
    ];
  }, [members, user?.email, user?.id]);

  async function loadTeam() {
    setLoading(true);
    setTeamAccess("ok");
    try {
      const response = await authFetch("/api/team");
      const payload = (await response.json().catch(() => null)) as
        ({ members?: TeamMemberRecord[] } & TeamErrorPayload) | null;
      if (response.status === 403) {
        setTeamAccess("restricted");
        setMembers([]);
        return;
      }
      if (response.status === 503 && payload?.code === "SHARED_WORKSPACES_NOT_CERTIFIED") {
        setTeamAccess("certifying");
        setMembers([]);
        return;
      }
      if (!response.ok)
        throw new Error(payload?.error || payload?.message || String(response.status));
      setMembers(Array.isArray(payload?.members) ? payload.members : []);
    } catch {
      setTeamAccess("error");
      setMembers([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadTeam();
  }, []);

  const handleInvite = async (event: FormEvent) => {
    event.preventDefault();
    if (!inviteEmail || inviting || teamAccess !== "ok") return;
    setInviting(true);
    setInviteError(null);
    setInviteSuccess(null);
    try {
      const response = await authFetch("/api/team/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: inviteEmail, role: inviteRole }),
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as TeamErrorPayload | null;
        throw new Error(payload?.error || payload?.message || "Invite could not be sent.");
      }
      setInviteSuccess(`Invitation sent to ${inviteEmail}.`);
      setIsInviteOpen(false);
      setInviteEmail("");
      setInviteRole("member");
      await loadTeam();
    } catch (error) {
      setInviteError(error instanceof Error ? error.message : "Invite could not be sent.");
    } finally {
      setInviting(false);
    }
  };

  const canInvite = teamAccess === "ok";

  return (
    <WorkspaceShell contentClassName="pt-1 pb-10">
      <WorkspacePageFrame mode="standard">
        <SettingsTabs />
        {/* The selected Settings tab already reads "Team"; the heading stays
            for assistive tech only so the page is not labelled twice on screen. */}
        <WorkspacePageIntro title="Team" titleHidden />

        {teamAccess === "restricted" ? (
          <StatusNotice tone="info" title="Solo workspace">
            Team invites are available on Team and Business plans.{" "}
            <Link
              to="/settings/billing"
              className="font-semibold text-primary underline underline-offset-2"
            >
              Review billing
            </Link>{" "}
            to add seats.
          </StatusNotice>
        ) : null}

        {teamAccess === "certifying" ? (
          <StatusNotice tone="info" title="Shared workspaces are being certified">
            Your workspace remains fully available for solo use. Invitations stay off until Wireline
            completes the tenant-isolation and permission certification required for safe multi-user
            access.
          </StatusNotice>
        ) : null}

        {teamAccess === "error" ? (
          <StatusNotice tone="destructive" title="Team settings could not be loaded">
            Your workspace is unaffected. Refresh this page to retry the team status check.
          </StatusNotice>
        ) : null}

        {inviteSuccess ? (
          <StatusNotice tone="success" title="Invite sent">
            {inviteSuccess}
          </StatusNotice>
        ) : null}

        <section className="studio-card p-5 sm:p-6">
          <div className="flex items-center justify-between gap-3">
            <p className={WL_APP_CLASSES.wiredEyebrow}>Members</p>
            <Button
              type="button"
              size="sm"
              disabled={!canInvite}
              onClick={openInviteDialog}
              title={
                teamAccess === "certifying"
                  ? "Invitations will open after shared workspace certification."
                  : undefined
              }
            >
              <Plus size={14} aria-hidden="true" />
              Invite
            </Button>
          </div>

          {loading ? (
            <div
              className="mt-5 flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground"
              aria-busy="true"
            >
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              Loading team…
            </div>
          ) : displayMembers.length ? (
            <div className="mt-5 grid gap-3">
              {displayMembers.map((member) => (
                <div
                  key={member.id}
                  className="flex w-full min-w-0 max-w-full items-center justify-between gap-3 overflow-hidden rounded-xl border border-border bg-background px-4 py-4"
                >
                  <div className="flex min-w-0 flex-1 items-center gap-3 overflow-hidden">
                    <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-primary text-sm font-semibold text-primary-foreground">
                      {memberInitial(member.email)}
                    </span>
                    <div className="min-w-0 flex-1 overflow-hidden">
                      <p
                        data-wireline-preserve-case
                        className="block max-w-full overflow-hidden text-ellipsis whitespace-nowrap text-sm font-semibold text-foreground"
                      >
                        {member.email || "Pending invite"}
                      </p>
                      <p className="block max-w-full overflow-hidden text-ellipsis whitespace-nowrap text-xs text-muted-foreground">
                        {member.email === user?.email ? "You" : "Workspace member"}
                      </p>
                    </div>
                  </div>
                  <Badge
                    className="shrink-0"
                    // A role is identity, not a state — green is reserved for
                    // success/live signals.
                    variant={member.role === "owner" ? "default" : "outline"}
                  >
                    {formatRole(member.role)}
                  </Badge>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState
              icon={Users}
              title="No teammates yet"
              description="Invite collaborators to share numbers, approvals, and call outcomes."
              titleTone="ui"
              density="compact"
              withHalo={false}
              className="mt-5"
              actions={
                canInvite
                  ? [
                      {
                        label: "Invite teammate",
                        onClick: openInviteDialog,
                        primary: true,
                      },
                    ]
                  : []
              }
            />
          )}
        </section>
      </WorkspacePageFrame>

      {isInviteOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4 backdrop-blur-sm"
          role="presentation"
        >
          <div
            ref={inviteDialogRef}
            className="w-full max-w-md rounded-xl border border-border bg-card p-6 shadow-xl"
            role="dialog"
            aria-modal="true"
            aria-labelledby="team-invite-title"
            aria-busy={inviting}
          >
            <div className="mb-5 flex items-center justify-between">
              <h2
                data-slot="dialog-title"
                id="team-invite-title"
                className="font-[var(--wireline-font-family-display)] text-2xl font-normal tracking-[-.025em] text-foreground"
              >
                Invite teammate
              </h2>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={closeInviteDialog}
                disabled={inviting}
                aria-label="Close invite dialog"
              >
                <X size={20} />
              </Button>
            </div>
            <form onSubmit={handleInvite}>
              <div className="space-y-4">
                <FormField label="Email address" required>
                  <Input
                    type="email"
                    autoFocus
                    required
                    placeholder="colleague@company.com"
                    value={inviteEmail}
                    onChange={(event) => setInviteEmail(event.target.value)}
                  />
                </FormField>
                <FormField label="Access level">
                  <NativeSelect
                    value={inviteRole}
                    onChange={(event) => setInviteRole(event.target.value as InviteRole)}
                  >
                    {inviteRoleOptions.map((role) => (
                      <option key={role.value} value={role.value}>
                        {role.label}
                      </option>
                    ))}
                  </NativeSelect>
                </FormField>
              </div>
              {inviteError ? (
                <StatusNotice tone="destructive" className="mt-4" title="Invite failed">
                  {inviteError}
                </StatusNotice>
              ) : null}
              <div className="mt-8 flex justify-end gap-3">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={closeInviteDialog}
                  disabled={inviting}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={inviting}>
                  {inviting ? (
                    <>
                      <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                      Sending…
                    </>
                  ) : (
                    <>
                      <Plus size={16} />
                      Send invite
                    </>
                  )}
                </Button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </WorkspaceShell>
  );
}
