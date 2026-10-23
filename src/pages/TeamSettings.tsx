import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { Loader2, Plus, Users, X } from "lucide-react";

import { Button, Input, NativeSelect } from "../components/atoms";
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

const TEAM_INVITES_UNAVAILABLE = "Team invitations are currently unavailable.";

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
  const [removingId, setRemovingId] = useState<string | null>(null);
  const mutationPending = useRef(false);
  const inviteDialogRef = useRef<HTMLDivElement>(null);

  function openInviteDialog() {
    if (teamAccess !== "ok" || loading || mutationPending.current) return;
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
        role: null,
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
      if (!Array.isArray(payload?.members)) throw new Error("Team status could not be confirmed.");
      setMembers(payload.members);
    } catch {
      setTeamAccess("error");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadTeam();
  }, []);

  const handleInvite = async (event: FormEvent) => {
    event.preventDefault();
    if (!inviteEmail || inviting || loading || teamAccess !== "ok" || mutationPending.current)
      return;
    mutationPending.current = true;
    setInviting(true);
    setInviteError(null);
    setInviteSuccess(null);
    let outcomeUnknown = true;
    try {
      const response = await authFetch("/api/team/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: inviteEmail, role: inviteRole }),
      });
      const payload = (await response.json().catch(() => null)) as
        | (TeamErrorPayload & {
            success?: boolean;
            email_sent?: boolean;
            invitation?: { id?: string; email?: string; role?: string };
          })
        | null;
      if (!response.ok) {
        outcomeUnknown =
          response.status >= 500 && payload?.code !== "SHARED_WORKSPACES_NOT_CERTIFIED";
        if (payload?.code === "SHARED_WORKSPACES_NOT_CERTIFIED") {
          setTeamAccess("certifying");
          throw new Error(TEAM_INVITES_UNAVAILABLE);
        }
        throw new Error(payload?.error || payload?.message || "Invite could not be sent.");
      }
      if (
        payload?.success !== true ||
        typeof payload.email_sent !== "boolean" ||
        !payload.invitation ||
        typeof payload.invitation.id !== "string" ||
        !payload.invitation.id ||
        payload.invitation.email?.trim().toLowerCase() !== inviteEmail.trim().toLowerCase() ||
        payload.invitation.role !== inviteRole
      ) {
        setTeamAccess("error");
        throw new Error(
          "The invitation could not be confirmed. Refresh team status before trying again.",
        );
      }
      outcomeUnknown = false;
      if (payload?.email_sent === false) {
        setInviteError(
          `The invitation for ${inviteEmail} is saved, but email delivery was not confirmed. Check with the recipient before sending again.`,
        );
        await loadTeam();
        return;
      }
      setInviteSuccess(`Invitation sent to ${inviteEmail}.`);
      setIsInviteOpen(false);
      setInviteEmail("");
      setInviteRole("member");
      await loadTeam();
    } catch (error) {
      if (outcomeUnknown) setTeamAccess("error");
      setInviteError(
        error instanceof Error
          ? error.message
          : "The invitation could not be confirmed. Refresh team status before trying again.",
      );
    } finally {
      mutationPending.current = false;
      setInviting(false);
    }
  };

  async function removeMember(member: TeamMemberRecord) {
    if (
      !member.id ||
      member.email === user?.email ||
      loading ||
      teamAccess !== "ok" ||
      mutationPending.current
    )
      return;
    mutationPending.current = true;
    setRemovingId(member.id);
    setInviteError(null);
    setInviteSuccess(null);
    try {
      const response = await authFetch(`/api/team/${encodeURIComponent(member.id)}`, {
        method: "DELETE",
      });
      const payload = (await response.json().catch(() => null)) as
        (TeamErrorPayload & { success?: boolean }) | null;
      if (!response.ok)
        throw new Error(payload?.error || payload?.message || "Could not remove this teammate.");
      if (payload?.success !== true)
        throw new Error("Removal could not be confirmed. Refresh team status before trying again.");
      await loadTeam();
    } catch (error) {
      setTeamAccess("error");
      setInviteError(
        error instanceof Error
          ? error.message
          : "Removal could not be confirmed. Refresh team status before trying again.",
      );
    } finally {
      mutationPending.current = false;
      setRemovingId(null);
    }
  }

  const canInvite = teamAccess === "ok" && !loading && !inviting && !removingId;

  return (
    <WorkspaceShell contentClassName="pt-1 pb-6">
      <WorkspacePageFrame mode="narrow">
        <SettingsTabs />
        {/* The selected Settings tab already reads "Team"; the heading stays
            for assistive tech only so the page is not labelled twice on screen. */}
        <WorkspacePageIntro title="Team" titleHidden />

        {teamAccess === "restricted" ? (
          <StatusNotice tone="info" title="Team Access Restricted">
            You do not have permission to manage this team.
          </StatusNotice>
        ) : null}

        {teamAccess === "certifying" ? (
          <StatusNotice tone="info">{TEAM_INVITES_UNAVAILABLE}</StatusNotice>
        ) : null}

        {teamAccess === "error" ? (
          <StatusNotice tone="destructive" title="Team Settings Could Not Be Loaded">
            Team status could not be confirmed. Your last confirmed members remain visible.
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="mt-3"
              disabled={loading || inviting || Boolean(removingId)}
              onClick={() => void loadTeam()}
            >
              Refresh Team
            </Button>
          </StatusNotice>
        ) : null}

        {inviteSuccess ? (
          <StatusNotice tone="success" title="Invite Sent">
            {inviteSuccess}
          </StatusNotice>
        ) : null}
        {inviteError && !isInviteOpen ? (
          <StatusNotice tone="destructive" title="Team Action Needs Attention">
            {inviteError}
          </StatusNotice>
        ) : null}

        <section className="studio-card p-5 sm:p-6">
          <div className="flex items-center justify-between gap-3">
            <p className={WL_APP_CLASSES.wiredEyebrow}>Members</p>
            <Button
              type="button"
              size="sm"
              variant={canInvite ? "default" : "secondary"}
              disabled={!canInvite}
              onClick={openInviteDialog}
              title={teamAccess === "certifying" ? TEAM_INVITES_UNAVAILABLE : undefined}
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
                    <span
                      aria-hidden="true"
                      className="grid size-8 shrink-0 place-items-center rounded-lg bg-muted text-xs font-semibold text-foreground"
                    >
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
                        {member.role
                          ? `${formatRole(member.role)}${member.email === user?.email ? " · You" : ""}`
                          : member.email === user?.email
                            ? "You"
                            : formatRole(member.role)}
                      </p>
                    </div>
                  </div>
                  {member.email && member.email !== user?.email ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      disabled={teamAccess !== "ok" || loading || inviting || Boolean(removingId)}
                      onClick={() => void removeMember(member)}
                    >
                      {removingId === member.id ? "Removing…" : "Remove"}
                    </Button>
                  ) : null}
                </div>
              ))}
            </div>
          ) : (
            <EmptyState
              icon={Users}
              title="No Teammates Yet"
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
          className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 px-[max(0.75rem,env(safe-area-inset-left))] pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-[max(0.75rem,env(safe-area-inset-top))] backdrop-blur-sm sm:px-[max(1rem,env(safe-area-inset-left))] sm:pb-[max(1rem,env(safe-area-inset-bottom))] sm:pt-[max(1rem,env(safe-area-inset-top))]"
          role="presentation"
        >
          <div
            ref={inviteDialogRef}
            className="max-h-[calc(100dvh-max(1.5rem,env(safe-area-inset-top))-max(1.5rem,env(safe-area-inset-bottom)))] w-full max-w-md overflow-y-auto overscroll-contain rounded-xl border border-border bg-card p-6 shadow-xl"
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
                Invite Teammate
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
                    disabled={inviting}
                    required
                    placeholder="colleague@company.com"
                    value={inviteEmail}
                    onChange={(event) => setInviteEmail(event.target.value)}
                  />
                </FormField>
                <FormField label="Access level">
                  <NativeSelect
                    value={inviteRole}
                    disabled={inviting}
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
                <StatusNotice tone="destructive" className="mt-4" title="Invite Failed">
                  {inviteError}
                  {teamAccess === "error" ? (
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      className="mt-3"
                      disabled={loading || inviting}
                      onClick={() => void loadTeam()}
                    >
                      Refresh Team
                    </Button>
                  ) : null}
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
                <Button type="submit" disabled={inviting || !canInvite}>
                  {inviting ? (
                    <>
                      <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                      Sending…
                    </>
                  ) : (
                    <>
                      <Plus size={16} />
                      Send Invite
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
