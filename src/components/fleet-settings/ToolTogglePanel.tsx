import React from "react";
import { motion } from "motion/react";
import { MessageCircle, Video } from "lucide-react";
import { cn } from "../../lib/utils";
import { ShadButton } from "../ui/shadcn/ShadButton";
import { Input } from "../ui/shadcn/Input";

interface ToolTogglePanelProps {
  selectedAgent: {
    channels?: string[];
    autonomy_level?: string;
    slack_channel_id?: string | null;
    auto_zoom_link?: boolean;
  };
  updateAgentMeta: (updates: Record<string, unknown>) => void;
}

export default function ToolTogglePanel({ selectedAgent, updateAgentMeta }: ToolTogglePanelProps) {
  return (
    <div className="rounded-md wl-panel border border-border p-3 space-y-3">
      <div className="rounded-md border border-white/8 dark:border-white/8 bg-card/80 dark:bg-white/3 p-3 space-y-3">
        <div className="wl-label text-brand/70">Channels</div>
        <div className="flex flex-wrap gap-2">
          {(["voice", "email", "sms"] as const).map((ch) => {
            const channels: string[] = selectedAgent.channels || ["voice"];
            const active = channels.includes(ch);
            return (
              <ShadButton
                key={ch}
                type="button"
                variant={active ? "secondary" : "outline"}
                size="sm"
                disableAnimations
                onClick={() => {
                  const next = active ? channels.filter((c) => c !== ch) : [...channels, ch];
                  if (next.length === 0) return;
                  updateAgentMeta({ channels: next });
                }}
                className={cn(
                  "rounded-full wl-micro-meta font-medium capitalize touch-press hover:scale-[1.02]",
                  active
                    ? "bg-brand/15 border-brand/40 text-brand"
                    : "text-muted hover:border-brand/20",
                )}
              >
                {ch}
              </ShadButton>
            );
          })}
        </div>

        <div className="wl-label text-brand/70 pt-2">Autonomy Level</div>
        <div className="flex flex-wrap gap-2">
          {(
            [
              { val: "inherit", label: "Inherit" },
              { val: "auto", label: "Full Auto" },
              { val: "supervised", label: "Supervised" },
              { val: "draft", label: "Draft Only" },
            ] as const
          ).map(({ val, label }) => {
            const current = selectedAgent.autonomy_level || "inherit";
            return (
              <ShadButton
                key={val}
                type="button"
                variant={current === val ? "secondary" : "outline"}
                size="sm"
                disableAnimations
                onClick={() => updateAgentMeta({ autonomy_level: val })}
                className={cn(
                  "rounded-full wl-micro-meta font-medium touch-press hover:scale-[1.02]",
                  current === val
                    ? "bg-brand/15 border-brand/40 text-brand"
                    : "text-muted hover:border-brand/20",
                )}
              >
                {label}
              </ShadButton>
            );
          })}
        </div>
        <p className="wl-micro-meta leading-relaxed">
          Inherit uses the tenant-wide setting. Full Auto executes actions immediately. Supervised
          queues for approval on high-risk actions. Draft Only always requires operator sign-off.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2 border-t border-white/8 dark:border-white/8">
          <div className="space-y-1.5">
            <label className="wl-label text-foreground/55 flex items-center gap-1.5">
              <MessageCircle className="w-2.5 h-2.5 text-brand" /> Slack channel
            </label>
            <Input
              type="text"
              value={selectedAgent.slack_channel_id || ""}
              onChange={(e) => updateAgentMeta({ slack_channel_id: e.target.value.trim() || null })}
              placeholder="#fleet-alerts"
              className="w-full text-xs bg-black/5 border border-white/10 rounded-md px-3 py-2 text-foreground font-mono"
            />
          </div>
          <div className="rounded-md border border-white/8 dark:border-white/8 bg-card/80 dark:bg-white/3 p-3 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="wl-label text-brand/70 flex items-center gap-1.5">
                <Video className="w-3 h-3" /> Auto Zoom link
              </p>
              <p className="chrome-subtle mt-1 text-pretty">
                Attach meeting links when scheduling.
              </p>
            </div>
            <ShadButton
              type="button"
              variant="ghost"
              size="sm"
              disableAnimations
              onClick={() =>
                updateAgentMeta({
                  auto_zoom_link: !selectedAgent.auto_zoom_link,
                })
              }
              className={cn(
                "shrink-0 w-10 h-5 rounded-full border p-0 min-w-10 touch-press hover:scale-[1.05]",
                selectedAgent.auto_zoom_link
                  ? "bg-brand/30 border-brand/50"
                  : "bg-muted/10 border-border",
              )}
              aria-label="Toggle auto Zoom link"
            >
              <motion.div
                animate={{ x: selectedAgent.auto_zoom_link ? 18 : 0 }}
                className={cn(
                  "w-4 h-4 rounded-full",
                  selectedAgent.auto_zoom_link ? "bg-brand" : "bg-muted/60",
                )}
              />
            </ShadButton>
          </div>
        </div>
      </div>
    </div>
  );
}
