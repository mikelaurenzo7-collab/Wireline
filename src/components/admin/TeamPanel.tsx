import React, { useState } from "react";
import {
  KeyRound,
  Trash2,
  Mail,
  Shield,
  User,
  Plus,
  Loader2,
  ShieldCheck,
  Globe,
  Fingerprint,
  Lock,
} from "lucide-react";
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
  last_active?: string;
  location?: string;
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
    { id: "admin", label: "Admin", icon: ShieldCheck, color: "text-brand", bg: "bg-brand/10" },
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
    <div className="h-full grid grid-cols-1 xl:grid-cols-3 gap-4 min-h-0 scroll-viewport pb-6">
      <div className="xl:col-span-2 space-y-4">
        {/* Enterprise Security Posture Widget */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="p-4 rounded-md wl-panel border border-brand/20 bg-brand/5 relative overflow-hidden group">
            <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
              <ShieldCheck className="w-16 h-16 text-brand" />
            </div>
            <div className="flex items-center gap-2 wl-label text-brand mb-2">
              <Lock className="w-3.5 h-3.5" /> Platform Security
            </div>
            <div className="flex items-baseline gap-2 mb-1">
              <span className="text-2xl font-display text-foreground">SOC 2</span>
              <span className="text-xs font-bold text-brand uppercase tracking-wider">
                Readiness
              </span>
            </div>
            <p className="wl-micro-meta--muted">Independent readiness work and audit planning.</p>
          </div>

          <div className="p-4 rounded-md wl-panel border border-white/10 bg-white/5">
            <div className="flex items-center gap-2 wl-label text-muted mb-2">
              <Fingerprint className="w-3.5 h-3.5" /> Identity & Access
            </div>
            <div className="flex items-baseline gap-2 mb-1">
              <span className="text-2xl font-display text-foreground">SSO</span>
              <span className="text-xs font-bold text-[var(--wireline-color-status-success)] uppercase tracking-wider">
                Supported
              </span>
            </div>
            <p className="wl-micro-meta--muted">Google and Microsoft sign-in with provider MFA.</p>
          </div>

          <div className="p-4 rounded-md wl-panel border border-white/10 bg-white/5">
            <div className="flex items-center gap-2 wl-label text-muted mb-2">
              <Globe className="w-3.5 h-3.5" /> Data Residency
            </div>
            <div className="flex items-baseline gap-2 mb-1">
              <span className="text-2xl font-display text-foreground">US-East</span>
            </div>
            <p className="wl-micro-meta--muted">Tenant-scoped access controls enforced.</p>
          </div>
        </div>

        <Panel title="Enterprise Roster & Access" hint="ACCESS CONTROL" icon={KeyRound} scroll>
          <div className="space-y-6">
            <div className="flex flex-col md:flex-row gap-3 p-5 rounded-md wl-panel border border-brand/20 bg-brand/5 shadow-[var(--wireline-elevation-wirelineRing)]">
              <div className="flex-1 space-y-2">
                <label className="wl-label font-bold text-brand ml-1">Provision New Seat</label>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-brand/50" />
                    <Input
                      type="email"
                      autoComplete="email"
                      autoCapitalize="none"
                      spellCheck={false}
                      inputMode="email"
                      placeholder="colleague@enterprise.com"
                      className="w-full pl-10 pr-4 py-2.5 border-brand/20 outline-none focus-visible:ring-brand/40 text-sm transition-all h-auto shadow-sm"
                      value={inviteEmail}
                      onChange={(e) => setInviteEmail(e.target.value)}
                    />
                  </div>
                  <Select value={inviteRole} onValueChange={setInviteRole}>
                    <SelectTrigger
                      aria-label="Role"
                      className="w-36 px-4 py-2.5 border-brand/20 text-xs font-bold cursor-pointer h-auto shadow-sm"
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
                    className="bg-brand hover:bg-brand/90 text-primary-foreground flex items-center gap-2 disabled:opacity-50 shadow-md h-auto px-6 py-2.5"
                    onClick={handleInvite}
                  >
                    {isInviting ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Plus className="w-4 h-4" />
                    )}
                    <span className="font-bold tracking-wide">Provision</span>
                  </ShadButton>
                </div>
              </div>
            </div>

            <div className="space-y-1">
              <div className="app-section-title mb-4 px-1 flex justify-between items-center border-b border-border pb-2">
                <span className="text-foreground">Active Operational Roster</span>
                <span className="wl-micro-badge bg-surface-container text-muted">
                  {members.length} Provisioned
                </span>
              </div>

              <div className="grid grid-cols-1 gap-2">
                {members.length === 0 ? (
                  <div className="py-20 text-center wl-panel border border-dashed border-input rounded-md">
                    <User className="w-8 h-8 text-muted/50 mx-auto mb-3" />
                    <p className="text-xs text-muted uppercase tracking-widest font-bold">
                      No identities provisioned
                    </p>
                    <p className="wl-micro-meta--muted mt-1">
                      Provision your first enterprise seat to collaborate.
                    </p>
                  </div>
                ) : (
                  members.map((m) => {
                    const roleInfo = roles.find((r) => r.id === m.role) || roles[2];
                    return (
                      <div
                        key={m.id}
                        className="group flex items-center gap-4 p-4 rounded-md wl-panel border border-border hover:border-brand/30 transition-all hover:bg-white/5 hover:shadow-sm"
                      >
                        <div
                          className={cn(
                            "w-12 h-12 rounded-lg flex items-center justify-center text-sm font-black uppercase shrink-0 transition-transform group-hover:scale-105 border",
                            roleInfo.bg,
                            roleInfo.color,
                            roleInfo.id === "owner" || roleInfo.id === "admin"
                              ? "border-brand/20"
                              : "border-white/10",
                          )}
                        >
                          {m.email.charAt(0)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="text-[length:var(--wireline-typography-caption-size)] font-bold text-foreground truncate">
                              {m.email}
                            </p>
                            {m.user_id ? (
                              <span
                                className="w-1.5 h-1.5 rounded-full bg-[var(--wireline-color-status-success)] shadow-[0_0_8px_color-mix(in_srgb,var(--wireline-color-status-success)_50%,transparent)]"
                                title="Active Session Verified"
                              />
                            ) : (
                              <span
                                className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse"
                                title="Pending Provisioning"
                              />
                            )}
                          </div>
                          <div className="flex items-center gap-3 mt-1.5">
                            <div
                              className={cn(
                                "flex items-center gap-1.5 px-2 py-0.5 rounded-sm border",
                                roleInfo.bg,
                                roleInfo.id === "owner" || roleInfo.id === "admin"
                                  ? "border-brand/10"
                                  : "border-white/0",
                              )}
                            >
                              <roleInfo.icon className={cn("w-3 h-3", roleInfo.color)} />
                              <p
                                className={cn(
                                  "text-[length:var(--wireline-typography-overline-size)] uppercase tracking-wider font-bold",
                                  roleInfo.color,
                                )}
                              >
                                {roleInfo.label}
                              </p>
                            </div>
                            {m.location && (
                              <p className="wl-micro-meta--muted flex items-center gap-1">
                                <Globe className="w-3 h-3" /> {m.location}
                              </p>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-5">
                          <div className="text-right hidden sm:block">
                            <p
                              className={cn(
                                "wl-label font-black mb-0.5",
                                m.user_id
                                  ? "text-[var(--wireline-color-status-success)]"
                                  : "text-rose-500",
                              )}
                            >
                              {m.user_id ? "Session Verified" : "Pending Acceptance"}
                            </p>
                            <p className="wl-micro-meta--muted font-mono">
                              ID: {m.id.split("-")[0].toUpperCase()}
                            </p>
                          </div>
                          <ShadButton
                            onClick={() => onRemove(m.id)}
                            variant="outline"
                            className="w-10 h-10 rounded-md border border-input flex items-center justify-center text-muted hover:text-rose-500 hover:border-rose-500/40 hover:bg-rose-500/5 transition-all p-0"
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

      <div className="space-y-4">
        <Panel title="Roles & Permissions" hint="PERMISSIONS" icon={Shield} scroll>
          <div className="space-y-3">
            {[
              {
                label: "Owner",
                role: "Full Authority",
                desc: "Complete control over billing, legal, and workspace-wide settings.",
                color: "text-brand",
                bg: "bg-brand/5 border-brand/20",
              },
              {
                label: "Admin",
                role: "Operational Lead",
                desc: "Can manage agents, carriers, and activity views.",
                color: "text-brand",
                bg: "bg-brand/5 border-brand/10",
              },
              {
                label: "Member",
                role: "Agent Account Holder",
                desc: "Access to specific agents and call logs for day-to-day work.",
                color: "text-foreground",
                bg: "bg-surface-container/50 border-white/10",
              },
              {
                label: "Auditor",
                role: "Read Only",
                desc: "Secure read-only access to audit logs and compliance ledgers.",
                color: "text-muted",
                bg: "bg-surface-container/50 border-white/10",
              },
            ].map((p) => (
              <div
                key={p.label}
                className={cn(
                  "p-4 rounded-md wl-panel border space-y-2 transition-all hover:border-brand/30",
                  p.bg,
                )}
              >
                <div className="flex items-center justify-between">
                  <span
                    className={cn(
                      "text-[length:var(--wireline-typography-overline-size)] uppercase tracking-widest font-black",
                      p.color,
                    )}
                  >
                    {p.label}
                  </span>
                  <Shield className={cn("w-4 h-4", p.color)} />
                </div>
                <p className="text-sm font-bold text-foreground">{p.role}</p>
                <p className="wl-micro-meta--muted leading-relaxed">{p.desc}</p>
              </div>
            ))}
          </div>
        </Panel>

        <div className="p-5 rounded-md bg-rose-500/5 border border-rose-500/20 shadow-[var(--wireline-elevation-card)] relative overflow-hidden">
          <div className="absolute -right-4 -bottom-4 opacity-5">
            <Lock className="w-24 h-24 text-rose-500" />
          </div>
          <div className="flex gap-3 relative z-10">
            <KeyRound className="w-5 h-5 text-rose-500 shrink-0 mt-0.5" />
            <div className="space-y-1.5">
              <p className="text-[length:var(--wireline-typography-overline-size)] font-black text-rose-500 uppercase tracking-widest">
                Access Revocation
              </p>
              <p className="text-[length:var(--wireline-typography-caption-size)] text-rose-600/80 leading-relaxed font-medium">
                Revoking access signs that person out of Wireline everywhere within seconds and
                closes any live sessions they have open.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
