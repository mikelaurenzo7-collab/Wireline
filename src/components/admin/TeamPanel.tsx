import React, { useState } from "react";
import { KeyRound, Trash2, Mail, Shield, User, Plus, Loader2 } from "lucide-react";
import { cn } from "../../lib/utils";
import { Panel } from "../PageShell";
import { Input } from "../ui/shadcn/Input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/shadcn/Select";
import { ShadButton } from "../ui/shadcn/ShadButton";

interface TeamMember {
  id: string;
  email: string;
  role: string;
  user_id: string | null;
  created_at: string;
}

interface TeamPanelProps {
  members: TeamMember[];
  onInvite: (email: string, role: string) => void;
  onRemove: (id: string) => void;
}

export function TeamPanel({ members, onInvite, onRemove }: TeamPanelProps) {
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("member");
  const [isInviting, setIsInviting] = useState(false);

  const roles = [
    { id: "owner", label: "Owner", icon: Shield, color: "text-brand", bg: "bg-brand/10" },
    { id: "admin", label: "Admin", icon: Shield, color: "text-brand", bg: "bg-brand/10" },
    { id: "member", label: "Member", icon: User, color: "text-foreground", bg: "bg-black/5" },
    { id: "auditor", label: "Auditor", icon: KeyRound, color: "text-muted", bg: "bg-black/5" },
  ];

  const handleInvite = async () => {
    if (!inviteEmail) return;
    setIsInviting(true);
    await onInvite(inviteEmail, inviteRole);
    setInviteEmail("");
    setIsInviting(false);
  };

  return (
    <div className="h-full grid grid-cols-1 xl:grid-cols-3 gap-3 min-h-0 scroll-viewport pb-6">
      <div className="xl:col-span-2 space-y-3">
        <Panel title="Team Management" hint="ACCESS CONTROL" icon={KeyRound} scroll>
          <div className="space-y-6">
            <div className="flex flex-col md:flex-row gap-3 p-4 rounded-md wl-panel border border-input bg-brand/5">
              <div className="flex-1 space-y-1.5">
                <label className="wl-label-muted font-bold ml-1">Invite New Member</label>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted" />
                    <Input
                      type="email"
                      autoComplete="email"
                      autoCapitalize="none"
                      spellCheck={false}
                      inputMode="email"
                      placeholder="colleague@business.com"
                      className="w-full pl-9 pr-4 py-2.5 bg-white/50 border border-input rounded-md outline-none focus-visible:ring-brand/40 text-sm transition-all h-auto"
                      value={inviteEmail}
                      onChange={(e) => setInviteEmail(e.target.value)}
                    />
                  </div>
                  <Select value={inviteRole} onValueChange={setInviteRole}>
                    <SelectTrigger
                      aria-label="Role"
                      className="w-32 px-3 py-2.5 bg-white/50 border border-input rounded-md text-xs cursor-pointer h-auto"
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="member">Member</SelectItem>
                      <SelectItem value="admin">Admin</SelectItem>
                      <SelectItem value="owner">Owner</SelectItem>
                      <SelectItem value="auditor">Auditor</SelectItem>
                    </SelectContent>
                  </Select>
                  <ShadButton
                    disabled={isInviting || !inviteEmail}
                    variant="outline"
                    className="app-primary-action flex items-center gap-2 disabled:opacity-50"
                    onClick={handleInvite}
                  >
                    {isInviting ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Plus className="w-3.5 h-3.5" />
                    )}
                    <span>Invite</span>
                  </ShadButton>
                </div>
              </div>
            </div>

            <div className="space-y-1">
              <div className="app-section-title mb-4 px-1 flex justify-between items-center">
                <span>Active Roster</span>
                <span>{members.length} Total</span>
              </div>

              <div className="grid grid-cols-1 gap-2">
                {members.length === 0 ? (
                  <div className="py-20 text-center wl-panel border border-dashed border-input rounded-md">
                    <User className="w-8 h-8 text-muted/70 mx-auto mb-3" />
                    <p className="text-xs text-muted uppercase tracking-widest font-medium">
                      No team members found
                    </p>
                    <p className="wl-micro-meta--muted mt-1">
                      Invite your first colleague to begin collaborating.
                    </p>
                  </div>
                ) : (
                  members.map((m) => {
                    const roleInfo = roles.find((r) => r.id === m.role) || roles[2];
                    return (
                      <div
                        key={m.id}
                        className="group flex items-center gap-4 p-4 rounded-md wl-panel border border-input hover:border-brand/20 transition-all hover:bg-white/5"
                      >
                        <div
                          className={cn(
                            "w-10 h-10 rounded-md flex items-center justify-center text-xs font-bold uppercase shrink-0 transition-transform group-hover:scale-105",
                            roleInfo.bg,
                            roleInfo.color,
                          )}
                        >
                          {m.email.charAt(0)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-semibold text-foreground truncate">
                              {m.email}
                            </p>
                            {m.user_id ? (
                              <span
                                className="w-1.5 h-1.5 rounded-full bg-brand shadow-[0_0_8px_rgba(79,30,123,0.5)]"
                                title="Active Session"
                              />
                            ) : (
                              <span
                                className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse"
                                title="Pending Invite"
                              />
                            )}
                          </div>
                          <div className="flex items-center gap-2 mt-1">
                            <roleInfo.icon className={cn("w-3 h-3", roleInfo.color)} />
                            <p className="wl-label text-muted font-bold">{roleInfo.label}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-4">
                          <div className="text-right hidden sm:block">
                            <p
                              className={cn(
                                "wl-label font-black mb-0.5",
                                m.user_id ? "text-brand" : "text-rose-500",
                              )}
                            >
                              {m.user_id ? "Authenticated" : "Pending Invite"}
                            </p>
                            <p className="wl-micro-meta--muted uppercase">
                              Joined {new Date(m.created_at).toLocaleDateString()}
                            </p>
                          </div>
                          <ShadButton
                            onClick={() => onRemove(m.id)}
                            variant="outline"
                            className="w-9 h-9 rounded-md border border-input flex items-center justify-center text-muted hover:text-rose-500 hover:border-rose-500/30 transition-all p-0"
                            title="Revoke Access"
                          >
                            <Trash2 className="w-4 h-4" />
                          </ShadButton>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        </Panel>
      </div>

      <div className="space-y-3">
        <Panel title="RBAC Policy" hint="PERMISSIONS" icon={Shield} scroll>
          <div className="space-y-3">
            {[
              {
                label: "Owner",
                role: "Full Authority",
                desc: "Complete control over billing, legal, and tenant-wide settings.",
                color: "text-brand",
              },
              {
                label: "Admin",
                role: "Operational Lead",
                desc: "Can manage agents, carriers, and view all telemetry.",
                color: "text-brand",
              },
              {
                label: "Member",
                role: "Agent Operator",
                desc: "Access to specific agents and call logs for day-to-day work.",
                color: "text-foreground",
              },
              {
                label: "Auditor",
                role: "ReadOnly",
                desc: "Secure read-only access to audit logs and compliance ledgers.",
                color: "text-muted",
              },
            ].map((p) => (
              <div
                key={p.label}
                className="p-4 rounded-md wl-panel border border-white/8 space-y-1.5"
              >
                <div className="flex items-center justify-between">
                  <span className={cn("wl-label font-black", p.color)}>{p.label}</span>
                  <Shield className={cn("w-3.5 h-3.5", p.color)} />
                </div>
                <p className="text-xs font-bold text-foreground">{p.role}</p>
                <p className="wl-micro-meta--muted leading-relaxed">{p.desc}</p>
              </div>
            ))}
          </div>
        </Panel>

        <div className="p-4 rounded-md bg-rose-500/5 border border-rose-500/10">
          <div className="flex gap-3">
            <KeyRound className="w-4 h-4 text-rose-600 shrink-0" />
            <div className="space-y-1">
              <p className="wl-label font-bold text-rose-600 uppercase tracking-wider">
                Security Notice
              </p>
              <p className="wl-micro-meta text-rose-600/70 leading-relaxed">
                Revoking access is immediate. All active sessions for the user will be terminated
                across the Wireline network.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
