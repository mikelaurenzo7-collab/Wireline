import { useState, type FormEvent } from "react";
import { Plus, X } from "lucide-react";

import { Badge, Button, Input, NativeSelect } from "../components/atoms";
import { FormField } from "../components/molecules";
import SettingsTabs from "../components/settings/SettingsTabs";
import WorkspaceShell from "../components/WorkspaceShell";

type Role = "Owner" | "Admin" | "Member" | "Viewer";
interface TeamMember {
  id: string;
  name: string;
  email: string;
  role: Role;
  initial: string;
}

const members: TeamMember[] = [
  {
    id: "owner",
    name: "Mike Laurenzo",
    email: "owner@example.com",
    role: "Owner",
    initial: "M",
  },
  {
    id: "admin",
    name: "Jordan Freud",
    email: "jordan@example.com",
    role: "Admin",
    initial: "J",
  },
];

const inviteRoleOptions: Role[] = ["Admin", "Member", "Viewer"];

export default function TeamSettings() {
  const [isInviteOpen, setIsInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<Role>("Admin");

  const handleInvite = (event: FormEvent) => {
    event.preventDefault();
    if (!inviteEmail) return;
    setIsInviteOpen(false);
    setInviteEmail("");
    setInviteRole("Admin");
  };

  return (
    <WorkspaceShell title="" eyebrow="" contentClassName="pt-0 pb-10">
      <div className="mx-auto flex w-full max-w-[700px] flex-col gap-5 pb-10">
        <SettingsTabs />

        <h1 className="wl-display-3">Team</h1>

        <section className="studio-card p-5 sm:p-6">
          <div className="flex items-center justify-between gap-3">
            <p className="wl-overline">Members</p>
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
                <Badge variant={member.role === "Owner" ? "success" : "outline"}>
                  {member.role}
                </Badge>
              </div>
            ))}
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
