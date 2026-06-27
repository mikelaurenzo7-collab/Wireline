import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  Activity,
  ArrowRight,
  Globe,
  Mic,
  PhoneCall,
  Plus,
  Settings,
  Smartphone,
  User,
} from "lucide-react";
import { PageMeta } from "../lib/page-meta";
import WorkspaceShell from "../components/WorkspaceShell";
import { useAgents } from "../contexts/AgentsContext";
import { authFetch } from "../lib/api";

interface PhoneNumber {
  id: string;
  phone_number: string;
  agent_id: string | null;
}

export default function PersonalDashboard() {
  const { agents, loading: loadingAgents } = useAgents();
  const [phoneNumbers, setPhoneNumbers] = useState<PhoneNumber[]>([]);
  const [loadingPhone, setLoadingPhone] = useState(true);

  useEffect(() => {
    let cancelled = false;
    authFetch("/api/phone-numbers")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (cancelled || !data) return;
        setPhoneNumbers(data.numbers || []);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoadingPhone(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const personalAgent = agents[0]; // The single personal agent allowed on the Personal plan.
  const boundPhoneNumber =
    phoneNumbers.find((n) => n.agent_id === personalAgent?.id) || phoneNumbers[0];

  const agentName = personalAgent?.name || "Jordan";
  const voiceId = personalAgent?.voiceId || "ElevenLabs - Professional";
  const greeting =
    personalAgent?.firstMessage ||
    `Hi, you've reached ${personalAgent?.name || "Jordan"}'s personal AI agent. How can I help you?`;

  return (
    <WorkspaceShell title="My Agent" eyebrow="Your day" contentClassName="bg-card py-6">
      <PageMeta title="Personal Agent - Wireline" />

      <div className="mx-auto max-w-5xl">
        <header className="mb-10 text-center">
          <div className="mb-2 flex items-center justify-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--wireline-color-action-primary-container)] font-bold text-[var(--wireline-color-action-primary-default)]">
              AI
            </div>
            <h1 className="text-3xl font-semibold tracking-[-.03em] text-foreground">My Agent</h1>
          </div>
          <p className="max-w-2xl text-lg leading-relaxed text-foreground/70">
            Hand off calls. Get the recap.
          </p>
        </header>

        {loadingAgents || loadingPhone ? (
          <p className="py-10 text-left text-sm text-muted-foreground">Loading agent status...</p>
        ) : !personalAgent ? (
          <div className="flex flex-col items-start gap-4 rounded-xl border border-dashed border-[var(--wireline-color-border-default)] bg-[var(--wireline-color-canvas-default)] px-8 py-16 text-left">
            <User className="size-8 text-[var(--wireline-color-action-primary-default)]" />
            <div className="text-center">
              <h3 className="text-lg font-semibold text-foreground">Create your first agent.</h3>
            </div>
            <Link to="/studio?create=1" className="studio-primary-button mt-2 text-sm">
              <Plus size={16} /> Create agent
            </Link>
          </div>
        ) : (
          <div className="grid gap-6 text-left lg:grid-cols-3">
            <div className="space-y-6 lg:col-span-2">
              <section className="overflow-hidden rounded-xl border border-[var(--wireline-color-border-default)] bg-[var(--wireline-color-surface-default)] shadow-sm">
                <div className="flex items-center justify-between border-b border-border p-6">
                  <div className="flex items-center gap-3">
                    <div className="rounded-lg bg-[var(--wireline-color-surface-subtle)] p-2 text-[var(--wireline-color-action-primary-pressed)]">
                      <Settings className="h-5 w-5" />
                    </div>
                    <h2 className="text-lg font-semibold">Agent Identity</h2>
                  </div>
                  <Link
                    to={`/studio?agent=${encodeURIComponent(personalAgent.id)}`}
                    className="inline-flex items-center gap-1 text-sm font-semibold text-[var(--wireline-color-action-primary-default)] hover:underline"
                  >
                    Edit in Studio <ArrowRight className="h-4 w-4" />
                  </Link>
                </div>
                <div className="p-6">
                  <div className="grid gap-6 sm:grid-cols-2">
                    <div>
                      <p className="mb-2 text-[var(--wireline-typography-overline-size)] font-semibold uppercase tracking-wider text-[var(--wireline-color-text-secondary)]">
                        Name
                      </p>
                      <p className="font-medium text-foreground">{agentName}</p>
                    </div>
                    <div>
                      <p className="mb-2 text-[var(--wireline-typography-overline-size)] font-semibold uppercase tracking-wider text-[var(--wireline-color-text-secondary)]">
                        Voice
                      </p>
                      <div className="flex items-center gap-2">
                        <Mic className="h-4 w-4 text-muted-foreground" />
                        <span className="max-w-[180px] truncate font-medium text-foreground">
                          {voiceId.replace(/([A-Z])/g, " $1").trim()}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="mt-6">
                    <p className="mb-3 text-[var(--wireline-typography-overline-size)] font-semibold uppercase tracking-wider text-[var(--wireline-color-text-secondary)]">
                      Greeting
                    </p>
                    <div className="border-l-[3px] border-[var(--wireline-color-action-primary-default)]/35 py-1 pl-4 text-sm italic leading-relaxed text-[var(--wireline-color-text-secondary)]">
                      "{greeting}"
                    </div>
                  </div>
                </div>
              </section>

              <section className="overflow-hidden rounded-xl border border-[var(--wireline-color-border-default)] bg-[var(--wireline-color-surface-default)] shadow-sm">
                <div className="flex items-center gap-3 border-b border-border p-6">
                  <div className="rounded-lg bg-[var(--wireline-color-surface-subtle)] p-2 text-[var(--wireline-color-action-primary-pressed)]">
                    <Smartphone className="h-5 w-5" />
                  </div>
                  <h2 className="text-lg font-semibold">Mobile Ecosystem</h2>
                </div>
                <div className="p-6">
                  <p className="mb-6 text-sm leading-relaxed text-muted-foreground">
                    Use your agent from your phone, your watch, or just by saying "Hey Siri, ask
                    Wireline."
                  </p>

                  <div className="space-y-4">
                    <div className="flex items-start gap-4 rounded-xl border border-border p-4 transition-colors hover:border-foreground/15 hover:bg-muted/40">
                      <div className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--wireline-color-surface-subtle)]">
                        <Mic className="h-4 w-4 text-primary" />
                      </div>
                      <div className="flex-1">
                        <h3 className="mb-1 font-medium text-foreground">Voice Activation</h3>
                        <p className="text-xs text-muted-foreground">
                          Say "Hey Siri, Ask Wireline" to start a call hands-free - from your phone,
                          AirPods, or car.
                        </p>
                      </div>
                      <Link
                        to="/settings"
                        className="shrink-0 rounded-lg bg-[var(--wireline-color-surface-subtle)] px-4 py-2 text-xs font-semibold text-[var(--wireline-color-action-primary-pressed)] transition-colors hover:bg-[var(--wireline-color-surface-container)]"
                      >
                        Set up
                      </Link>
                    </div>

                    <div className="flex items-start gap-4 rounded-xl border border-border p-4 transition-colors hover:border-foreground/15 hover:bg-muted/40">
                      <div className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--wireline-color-surface-subtle)]">
                        <Globe className="h-4 w-4 text-primary" />
                      </div>
                      <div className="flex-1">
                        <h3 className="mb-1 font-medium text-foreground">Get Updates by Text</h3>
                        <p className="text-xs text-muted-foreground">
                          Your agent will text you the important details after every call. No app
                          needed.
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </section>
            </div>

            <div className="space-y-6">
              <section className="overflow-hidden rounded-xl border border-[var(--wireline-color-border-default)] bg-[var(--wireline-color-surface-default)] shadow-sm">
                <div className="flex items-center gap-3 border-b border-border p-5">
                  <div className="rounded-lg bg-[var(--wireline-color-surface-subtle)] p-2 text-[var(--wireline-color-action-primary-pressed)]">
                    <PhoneCall className="h-4 w-4" />
                  </div>
                  <h2 className="font-semibold">Call Routing</h2>
                </div>
                <div className="p-5 text-left">
                  <p className="mb-4 text-xs leading-relaxed text-muted-foreground">
                    Forward missed calls to your agent. They&apos;ll handle it and text you the
                    summary.
                  </p>
                  {boundPhoneNumber ? (
                    <div className="mb-5 rounded-xl border border-[var(--wireline-color-border-default)] bg-[var(--wireline-color-surface-subtle)] p-4 text-center">
                      <p className="mb-1.5 text-[var(--wireline-typography-overline-size)] font-semibold uppercase tracking-wider text-muted-foreground">
                        Your Agent&apos;s Number
                      </p>
                      <p className="wl-numeric font-mono text-lg font-semibold tracking-tight text-foreground">
                        {boundPhoneNumber.phone_number}
                      </p>
                    </div>
                  ) : (
                    <div className="mb-5 rounded-xl border border-dashed border-[var(--wireline-color-border-default)] bg-[var(--wireline-color-canvas-default)] p-4 text-center">
                      <p className="mb-2 text-xs text-muted-foreground">No phone number claimed</p>
                      <Link
                        to="/settings"
                        className="inline-flex w-full items-center justify-center rounded-lg bg-[var(--wireline-color-action-primary-default)] py-2 text-xs font-semibold text-[var(--wireline-color-text-onAction)] transition-colors hover:bg-[var(--wireline-color-action-primary-pressed)]"
                      >
                        Claim a number
                      </Link>
                    </div>
                  )}
                  <Link
                    to="/settings"
                    className="block w-full rounded-xl bg-[var(--wireline-color-surface-subtle)] py-2.5 text-center text-xs font-semibold text-[var(--wireline-color-action-primary-pressed)] transition-colors hover:bg-[var(--wireline-color-surface-container)]"
                  >
                    Set Up Call Forwarding
                  </Link>
                </div>
              </section>

              <section className="overflow-hidden rounded-xl border border-[var(--wireline-color-border-default)] bg-[var(--wireline-color-surface-default)] shadow-sm">
                <div className="flex items-center gap-3 border-b border-border p-5">
                  <div className="rounded-lg bg-[var(--wireline-color-surface-subtle)] p-2 text-[var(--wireline-color-action-primary-pressed)]">
                    <Activity className="h-4 w-4" />
                  </div>
                  <h2 className="font-semibold">Recent Activity</h2>
                </div>
                <div className="p-5">
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">Calls Handled Today</span>
                      <span className="wl-numeric font-semibold text-foreground">0</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">Average Duration</span>
                      <span className="wl-numeric font-semibold text-foreground">--</span>
                    </div>
                    <Link
                      to="/inbox"
                      className="mt-3 block w-full rounded-xl border border-[var(--wireline-color-border-default)] bg-[var(--wireline-color-surface-default)] py-2.5 text-center text-xs font-semibold text-[var(--wireline-color-action-primary-default)] transition-colors hover:bg-[var(--wireline-color-surface-subtle)]"
                    >
                      View Activity
                    </Link>
                  </div>
                </div>
              </section>
            </div>
          </div>
        )}
      </div>
    </WorkspaceShell>
  );
}
