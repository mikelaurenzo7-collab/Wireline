/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * CreateAgentSection — Form for deploying new agents.
 * Extracted from the monolithic AssistantSettings.tsx during the 2026 audit.
 */
import { useState } from "react";
import { Plus, Loader2, Sparkles, Briefcase } from "lucide-react";
import { motion } from "motion/react";
import { AGENT_ROLES, type RoleValue } from "../fleet/helpers";
import { ClaudeRecipeButton } from "../ClaudeRecipes";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/shadcn/Select";
import { ShadButton } from "../ui/shadcn/ShadButton";
import { Input } from "../ui/shadcn/Input";
import { SegmentStrip } from "../ui/SegmentStrip";
import { PRODUCT_POSTURE } from "../../lib/product-copy";

interface Props {
  isCreating: boolean;
  agents: any[];
  subscription: { status: string; max_agents: number | null };
  /** Personal accounts create a single agent without roster or seed language. */
  isPersonal?: boolean;
  onCreate: (data: { id: string; name: string; channel: string; role: RoleValue }) => void;
  onSeedAssistant: () => void;
}

export default function CreateAgentSection({
  isCreating,
  agents: _agents,
  subscription: _subscription,
  isPersonal = false,
  onCreate,
  onSeedAssistant,
}: Props) {
  const [newAgentName, setNewAgentName] = useState("");
  const [newAgentId, setNewAgentId] = useState("");
  const [newAgentChannel, setNewAgentChannel] = useState("voice");
  const [newAgentRole, setNewAgentRole] = useState<RoleValue>("customer_service");

  const handleCreate = () => {
    if (!newAgentId || !newAgentName) return;
    onCreate({ id: newAgentId, name: newAgentName, channel: newAgentChannel, role: newAgentRole });
    setNewAgentName("");
    setNewAgentId("");
  };

  return (
    <motion.div layout className="pt-4 mt-4 border-t border-white/8 border-dashed space-y-3">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h3 className="wl-label text-foreground normal-case tracking-[0.18em]">
          {isPersonal ? PRODUCT_POSTURE.personal.createCta : "Add to roster"}
        </h3>
        <div className="flex items-center gap-1.5">
          <ClaudeRecipeButton recipe="agent-wire" label="Wire" variant="ghost" />
          {!isPersonal && (
            <ShadButton
              type="button"
              variant="outline"
              size="sm"
              disableAnimations
              onClick={onSeedAssistant}
              className="rounded-full wl-label normal-case tracking-[0.18em] touch-press hover:scale-[1.02]"
            >
              <Sparkles className="w-3 h-3" /> Seed
            </ShadButton>
          )}
        </div>
      </div>

      <SegmentStrip
        aria-label="Channel"
        variant="soft"
        fullWidth
        className="w-full wl-panel border border-white/10"
        options={[
          { value: "voice", label: "Voice" },
          { value: "email", label: "Email" },
        ]}
        value={newAgentChannel}
        onChange={setNewAgentChannel}
      />

      <div className="space-y-3">
        <div className="space-y-1.5">
          <label className="wl-label-muted flex items-center gap-1.5">
            <Briefcase className="w-2.5 h-2.5 text-brand" />{" "}
            {isPersonal ? "What it handles" : "Role"}
          </label>
          <div className="relative">
            <Select value={newAgentRole} onValueChange={(v) => setNewAgentRole(v as RoleValue)}>
              <SelectTrigger
                aria-label="Business role"
                className="w-full text-xs bg-[var(--wireline-color-surface-recessed)] border border-[var(--wireline-color-border-soft)] rounded-md pl-3 pr-7 py-2 text-foreground h-auto"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {AGENT_ROLES.map((r) => (
                  <SelectItem key={r.value} value={r.value}>
                    {r.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <p className="chrome-subtle leading-relaxed text-pretty">
            {AGENT_ROLES.find((r) => r.value === newAgentRole)?.description}
          </p>
        </div>
        <div className="space-y-1.5">
          <label className="wl-label-muted">
            ID{" "}
            <span className="text-foreground/55 normal-case tracking-normal">
              (lowercase, no spaces)
            </span>
          </label>
          <Input
            type="text"
            placeholder="e.g. sales-bot-1"
            value={newAgentId}
            onChange={(e) => setNewAgentId(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))}
            className="w-full text-sm bg-[var(--wireline-color-surface-recessed)] border border-[var(--wireline-color-border-soft)] rounded-md px-3 py-2 outline-none focus:border-brand/50 text-foreground placeholder:text-foreground/55 font-mono"
          />
        </div>
        <div className="space-y-1.5">
          <label className="wl-label-muted">
            Name{" "}
            <span className="text-foreground/55 normal-case tracking-normal">
              (what callers will hear)
            </span>
          </label>
          <Input
            type="text"
            placeholder="e.g. Sophie"
            value={newAgentName}
            onChange={(e) => setNewAgentName(e.target.value)}
            className="w-full text-sm bg-[var(--wireline-color-surface-recessed)] border border-[var(--wireline-color-border-soft)] rounded-md px-3 py-2 outline-none focus:border-brand/50 text-foreground placeholder:text-foreground/55"
          />
        </div>
      </div>

      <ShadButton
        type="button"
        variant="editorial"
        disableAnimations
        onClick={handleCreate}
        disabled={isCreating || !newAgentId || !newAgentName}
        className="w-full min-h-10 py-2.5 text-[var(--wireline-typography-overline-size)] tracking-[0.3em] uppercase touch-press-deep hover:scale-[1.01] hover:shadow-md hover:shadow-brand/10"
      >
        {isCreating ? (
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
        ) : (
          <Plus className="w-3.5 h-3.5" />
        )}
        {isPersonal ? "Create personal agent" : "Create agent"}
      </ShadButton>
    </motion.div>
  );
}
