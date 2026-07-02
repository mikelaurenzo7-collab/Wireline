import { useEffect, useMemo, useState } from "react";
import { Check, Plus } from "lucide-react";
import { Link } from "react-router-dom";

import { Button } from "../components/atoms";
import { StatusNotice } from "../components/molecules";
import SettingsTabs from "../components/settings/SettingsTabs";
import { WorkspacePageFrame } from "../components/layout/WorkspacePageFrame";
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
    <WorkspaceShell
      eyebrow="Settings"
      title="Phone"
      description="Provision your line, routing rules, and connected devices."
      contentClassName="pt-1 pb-8"
    >
      <WorkspacePageFrame>
        <SettingsTabs />

        <div className="grid gap-4 xl:grid-cols-[minmax(420px,0.72fr)_minmax(320px,0.45fr)]">
          <section className="rounded-2xl border border-primary/20 bg-primary p-5 text-primary-foreground shadow-[var(--wireline-elevation-md)] sm:p-7">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-primary-foreground/65">
                  Your Wireline number
                </p>
                <h2 className="mt-4 truncate font-[var(--wireline-font-family-display)] text-[clamp(1.75rem,1.2rem+2.5vw,2.5rem)] font-normal leading-none tracking-[-0.035em]">
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
              Wireline can provision a dedicated line, attach it to an agent, and keep caller
              history tied to the workspace.
            </p>
            <div className="mt-5 grid gap-2 text-sm">
              {[
                "Dedicated line for inbound calls",
                "Agent-aware routing and SMS follow-up",
                "Ready for paid number add-ons",
              ].map((item) => (
                <div
                  key={item}
                  className="flex items-center gap-2 rounded-xl bg-muted/50 px-3 py-2"
                >
                  <Check size={14} className="text-primary" aria-hidden="true" />
                  <span>{item}</span>
                </div>
              ))}
            </div>
          </section>
        </div>

        <div className="mt-5 grid gap-4 xl:grid-cols-[minmax(420px,0.72fr)_minmax(320px,0.45fr)]">
          <section className="studio-card p-5 sm:p-6">
            <p className="wl-overline">Inbound routing</p>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">
              When your Wireline number is provisioned, inbound calls route to the attached agent.
              Greeting, handoff, and escalation rules are configured in Studio.
            </p>
            {attachedAgent ? (
              <div className="mt-4 rounded-xl border border-primary/20 bg-primary/5 px-4 py-3 text-center sm:text-left">
                <p className="text-sm font-semibold text-foreground">{attachedAgent.name}</p>
                <p className="mt-1 text-xs text-muted-foreground">Attached to your line</p>
              </div>
            ) : (
              <p className="mt-4 text-center text-sm text-muted-foreground sm:text-left">
                No agent attached yet. Provision a line, then attach an agent in Studio.
              </p>
            )}
            <div className="mt-4 flex justify-center sm:justify-start">
              <Button asChild variant="secondary" size="sm">
                <Link
                  to={
                    attachedAgent
                      ? `/studio?agent=${encodeURIComponent(attachedAgent.id)}`
                      : "/studio"
                  }
                >
                  Open Studio
                </Link>
              </Button>
            </div>
          </section>

          <section className="studio-card p-5 sm:p-6">
            <div className="flex items-center justify-between gap-3">
              <p className="wl-overline">VIP contacts</p>
              <Button type="button" variant="secondary" size="sm" disabled>
                <Plus size={14} aria-hidden="true" />
                Add
              </Button>
            </div>
            <p className="mt-4 rounded-xl border border-dashed border-border bg-muted/20 px-4 py-6 text-center text-sm text-muted-foreground">
              VIP routing is coming soon. Contacts and VIP lists will ring through before your agent
              intercepts.
            </p>
          </section>
        </div>

        <section className="studio-card mt-5 p-5 sm:p-6 text-center">
          <p className="wl-overline">Connected devices</p>
          <p className="mx-auto mt-3 max-w-prose text-sm leading-6 text-muted-foreground">
            iPhone, Android, browser companion, and in-car surfaces all run the same Wireline
            workspace. Manage them from Apps.
          </p>
          <Button asChild variant="secondary" size="sm" className="mt-4">
            <Link to="/settings/apps">View apps</Link>
          </Button>
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
      </WorkspacePageFrame>
    </WorkspaceShell>
  );
}
