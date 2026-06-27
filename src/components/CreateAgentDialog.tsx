import { type FormEvent, type KeyboardEvent, useEffect, useRef, useState } from "react";
import { Loader2, Phone, WandSparkles, X } from "lucide-react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Button, Input, NativeSelect, Textarea } from "./atoms";
import { FormField } from "./molecules";
import { AGENTS_CHANGED_EVENT, useAgents } from "../contexts/AgentsContext";
import { authFetch, safeJson } from "../lib/api";

const roles = [
  ["scheduler", "Scheduler"],
  ["receptionist", "Receptionist"],
  ["customer_service", "Support"],
  ["sales", "Sales"],
  ["custom", "Custom"],
] as const;

const voices = [
  ["", "Auto"],
  ["pNInz6obpgDQGcFmaJgB", "Adam - Deep"],
  ["VR6AewLTigWG4xSOukaG", "Arnold - Crisp"],
  ["21m00Tcm4TlvDq8ikWAM", "Rachel - Warm"],
  ["EXAVITQu4vr4xnSDxMaL", "Sarah - Gentle"],
] as const;

const personalities = ["Clear", "Warm", "Direct", "Polished", "Custom"] as const;

const CREATE_AGENT_INTAKE_COPY =
  "Name, role, voice, personality, and a starting brief. Short intake. Train next. Run immediately.";

type Role = (typeof roles)[number][0];
type Personality = (typeof personalities)[number];

