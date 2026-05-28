import React, { useState } from "react";
import { KeyRound, Trash2, Mail, Shield, User, Plus, Loader2 } from "lucide-react";
import { cn } from "../../lib/utils";
import { Panel } from "../PageShell";

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
    { id: "admin", label: "Admin", icon: Shield, color: "text-brand-3", bg: "bg-brand-3/10" },
    { id: "member", label: "Member", icon: User, color: "text-ink", bg: "bg-black/5" },
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
    <div className="h-full grid grid-cols-1 xl:grid-cols-3 gap-3 min-h-0 overflow-y-auto scrollbar-hide pb-6">
      <div className="xl:col-span-2 space-y-3">
        <Panel title="Team Management" hint="ACCESS CONTROL" icon={KeyRound} scroll>
          <div className="space-y-6">
            <div className="flex flex-col md:flex-row gap-3 p-4 rounded-2xl glass border border-white/10 bg-brand/5">
              <div className="flex-1 space-y-1.5">
                <label className="text-[10px] uppercase tracking-[0.3em] text-muted font-bold ml-1">
                  Invite New Member
                </label>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted" />
                    <input
                      type="email"
                      autoComplete="email"
                      autoCapitalize="none"
                      spellCheck={false}
                      inputMode="email"
                      placeholder="colleague@business.com"
                      className="w-full pl-9 pr-4 py-2.5 bg-white/50 border border-black/10 rounded-xl outline-none focus:border-brand/50 text-sm transition-all"
                      value={inviteEmail}
                      onChange={(e) => setInviteEmail(e.target.value)}
                    />
                  </div>
                  <select
                    aria-label="Role"
                    className="w-32 px-3 py-2.5 bg-white/50 border border-black/10 rounded-xl outline-none focus:border-brand/50 text-xs appearance-none cursor-pointer"
                    value={inviteRole}
                    onChange={(e) => setInviteRole(e.target.value)}
                  >
                    <option value="member">Member</option>
                    <option value="admin">Admin</option>
                    <option value="owner">Owner</option>
                    <option value="auditor">Auditor</option>
                  </select>
                  <button
                    disabled={isInviting || !inviteEmail}
                    className="brutal-btn !py-2 !px-6 flex items-center gap-2 disabled:opacity-50"
                    onClick={handleInvite}
                  >
                    {isInviting ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Plus className="w-3.5 h-3.5" />
                    )}
                    <span>Invite</span>
                  </button>
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
                  <div className="py-20 text-center glass border border-dashed border-black/10 rounded-2xl">
                    <User className="w-8 h-8 text-muted/70 mx-auto mb-3" />
                    <p className="text-xs text-muted uppercase tracking-widest font-medium">
                      No team members found
                    </p>
                    <p className="text-[10px] text-muted/70 mt-1">
                      Invite your first colleague to begin collaborating.
                    </p>
                  </div>
                ) : (
                  members.map((m) => {
                    const roleInfo = roles.find((r) => r.id === m.role) || roles[2];
                    return (
                      <div
                        key={m.id}
                        className="group flex items-center gap-4 p-4 rounded-2xl glass border border-white/5 hover:border-brand/20 transition-all hover:bg-white/5"
                      >
                        <div
                          className={cn(
                            "w-10 h-10 rounded-xl flex items-center justify-center text-xs font-bold uppercase shrink-0 transition-transform group-hover:scale-105",
                            roleInfo.bg,
                            roleInfo.color,
                          )}
                        >
                          {m.email.charAt(0)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-semibold text-ink truncate">{m.email}</p>
                            {m.user_id ? (
                              <span
                                className="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_8px_#10b981]"
                                title="Active Session"
                              />
                            ) : (
                              <span
                                className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse"
                                title="Pending Invite"
                              />
                            )}
                          </div>
                          <div className="flex items-center gap-2 mt-1">
                            <roleInfo.icon className={cn("w-3 h-3", roleInfo.color)} />
                            <p className="text-[10px] uppercase tracking-wider text-muted font-bold">
                              {roleInfo.label}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-4">
                          <div className="text-right hidden sm:block">
                            <p
                              className={cn(
                                "text-[9px] uppercase tracking-widest font-black mb-0.5",
                                m.user_id ? "text-emerald-600" : "text-amber-600",
                              )}
                            >
                              {m.user_id ? "Authenticated" : "Pending Invite"}
                            </p>
                            <p className="text-[8px] text-muted uppercase">
                              Joined {new Date(m.created_at).toLocaleDateString()}
                            </p>
                          </div>
                          <button
                            onClick={() => onRemove(m.id)}
                            className="w-9 h-9 rounded-xl glass border border-white/10 flex items-center justify-center text-muted hover:text-rose-500 hover:border-rose-500/30 transition-all"
                            title="Revoke Access"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
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
                color: "text-brand-3",
              },
              {
                label: "Member",
                role: "Agent Operator",
                desc: "Access to specific agents and call logs for day-to-day work.",
                color: "text-ink",
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
                className="p-4 rounded-2xl glass border border-white/8 space-y-1.5"
              >
                <div className="flex items-center justify-between">
                  <span
                    className={cn("text-[10px] uppercase tracking-[0.3em] font-black", p.color)}
                  >
                    {p.label}
                  </span>
                  <Shield className={cn("w-3.5 h-3.5", p.color)} />
                </div>
                <p className="text-xs font-bold text-ink">{p.role}</p>
                <p className="text-[10px] text-muted leading-relaxed">{p.desc}</p>
              </div>
            ))}
          </div>
        </Panel>

        <div className="p-4 rounded-2xl bg-amber-500/5 border border-amber-500/10">
          <div className="flex gap-3">
            <KeyRound className="w-4 h-4 text-amber-600 shrink-0" />
            <div className="space-y-1">
              <p className="text-[10px] font-bold text-amber-700 uppercase tracking-wider">
                Security Notice
              </p>
              <p className="text-[10px] text-amber-700/70 leading-relaxed">
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
