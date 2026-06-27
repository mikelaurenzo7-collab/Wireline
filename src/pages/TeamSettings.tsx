import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, ChevronDown, Mail, Plus, ShieldCheck, UserPlus, X } from "lucide-react";

import { Badge, Button, Input, NativeSelect } from "../components/atoms";
import { FormField, StatusNotice } from "../components/molecules";
import WorkspaceShell from "../components/WorkspaceShell";

type Role = "Owner" | "Admin" | "Member" | "Viewer";
interface TeamMember {
  id: string;
  name: string;
  email: string;
  role: Role;
  status: "Active" | "Pending";
  avatarInitials: string;
}

const mockTeam: TeamMember[] = [
  {
    id: "1",
    name: "Sarah Connor",
    email: "sarah@wireline.co",
    role: "Owner",
    status: "Active",
    avatarInitials: "SC",
  },
  {
    id: "2",
    name: "Miles Dyson",
    email: "miles@wireline.co",
    role: "Admin",
    status: "Active",
    avatarInitials: "MD",
  },
  {
    id: "3",
    name: "Kyle Reese",
    email: "kyle@wireline.co",
    role: "Member",
    status: "Active",
    avatarInitials: "KR",
  },
  {
    id: "4",
    name: "John Connor",
    email: "john@wireline.co",
    role: "Viewer",
    status: "Pending",
    avatarInitials: "JC",
  },
];
const inviteRoleOptions: Array<Role | "Manager"> = ["Admin", "Manager", "Member", "Viewer"];

export default function TeamSettings() {
  const [isInviteOpen, setIsInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<Role | "Manager">("Admin");
  const handleInvite = (event: FormEvent) => {
    event.preventDefault();
    if (!inviteEmail) return;
    setIsInviteOpen(false);
    setInviteEmail("");
    setInviteRole("Admin");
  };

  return (
    <WorkspaceShell
      eyebrow="Workspace"
      title="Team"
      contentClassName="pt-6"
      action={
        <Button asChild variant="secondary" size="sm" className="shrink-0">
          <Link to="/settings" aria-label="Back to Settings">
            <ArrowLeft size={16} />
            <span className="hidden sm:inline">Settings</span>
          </Link>
        </Button>
      }
    >
      <div className="min-h-0 flex-1 pb-12">
        <div className="mx-auto max-w-[920px] space-y-6">
          <section className="studio-card flex flex-col gap-5 p-6 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-center sm:text-left">
              <Badge variant="info">
                <ShieldCheck size={14} />
                Business
              </Badge>
              <h2 className="mt-2 text-[var(--wireline-typography-h3-size)] font-semibold tracking-[-.01em] text-foreground">
                Your team.
              </h2>
            </div>
            <Button type="button" onClick={() => setIsInviteOpen(true)}>
              <UserPlus size={16} />
              Invite
            </Button>
          </section>

          <section className="overflow-hidden rounded-xl border border-border bg-card">
            <div className="flex items-center justify-between border-b border-border bg-muted/40 px-5 py-4 sm:px-6">
              <h3 className="font-semibold text-foreground">Roster</h3>
              <Badge variant="outline">
                {mockTeam.filter((member) => member.status === "Active").length} active
              </Badge>
            </div>
            <div className="divide-y divide-border">
              {mockTeam.map((member) => (
                <div
                  key={member.id}
                  className="flex items-center justify-between gap-4 p-4 transition-colors hover:bg-muted/20 sm:p-5"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[color:var(--wireline-color-surface-subtle)] text-sm font-medium text-[color:var(--wireline-color-action-primary-default)]">
                      {member.avatarInitials}
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-foreground">
                        {member.name}
                        {member.role === "Owner" ? (
                          <span className="ml-2 text-xs font-normal text-muted-foreground">
                            (You)
                          </span>
                        ) : null}
                      </p>
                      <p
                        data-wireline-preserve-case
                        className="truncate text-[var(--wireline-typography-caption-size)] text-muted-foreground"
                      >
                        {member.email}
                      </p>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    {member.status === "Pending" ? (
                      <Badge variant="warning">
                        <Mail size={12} />
                        Invited
                      </Badge>
                    ) : member.role === "Owner" ? (
                      <Badge variant="success">Owner</Badge>
                    ) : (
                      <Button type="button" variant="ghost" size="sm" className="px-3">
                        {member.role}
                        <ChevronDown size={14} className="text-muted-foreground" />
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </section>

          <StatusNotice tone="warning" title="Access is role-based">
            Give elevated controls only to people who should manage agents and integrations.
          </StatusNotice>
        </div>
      </div>

      {isInviteOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-xl border border-border bg-card p-6 shadow-xl">
            <div className="mb-5 flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold text-foreground">Invite to workspace</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  Choose an email and access level.
                </p>
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
                    onChange={(event) => setInviteRole(event.target.value as Role | "Manager")}
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