export default function CreateAgentDialog({
  open,
  onClose,
  initialBrief = "",
  business = false,
}: {
  open: boolean;
  onClose: () => void;
  initialBrief?: string;
  business?: boolean;
}) {
  const navigate = useNavigate();
  const [, setParams] = useSearchParams();
  const { refresh } = useAgents();
  const [name, setName] = useState("");
  const [role, setRole] = useState<Role>(business ? "receptionist" : "scheduler");
  const [voiceId, setVoiceId] = useState("");
  const [personality, setPersonality] = useState<Personality>("Clear");
  const [customPersonality, setCustomPersonality] = useState("");
  const [brief, setBrief] = useState(initialBrief);
  const [provisionNumber, setProvisionNumber] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");
  const formRef = useRef<HTMLFormElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setRole(business ? "receptionist" : "scheduler");
    setProvisionNumber(false);
    setBrief((current) => current || initialBrief);
    const frame = requestAnimationFrame(() => nameRef.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, [business, initialBrief, open]);

  function close() {
    setParams(
      (current) => {
        const next = new URLSearchParams(current);
        next.delete("create");
        return next;
      },
      { replace: true },
    );
    onClose();
  }

  function onKeyDown(event: KeyboardEvent<HTMLFormElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      close();
    }
  }

  async function create(event: FormEvent) {
    event.preventDefault();
    if (!name.trim() || creating) return;
    setCreating(true);
    setError("");
    try {
      const response = await authFetch("/api/agents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          role,
          deferPhoneProvision: !provisionNumber,
          is_business_agent: business,
        }),
      });
      const body = (await safeJson(response)) as { id?: string; error?: string } | null;
      if (!response.ok || !body?.id) {
        setError(body?.error || "Agent could not be created.");
        return;
      }

      if (voiceId) {
        await authFetch(`/api/agent-config/${encodeURIComponent(body.id)}/voice`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ voiceId, provider: "11labs" }),
        });
      }

      const personalityText =
        personality === "Custom"
          ? customPersonality.trim()
          : `${personality}. Concise. Useful. Business-ready.`;
      if (personalityText) {
        await authFetch(`/api/agent-config/${encodeURIComponent(body.id)}/manual`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ type: "personality", content: personalityText }),
        });
      }

      const firstTraining = [
        `Role: ${role}.`,
        personalityText ? `Personality: ${personalityText}` : "",
        brief.trim() ? `First brief: ${brief.trim()}` : "",
      ]
        .filter(Boolean)
        .join("\n");

      if (firstTraining) {
        await authFetch("/api/train/extract", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ agentId: body.id, message: firstTraining }),
        });
      }

      window.dispatchEvent(new Event(AGENTS_CHANGED_EVENT));
      refresh();
      navigate(`/training?agent=${encodeURIComponent(body.id)}`, { replace: true });
      onClose();
    } catch {
      setError("Agent could not be created. Try again.");
    } finally {
      setCreating(false);
    }
  }

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[70] flex items-start justify-center overflow-y-auto bg-black/65 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-[max(1rem,env(safe-area-inset-top))]"
      role="presentation"
    >
      <form
        ref={formRef}
        onSubmit={create}
        onKeyDown={onKeyDown}
        className="studio-card my-auto max-h-[calc(100dvh-2rem)] w-full max-w-lg overflow-y-auto p-5 shadow-2xl sm:p-6"
        role="dialog"
        aria-modal="true"
        aria-labelledby="create-agent-title"
        aria-describedby="create-agent-description"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2
              id="create-agent-title"
              className="font-[var(--wireline-font-family-display)] text-2xl font-semibold leading-tight tracking-[-.04em] text-foreground"
            >
              New agent.
            </h2>
            <p id="create-agent-description" className="mt-1 text-sm text-muted-foreground">
              {CREATE_AGENT_INTAKE_COPY}
            </p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={close}
            aria-label="Close create agent dialog"
            className="shrink-0"
          >
            <X aria-hidden="true" size={16} />
          </Button>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <FormField label="Name" htmlFor="create-agent-name" required>
            <Input
              id="create-agent-name"
              ref={nameRef}
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Casey"
              autoComplete="off"
              required
            />
          </FormField>
          <FormField label="Role" htmlFor="create-agent-role">
            <NativeSelect
              id="create-agent-role"
              value={role}
              onChange={(event) => setRole(event.target.value as Role)}
            >
              {roles.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </NativeSelect>
          </FormField>
          <FormField label="Voice" htmlFor="create-agent-voice">
            <NativeSelect
              id="create-agent-voice"
              value={voiceId}
              onChange={(event) => setVoiceId(event.target.value)}
            >
              {voices.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </NativeSelect>
          </FormField>
          <FormField label="Personality" htmlFor="create-agent-personality">
            <NativeSelect
              id="create-agent-personality"
              value={personality}
              onChange={(event) => setPersonality(event.target.value as Personality)}
            >
              {personalities.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </NativeSelect>
          </FormField>
        </div>

        <label
          className={`mt-3 flex cursor-pointer items-center gap-3 rounded-[var(--radius-lg)] border p-3 text-left transition-colors ${
            provisionNumber
              ? "border-primary/35 bg-accent"
              : "border-border bg-background hover:bg-muted"
          }`}
        >
          <input
            type="checkbox"
            className="sr-only"
            checked={provisionNumber}
            onChange={(event) => setProvisionNumber(event.target.checked)}
          />
          <span className="grid size-9 shrink-0 place-items-center rounded-[var(--radius-md)] bg-card text-foreground">
            <Phone size={16} aria-hidden="true" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold text-foreground">Phone number</span>
            <span className="mt-0.5 block text-xs leading-5 text-muted-foreground">
              Twilio number. Usage may bill.
            </span>
          </span>
          <span className="shrink-0 rounded-full border border-border bg-card px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
            {provisionNumber ? "Now" : "Later"}
          </span>
        </label>

        {personality === "Custom" ? (
          <FormField
            className="mt-3"
            label="Custom personality"
            htmlFor="create-agent-custom-personality"
          >
            <Textarea
              id="create-agent-custom-personality"
              value={customPersonality}
              onChange={(event) => setCustomPersonality(event.target.value)}
              placeholder="Calm, concise, warm, and decisive."
              resize="none"
            />
          </FormField>
        ) : null}

        <FormField
          className="mt-3"
          label="First brief"
          htmlFor="create-agent-brief"
          description="Optional."
        >
          <Textarea
            id="create-agent-brief"
            value={brief}
            onChange={(event) => setBrief(event.target.value)}
            placeholder={
              business
                ? "Book consultations and hand off urgent callers."
                : "Handle appointment calls and text me what needs review."
            }
            resize="none"
          />
        </FormField>

        {error ? (
          <p className="mt-3 text-sm text-destructive" role="alert">
            {error}
          </p>
        ) : null}
        <Button
          type="submit"
          disabled={!name.trim() || creating}
          className="mt-5 w-full justify-center"
        >
          {creating ? (
            <Loader2 aria-hidden="true" className="size-4 animate-spin" />
          ) : (
            <WandSparkles aria-hidden="true" size={16} />
          )}
          <span className="sr-only">Create agent</span>
          Create and open Training
        </Button>
      </form>
    </div>
  );
}
