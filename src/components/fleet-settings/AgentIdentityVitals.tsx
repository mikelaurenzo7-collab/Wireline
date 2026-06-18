/* eslint-disable @typescript-eslint/no-explicit-any -- agent row is an untyped snake_case API shape. */
/**
 * AgentIdentityVitals — the at-a-glance identity strip for the Agent Studio.
 *
 * A calm, inline summary (not a grid of boxes) of the focused agent's essence:
 * who answers, in what voice, on what brain, at what number. It anchors the
 * single-focus Studio canvas so the operator always sees the agent's identity
 * while they tune the sections below.
 */
import { Phone, AudioLines, Cpu, Radio } from "lucide-react";
import { PREMIUM_VOICES } from "../fleet/helpers";

function voiceLabel(agent: any): string {
  const id = agent?.voice_id;
  if (!id) return "Platform default";
  const match = (PREMIUM_VOICES as { id: string; name: string }[]).find((v) => v.id === id);
  return match?.name ?? "Custom voice";
}

function modelLabel(agent: any): string {
  if (!agent?.llm_model) return "Tenant default";
  // Strip a provider namespace (e.g. "x-ai/grok-3" → "grok-3") for a clean read.
  const m = String(agent.llm_model);
  return m.includes("/") ? m.split("/").pop()! : m;
}

function numberLabel(agent: any): string {
  return agent?.phone_number || agent?.phone || "Not assigned";
}

interface VitalProps {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  muted?: boolean;
}

function Vital({ icon: Icon, label, value, muted }: VitalProps) {
  return (
    <div className="flex items-center gap-2 min-w-0">
      <Icon className="w-3.5 h-3.5 text-brand/70 shrink-0" />
      <div className="min-w-0 leading-tight">
        <div className="wl-label text-foreground/55">{label}</div>
        <div
          className={`text-sm truncate ${muted ? "text-foreground/60 italic" : "text-foreground/85"}`}
        >
          {value}
        </div>
      </div>
    </div>
  );
}

export default function AgentIdentityVitals({ agent }: { agent: any }) {
  const voice = voiceLabel(agent);
  const model = modelLabel(agent);
  const number = numberLabel(agent);

  return (
    <div className="rounded-md border border-ink/[0.08] bg-ink/[0.015] px-3.5 py-2.5">
      <div className="flex items-stretch gap-3.5 overflow-x-auto [&>*:not(:first-child)]:border-l [&>*:not(:first-child)]:border-ink/[0.08] [&>*:not(:first-child)]:pl-3.5">
        <Vital icon={Radio} label="Channel" value={String(agent?.channel ?? "voice")} />
        <Vital icon={AudioLines} label="Voice" value={voice} muted={!agent?.voice_id} />
        <Vital icon={Cpu} label="Model" value={model} muted={!agent?.llm_model} />
        <Vital
          icon={Phone}
          label="Number"
          value={number}
          muted={!agent?.phone_number && !agent?.phone}
        />
      </div>
    </div>
  );
}
