import { useEffect, useMemo, useState } from "react";
import { Check, Plus, Smartphone } from "lucide-react";

import { Button } from "../components/atoms";
import { StatusNotice } from "../components/molecules";
import SettingsTabs from "../components/settings/SettingsTabs";
import WorkspaceShell from "../components/WorkspaceShell";
import { useAgents } from "../contexts/AgentsContext";
import { authFetch } from "../lib/api";

type PhoneNumberRecord = {
  id: string;
  phone_number: string;
  agent_id?: string | null;
  campaign_label?: string | null;
  created_at?: string | null;
};

function formatPhone(value?: string | null) {
  if (!value) return "No number yet";
  const digits = value.replace(/\D/g, "");
  const domestic = digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : digits;
  if (domestic.length !== 10) return value;
  return `(${domestic.slice(0, 3)}) ${domestic.slice(3, 6)}-${domestic.slice(6)}`;
}

function formatProvisionedDate(value?: string | null) {
  if (!value) return "Ready when provisioned";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Provisioned";
  return `Provisioned ${date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}`;
}

export default function PhoneSettings() {
  const { agents } = useAgents();
  const [numbers, setNumbers] = useState<PhoneNumberRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const activeNumber = numbers[0] || null;
  const attachedAgent = useMemo(
    () => agents.find((agent) => agent.id === activeNumber?.agent_id),
    [activeNumber?.agent_id, agents],
  );

  async function loadNumbers() {
    setLoading(true);
    setError(null);
    try {
      const response = await authFetch("/api/phone-numbers");
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body?.error || "Phone numbers unavailable.");
      setNumbers(Array.isArray(body?.numbers) ? body.numbers : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Phone numbers unavailable.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadNumbers();
  }, []);

  async function provisionNumber() {
    if (working) return;
    setWorking(true);
    setMessage(null);
    setError(null);
    try {
      const response = await authFetch("/api/phone-numbers/provision", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agent_id: agents[0]?.id }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || body?.ok === false) {
        throw new Error(body?.error || "Could not provision a number.");
      }
      setMessage(body?.reused ? "Existing number attached." : "Dedicated number provisioned.");
      await loadNumbers();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not provision a number.");
    } finally {
      setWorking(false);
    }
  }

  const lineMeta = activeNumber
    ? `${attachedAgent?.name || "Wireline agent"} · ${formatProvisionedDate(activeNumber.created_at)}`
    : loading
      ? "Loading carrier status"
      : "Provision a dedicated line in one click";

  return (
    <WorkspaceShell eyebrow="Settings" title="Phone & Carrier" contentClassName="pt-1 pb-8">
      <div className="mx-auto flex w-full max-w-[1080px] flex-col pb-10">
        <SettingsTabs />

        <div className="grid gap-4 xl:grid-cols-[minmax(420px,0.72fr)_minmax(320px,0.45fr)]">
          <section className="rounded-2xl border border-primary/20 bg-primary p-5 text-primary-foreground shadow-[var(--wireline-elevation-md)] sm:p-7">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-primary-foreground/65">
                  Your Wireline number
                </p>
                <h2 className="mt-4 truncate font-[var(--wireline-font-family-display)] text-[32px] font-normal leading-none tracking-[-0.035em] sm:text-[40px]">
                  {formatPhone(activeNumber?.phone_number)}
                </h2>
                <p className="mt-3 text-sm text-primary-foreground/78">{lineMeta}</p>
              </div>
              <span className="inline-flex min-h-[32px] shrink-0 items-center gap-1.5 rounded-lg border border-primary-foreground/20 px-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-primary-foreground/75">
                <span className="size-1.5 rounded-full bg-primary-foreground/70" />
                {activeNumber ? "Active" : "Setup"}
              </span>
            </div>
            {!activeNumber ? (
              <Button
                type="button"
                variant="secondary"
                className="mt-6 bg-primary-foreground text-primary hover:bg-primary-foreground/90"
                disabled={working || loading}
                onClick={provisionNumber}
              >
                <Plus size={16} aria-hidden="true" />
                {working ? "Provisioning..." : "Provision number"}
              </Button>
            ) : null}
          </section>

          <section className="studio-card p-5 sm:p-6">
            <p className="wl-overline">Provisioning</p>
            <h2 className="mt-3 font-[var(--wireline-font-family-display)] text-2xl font-normal tracking-[-.025em] text-foreground">
              Number first. Route cleanly.
            </h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              Wireline can provision a dedicated line, attach it to an agent, and keep caller history tied to the workspace.
            </p>
            <div className="mt-5 grid gap-2 text-sm">
              {["Dedicated line for inbound calls", "Agent-aware routing and SMS follow-up", "Ready for paid number add-ons"].map((item) => (
                <div key={item} className="flex items-center gap-2 rounded-xl bg-muted/50 px-3 py-2">
                  <Check size={14} className="text-primary" aria-hidden="true" />
                  <span>{item}</span>
                </div>
              ))}
            </div>
          </section>
        </div>

        <div className="mt-5 grid gap-4 xl:grid-cols-[minmax(420px,0.72fr)_minmax(320px,0.45fr)]">
          <section className="studio-card p-5 sm:p-6">
            <p className="wl-overline">Call forwarding</p>
            <div className="mt-4 grid gap-2">
              {[
                ["Unknown callers", "Agent answers, identifies intent, takes a message or patches through.", "Agent", true],
                ["Contacts", "Ring your phone first. Agent picks up if you miss it.", "Ring first", false],
                ["VIP list", "Always rings through. Never intercepted by agent.", "Direct", false],
              ].map(([title, detail, badge, active]) => (
                <div
                  key={String(title)}
                  className={`flex items-center justify-between gap-4 rounded-xl border px-4 py-3 ${
                    active ? "border-primary/20 bg-primary/5" : "border-border bg-background"
                  }`}
                >
                  <div className="min-w-0">
                    <p className="text-sm font-semibold tracking-[-.01em] text-foreground">{title}</p>
                    <p className="mt-0.5 truncate text-xs text-muted-foreground">{detail}</p>
                  </div>
                  <span className="shrink-0 rounded-md bg-muted px-2 py-1 font-mono text-[10px] uppercase tracking-[0.09em] text-muted-foreground">
                    {badge}
                  </span>
                </div>
              ))}
            </div>
          </section>

          <section className="studio-card p-5 sm:p-6">
            <div className="flex items-center justify-between gap-3">
              <p className="wl-overline">VIP contacts</p>
              <Button type="button" variant="secondary" size="sm">
                <Plus size={14} aria-hidden="true" />
                Add
              </Button>
            </div>
            <div className="mt-4 grid gap-2">
              {["Owner", "Family", "Priority client"].map((name) => (
                <div key={name} className="flex items-center justify-between gap-3 rounded-lg bg-muted/45 px-3 py-2 text-sm">
                  <span className="font-semibold text-foreground">{name}</span>
                  <span className="font-mono text-[11px] text-muted-foreground">Ring through</span>
                </div>
              ))}
            </div>
          </section>
        </div>

        <section className="studio-card mt-5 p-5 sm:p-6">
          <p className="wl-overline">Connected devices</p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-primary/20 bg-primary/5 p-4">
              <div className="flex items-center gap-3">
                <span className="grid size-10 place-items-center rounded-lg bg-muted text-primary">
                  <Smartphone size={17} aria-hidden="true" />
                </span>
                <div>
                  <p className="text-sm font-semibold text-foreground">Mobile device</p>
                  <p className="text-xs text-muted-foreground">Wireline app · Shortcuts · CarPlay</p>
                </div>
              </div>
            </div>
            <button
              type="button"
              className="min-h-[88px] rounded-xl border border-dashed border-border bg-background p-4 text-center text-sm font-semibold text-muted-foreground transition-colors hover:border-primary/30 hover:bg-muted/40"
            >
              + Add device
              <span className="mt-1 block text-xs font-normal">Apple Watch, iPad, Mac</span>
            </button>
          </div>
        </section>

        {message ? (
          <StatusNotice tone="info" className="mt-5" title="Phone line updated">
            {message}
          </StatusNotice>
        ) : null}
        {error ? (
          <StatusNotice tone="destructive" className="mt-5" title="Phone line unavailable">
            {error}
          </StatusNotice>
        ) : null}
      </div>
    </WorkspaceShell>
  );
}
