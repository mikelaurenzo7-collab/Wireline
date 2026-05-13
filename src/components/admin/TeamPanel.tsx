import React, { useState } from "react";
import { KeyRound, Trash2, Clock } from "lucide-react";
import { cn } from "../../lib/utils";
import { formatDateTime } from "../../lib/utils";

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

  return (
    <div className="flex flex-col gap-6">
      <div className="p-6 rounded-2xl glass border border-white/10">
        <h3 className="text-[9px] uppercase tracking-[0.4em] text-muted mb-6 flex items-center gap-2">
          <KeyRound className="w-3.5 h-3.5" /> Organization Access
        </h3>
        
        <div className="flex flex-col md:flex-row gap-3 mb-8">
          <input 
            type="email" 
            placeholder="colleague@business.com" 
            className="flex-1 input-field"
            value={inviteEmail}
            onChange={e => setInviteEmail(e.target.value)}
          />
          <select 
            className="md:w-36 input-field"
            value={inviteRole}
            onChange={e => setInviteRole(e.target.value)}
          >
            <option value="member">Member</option>
            <option value="admin">Admin</option>
            <option value="owner">Owner</option>
          </select>
          <button 
            className="brutal-btn"
            onClick={() => {
              if (inviteEmail) {
                onInvite(inviteEmail, inviteRole);
                setInviteEmail("");
              }
            }}
          >
            Invite
          </button>
        </div>

        <div className="space-y-1">
          <p className="text-[9px] uppercase tracking-[0.4em] text-muted mb-2 px-1">Active Members</p>
          {members.length === 0 ? (
            <div className="p-12 text-center border border-dashed border-black/10 rounded-xl">
              <p className="text-xs text-muted">No team members invited yet.</p>
            </div>
          ) : (
            members.map(m => (
              <div key={m.id} className="group flex items-center gap-4 p-3 hover:bg-black/5 rounded-xl transition-all">
                <div className="w-8 h-8 rounded-full bg-brand/10 flex items-center justify-center text-[10px] font-bold text-brand uppercase">
                  {m.email.charAt(0)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-ink truncate">{m.email}</p>
                  <p className="text-[9px] uppercase tracking-wider text-muted">{m.role}</p>
                </div>
                <div className="flex items-center gap-3">
                  <span className={cn(
                    "text-[8px] uppercase tracking-widest font-bold",
                    m.user_id ? "text-emerald-500" : "text-amber-500"
                  )}>
                    {m.user_id ? "Active" : "Invited"}
                  </span>
                  <button 
                    onClick={() => onRemove(m.id)}
                    className="p-2 text-muted hover:text-rose-500 opacity-0 group-hover:opacity-100 transition-all"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      <div className="p-6 rounded-2xl glass border border-white/10">
        <h3 className="text-[9px] uppercase tracking-[0.4em] text-muted mb-4">Organizational Permissions</h3>
        <div className="space-y-4">
          {[
            { label: "Admin Access", desc: "Can manage billing, carriers, and agents." },
            { label: "Member Access", desc: "Can view dashboards and manage their own agents." },
            { label: "Audit Only", desc: "Read-only access to call logs and insights." },
          ].map(p => (
            <div key={p.label} className="flex gap-4">
              <KeyRound className="w-4 h-4 text-brand shrink-0" />
              <div>
                <p className="text-[11px] font-bold text-ink">{p.label}</p>
                <p className="text-[10px] text-muted">{p.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
