import { useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowLeft,
  ChevronDown,
  Mail,
  Plus,
  ShieldAlert,
  ShieldCheck,
  UserPlus,
  X,
} from "lucide-react";
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

export default function TeamSettings() {
  const [isInviteOpen, setIsInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");

  const handleInvite = (e: React.FormEvent) => {
    e.preventDefault();
    if (inviteEmail) {
      // Stub: send invite
      setIsInviteOpen(false);
      setInviteEmail("");
    }
  };

  return (
    <WorkspaceShell
      eyebrow="Administration"
      title="Team & roster"
      contentClassName="pt-6"
      action={
        <Link to="/settings" className="studio-secondary-button">
          <ArrowLeft size={16} />
          Back to settings
        </Link>
      }
    >
      <div className="min-h-0 flex-1 pb-12">
        <div className="mx-auto max-w-[920px] space-y-8">
          {/* Top Info Card */}
          <div className="flex flex-col gap-6 rounded-xl border border-border bg-card p-6 shadow-sm sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="mb-2 inline-flex items-center gap-1.5 rounded-full border border-[color:var(--wl-line-strong)] bg-[#F8F9FF] px-2.5 py-1 text-xs font-medium text-[color:var(--wl-brand-primary)]">
                <ShieldCheck size={14} />
                Business Workspace
              </div>
              <h2 className="text-[20px] font-semibold tracking-[-.01em] text-foreground">
                Manage your business roster
              </h2>
              <p className="mt-1 text-[14px] text-muted-foreground">
                Provision seats, assign roles, and control access to your automated business agents.
              </p>
            </div>
            <button
              onClick={() => setIsInviteOpen(true)}
              className="inline-flex h-10 items-center justify-center gap-2 whitespace-nowrap rounded-lg bg-[color:var(--wl-brand-primary)] px-4 text-sm font-medium text-white transition-all hover:bg-[color:var(--wl-brand-primary-press)] hover:shadow-md active:scale-[0.98]"
            >
              <UserPlus size={16} />
              Invite Member
            </button>
          </div>

          {/* Roster Table */}
          <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
            <div className="border-b border-border bg-muted/40 px-6 py-4">
              <h3 className="font-semibold text-foreground">
                Active Members ({mockTeam.filter((m) => m.status === "Active").length})
              </h3>
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
                          <span className="ml-2 text-xs font-normal text-muted-foreground">
                            (You)
                          </span>
                        )}
                      </p>
                      <p className="text-[13px] text-muted-foreground">{member.email}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-4">
                    {member.status === "Pending" ? (
                      <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
                        <Mail size={12} />
                        Invited
                      </span>
                    ) : (
                      <div className="relative group">
                        <button className="inline-flex h-8 items-center gap-2 rounded-md border border-transparent bg-transparent px-3 text-sm font-medium text-foreground transition-colors hover:border-border hover:bg-muted active:scale-[0.98]">
                          {member.role}
                          {member.role !== "Owner" && (
                            <ChevronDown size={14} className="text-muted-foreground" />
                          )}
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-xl border border-[color:var(--wl-line-strong)] bg-[#F8F9FF] p-5">
            <div className="flex items-start gap-3">
              <ShieldAlert className="mt-0.5 text-[color:var(--wl-brand-primary)]" size={18} />
              <div>
                <h4 className="text-sm font-medium text-[color:var(--wl-brand-primary)]">
                  Role-based Access Control (RBAC) Active
                </h4>
                <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">
                  Your business agents contain sensitive client data and routing protocols. Ensure
                  you only provision <strong>Admin</strong> or <strong>Manager</strong> access to
                  trusted operational leaders.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Invite Modal (Overlay) */}
      {isInviteOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm">
          <div className="w-full max-w-md animate-in fade-in zoom-in-95 rounded-xl border border-border bg-card p-6 shadow-xl">
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-lg font-semibold text-foreground">Invite to Workspace</h3>
              <button
                onClick={() => setIsInviteOpen(false)}
                className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
              >
                <X size={20} />
              </button>
            </div>
            <form onSubmit={handleInvite}>
              <div className="space-y-4">
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-foreground">
                    Email address
                  </label>
                  <input
                    type="email"
                    required
                    placeholder="colleague@company.com"
                    className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm text-foreground focus:border-[color:var(--wl-brand-primary)] focus:outline-none focus:ring-1 focus:ring-[color:var(--wl-brand-primary)]"
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-foreground">
                    Role assignment
                  </label>
                  <select className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm text-foreground focus:border-[color:var(--wl-brand-primary)] focus:outline-none focus:ring-1 focus:ring-[color:var(--wl-brand-primary)]">
                    <option value="Admin">Admin</option>
                    <option value="Manager">Manager</option>
                    <option value="Member">Member</option>
                    <option value="Viewer">Viewer</option>
                  </select>
                </div>
              </div>
              <div className="mt-8 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setIsInviteOpen(false)}
                  className="h-10 rounded-md px-4 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-[color:var(--wl-brand-primary)] px-4 text-sm font-medium text-white transition-all hover:bg-[color:var(--wl-brand-primary-press)] active:scale-[0.98]"
                >
                  <Plus size={16} />
                  Send Invitation
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </WorkspaceShell>
  );
}
