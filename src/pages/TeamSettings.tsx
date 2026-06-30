import { useMemo, useState, type FormEvent } from "react";
import { Plus, ShieldCheck, UsersRound, X } from "lucide-react";

import { Badge, Button, Input, NativeSelect } from "../components/atoms";
import { FormField } from "../components/molecules";
import SettingsTabs from "../components/settings/SettingsTabs";
import WorkspaceShell from "../components/WorkspaceShell";
import { useAuth } from "../contexts/AuthContext";

type Role = "Owner" | "Admin" | "Member" | "Viewer";
interface TeamMember {
  id: string;
  name: string;
  email: string;
  role: Role;
  initial: string;
}

const inviteRoleOptions: Role[] = ["Admin", "Member", "Viewer"];

function userInitial(name?: string | null, email?: string | null) {
  return (name || email || "Y").trim().charAt(0).toUpperCase() || "Y";
}

export default function TeamSettings() {
  const { user } = useAuth();
  const [isInviteOpen, setIsInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<Role>("Admin");

  const members = useMemo<TeamMember[]>(() => {
    if (!user?.id) return [];
    return [
      {
        id: user.id,
        name: user.full_name?.trim() || user.email?.split("@")[0] || "You",
        email: user.email || "",
        role: "Owner",
        initial: userInitial(user.full_name, user.email),
      },
    ];
  }, [user?.email, user?.full_name, user?.id]);

  const handleInvite = (event: FormEvent) => {
    event.preventDefault();
    if (!inviteEmail) return;
    setIsInviteOpen(false);
    setInviteEmail("");
    setInviteRole("Admin");
  };

  return (
    <WorkspaceShell title="" eyebrow="" contentClassName="pt-0 pb-10">
      <div className="mx-auto flex w-full max-w-[920px] flex-col gap-5 pb-10">
        <SettingsTabs />

        <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_300px] lg:items-start">
          <div>
            <h1 className="wl-display-3">Team</h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
              Keep invites, roles, and workspace access in one place. This page should never invent
              teammates you have not actually added.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
            <div className="wl-card flex items-start gap-3">
              <span className="grid size-10 shrink-0 place-items-center rounded-[10px] bg-[var(--wireline-color-feedback-success-surface)] text-primary">
                <UsersRound size={18} aria-hidden="true" />
              </span>
              <div>
                <p className="text-sm font-semibold text-foreground">Seats stay truthful</p>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">
                  Only real workspace members appear here. No seeded names. No demo teammates.
                </p>
              </div>
            </div>
            <div className="wl-card flex items-start gap-3">
              <span className="grid size-10 shrink-0 place-items-center rounded-[10px] bg-muted text-primary">
                <ShieldCheck size={18} aria-hidden="true" />
              </span>
              <div>
                <p className="text-sm font-semibold text-foreground">Role-aware access</p>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">
                  Invite admins, members, or viewers as the team grows. Owner access stays anchored to your account.
                </p>
              </div>
            </div>
          </div>
        </section>

        <section className="studio-card p-5 sm:p-6">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="wl-overline">Members</p>
              <p className="mt-1 text-sm text-muted-foreground">
                {members.length === 1
                  ? "You are the only member in this workspace right now."
                  : `${members.length} members in this workspace.`}
              </p>
            </div>
            <Button type="button" size="sm" onClick={() => setIsInviteOpen(true)}>
              <Plus size={14} aria-hidden="true" />
              Invite
            </Button>
          </div>
          <div className="mt-5 grid gap-3">
            {members.map((member) => (
              <div
                key={member.id}
                className="flex items-center justify-between gap-4 rounded-xl border border-border bg-background px-4 py-4"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-primary text-sm font-semibold text-primary-foreground">
                    {member.initial}
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-foreground">{member.name}</p>
                    <p className="truncate text-xs text-muted-foreground">{member.email}</p>
                  </div>
                </div>
                <Badge variant={member.role === "Owner" ? "success" : "outline"}>{member.role}</Badge>
              </div>
            ))}
          </div>
        </section>

        <section className="grid gap-4 lg:grid-cols-2">
          <div className="wl-card-lg">
            <p className="wl-overline">Invite flow</p>
            <h2 className="mt-3 font-[var(--wireline-font-family-display)] text-2xl font-normal tracking-[-.025em] text-foreground">
              Bring teammates in when there is real work to share.
            </h2>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">
              Admins can help with setup and routing. Members can operate the workspace. Viewers can observe without changing configuration.
            </p>
          </div>
          <div className="wl-card">
            <p className="wl-overline">Access levels</p>
            <div className="mt-4 grid gap-2.5 text-sm">
              {[
                ["Owner", "Full control of billing, settings, and workspace access."],
                ["Admin", "Can configure agents, routing, and day-to-day operations."],
                ["Member", "Can work in the product without changing owner-level settings."],
                ["Viewer", "Read-only access for stakeholders and approvals."],
              ].map(([title, detail]) => (
                <div key={title} className="rounded-xl border border-border bg-background px-4 py-3">
                  <p className="font-semibold text-foreground">{title}</p>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">{detail}</p>
                </div>
              ))}
            </div>
          </div>
        </section>
      </div>

      {isInviteOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-xl border border-border bg-card p-6 shadow-xl">
            <div className="mb-5 flex items-center justify-between">
              <div>
                <h2 className="font-[var(--wireline-font-family-display)] text-2xl font-normal tracking-[-.025em] text-foreground">
                  Invite teammate
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">Add someone to the workspace.</p>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => setIsInviteOpen(false)}
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
                    required
                    placeholder="colleague@company.com"
                    value={inviteEmail}
                    onChange={(event) => setInviteEmail(event.target.value)}
                  />
                </FormField>
                <FormField label="Access level">
                  <NativeSelect
                    value={inviteRole}
                    onChange={(event) => setInviteRole(event.target.value as Role)}
                  >
                    {inviteRoleOptions.map((role) => (
                      <option key={role} value={role}>
                        {role}
                      </option>
                    ))}
                  </NativeSelect>
                </FormField>
              </div>
              <div className="mt-8 flex justify-end gap-3">
                <Button type="button" variant="secondary" onClick={() => setIsInviteOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit">
                  <Plus size={16} />
                  Send invite
                </Button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </WorkspaceShell>
  );
}
