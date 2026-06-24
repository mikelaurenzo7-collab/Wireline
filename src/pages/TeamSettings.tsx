import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import {
  ArrowLeft,
  ChevronDown,
  Mail,
  Plus,
  ShieldCheck,
  UserPlus,
  X,
} from "lucide-react";

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

  const handleInvite = (e: FormEvent) => {
    e.preventDefault();
    if (inviteEmail) {
      setIsInviteOpen(false);
      setInviteEmail("");
      setInviteRole("Admin");
    }
  };

  return (
    <WorkspaceShell
      eyebrow="Administration"
      title="Team & roster"
      contentClassName="pt-6"
      action={
        <Button asChild variant="secondary" size="sm">
          <Link to="/settings">
            <ArrowLeft size={16} />
            Back to settings
          </Link>
        </Button>
      }
    >
      <div className="min-h-0 flex-1 pb-12">
        <div className="mx-auto max-w-[920px] space-y-8">
          <div className="flex flex-col gap-6 rounded-xl border border-border bg-card p-6 shadow-sm sm:flex-row sm:items-center sm:justify-between">
            <div>
              <Badge variant="info">
                <ShieldCheck size={14} />
                Business workspace
              </Badge>
              <h2 className="mt-3 text-[20px] font-semibold tracking-[-.01em] text-foreground">
                Manage your business roster
              </h2>
              <p className="mt-1 text-[14px] text-muted-foreground">
                Provision seats, assign roles, and control access to your automated business agents.
              </p>
            </div>
            <Button type="button" onClick={() => setIsInviteOpen(true)}>
              <UserPlus size={16} />
              Invite Member
            </Button>
          </div>

          <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
            <div className="flex items-center justify-between border-b border-border bg-muted/40 px-6 py-4">
              <h3 className="font-semibold text-foreground">Workspace roster</h3>
              <Badge variant="outline">
                {mockTeam.filter((member) => member.status === "Active").length} active
              </Badge>
            </div>

            <div className="divide-y divide-border">
              {mockTeam.map((member) => (
                <div
                  key={member.id}
                  className="flex items-center justify-between p-6 transition-colors hover:bg-muted/20"
                >
                  <div className="flex items-center gap-4">
                    <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[color:var(--wl-surface-container-low)] text-sm font-medium text-[color:var(--wl-brand-primary)]">
                      {member.avatarInitials}
                    </div>
                    <div>
                      <p className="text-sm font-medium text-foreground">
                        {member.name}{" "}
                        {member.role === "Owner" && (
                          <span className="ml-2 text-xs font-normal text-muted-foreground">(You)</span>
                        )}
                      </p>
                      <p className="text-[13px] text-muted-foreground">{member.email}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-4">
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
          </div>

          <StatusNotice tone="warning" title="Role-based access control is active.">
            Your business agents may handle sensitive client data and routing policies. Provision elevated access only to trusted operators who should be able to manage those workflows.
          </StatusNotice>
        </div>
      </div>

      {isInviteOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-xl border border-border bg-card p-6 shadow-xl">
            <div className="mb-5 flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold text-foreground">Invite to workspace</h3>
                <p className="mt-1 text-sm text-muted-foreground">Choose an email and assign the right level of access.</p>
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
                    onChange={(e) => setInviteEmail(e.target.value)}
                  />
                </FormField>
                <FormField label="Role assignment" description="Managers are represented as a planned role in this preview state.">
                  <NativeSelect value={inviteRole} onChange={(e) => setInviteRole(e.target.value as Role | "Manager")}>
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
                  Send Invitation
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </WorkspaceShell>
  );
}
