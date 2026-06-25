import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import {
  PhoneCall,
  Smartphone,
  Settings,
  User,
  Mic,
  Globe,
  Activity,
  ArrowRight,
  Plus,
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

  const personalAgent = agents[0]; // The single personal assistant allowed on the Personal plan
  const boundPhoneNumber =
    phoneNumbers.find((n) => n.agent_id === personalAgent?.id) || phoneNumbers[0];

  const agentName = personalAgent?.name || "Jordan";
  const voiceId = personalAgent?.voiceId || "ElevenLabs - Professional";
  const greeting =
    personalAgent?.firstMessage ||
    `Hi, you've reached ${personalAgent?.name || "Jordan"}'s personal AI assistant. How can I help you?`;

  return (
    <WorkspaceShell title="My Assistant" eyebrow="Your day" contentClassName="py-6 bg-card">
      <PageMeta title="Personal Assistant — Wireline" />

      <div className="max-w-5xl mx-auto">
        <header className="mb-10 text-left">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-full bg-[var(--wireline-color-action-primary-container)] text-[var(--wireline-color-action-primary-default)] flex items-center justify-center font-bold">
              AI
            </div>
            <h1 className="text-3xl font-semibold tracking-[-.03em] text-foreground">
              My Assistant
            </h1>
          </div>
          <p className="text-foreground/70 text-lg max-w-2xl leading-relaxed">
            Hand off the calls you keep putting off. Your assistant makes the call, waits on hold,
            and texts you what matters.
          </p>
        </header>

        {loadingAgents || loadingPhone ? (
          <p className="py-10 text-sm text-muted-foreground text-left">Loading assistant status…</p>
        ) : !personalAgent ? (
          <div className="flex flex-col items-start gap-4 py-16 px-8 rounded-xl border border-dashed border-[var(--wireline-color-border-default)] bg-[var(--wireline-color-canvas-default)] text-left">
            <User className="size-8 text-[var(--wireline-color-action-primary-default)]" />
            <div>
              <h3 className="font-semibold text-lg text-foreground">
                Start by creating your first assistant
              </h3>
              <p className="text-sm text-muted-foreground mt-1 max-w-lg leading-relaxed">
                Define what your assistant should handle: reservations, support hold times, pharmacy
                pickups, or custom checklists.
              </p>
            </div>
            <Link to="/studio?create=1" className="studio-primary-button text-sm mt-2">
              <Plus size={16} /> Create assistant
            </Link>
          </div>
        ) : (
          <div className="grid lg:grid-cols-3 gap-6 text-left">
            {/* Main Column */}
            <div className="lg:col-span-2 space-y-6">
              {/* Agent Identity Module */}
              <section className="bg-[var(--wireline-color-surface-default)] border border-[var(--wireline-color-border-default)] rounded-xl overflow-hidden shadow-sm">
                <div className="p-6 border-b border-border flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-[var(--wireline-color-surface-subtle)] text-[var(--wireline-color-action-primary-pressed)]">
                      <Settings className="w-5 h-5" />
                    </div>
                    <h2 className="font-semibold text-lg">Agent Identity</h2>
                  </div>
                  <Link
                    to={`/studio?agent=${encodeURIComponent(personalAgent.id)}`}
                    className="text-sm font-semibold text-[var(--wireline-color-action-primary-default)] hover:underline inline-flex items-center gap-1"
                  >
                    Edit in Studio <ArrowRight className="w-4 h-4" />
                  </Link>
                </div>
                <div className="p-6">
                  <div className="grid sm:grid-cols-2 gap-6">
                    <div>
                      <p className="text-[var(--wireline-typography-overline-size)] font-semibold uppercase tracking-wider text-[var(--wireline-color-text-secondary)] mb-2">
                        Name
                      </p>
                      <p className="text-foreground font-medium">{agentName}</p>
                    </div>
                    <div>
                      <p className="text-[var(--wireline-typography-overline-size)] font-semibold uppercase tracking-wider text-[var(--wireline-color-text-secondary)] mb-2">
                        Voice
                      </p>
                      <div className="flex items-center gap-2">
                        <Mic className="w-4 h-4 text-muted-foreground" />
                        <span className="text-foreground font-medium truncate max-w-[180px]">
                          {voiceId.replace(/([A-Z])/g, " $1").trim()}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="mt-6">
                    <p className="text-[var(--wireline-typography-overline-size)] font-semibold uppercase tracking-wider text-[var(--wireline-color-text-secondary)] mb-3">
                      Greeting
                    </p>
                    <div className="pl-4 py-1 text-[var(--wireline-color-text-secondary)] italic border-l-[3px] border-[var(--wireline-color-action-primary-default)]/35 text-sm leading-relaxed">
                      "{greeting}"
                    </div>
                  </div>
                </div>
              </section>

              {/* Mobile Ecosystem Module */}
              <section className="bg-[var(--wireline-color-surface-default)] border border-[var(--wireline-color-border-default)] rounded-xl overflow-hidden shadow-sm">
                <div className="p-6 border-b border-border flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-[var(--wireline-color-surface-subtle)] text-[var(--wireline-color-action-primary-pressed)]">
                    <Smartphone className="w-5 h-5" />
                  </div>
                  <h2 className="font-semibold text-lg">Mobile Ecosystem</h2>
                </div>
                <div className="p-6">
                  <p className="text-muted-foreground text-sm leading-relaxed mb-6">
                    Use your assistant from your phone, your watch, or just by saying "Hey Siri, ask
                    Wireline."
                  </p>

                  <div className="space-y-4">
                    {/* Voice Activation */}
                    <div className="flex items-start gap-4 p-4 rounded-xl border border-border hover:border-foreground/15 hover:bg-muted/40 transition-colors">
                      <div className="mt-1 w-8 h-8 rounded-full bg-[var(--wireline-color-surface-subtle)] flex items-center justify-center shrink-0">
                        <Mic className="w-4 h-4 text-primary" />
                      </div>
                      <div className="flex-1">
                        <h3 className="font-medium text-foreground mb-1">Voice Activation</h3>
                        <p className="text-xs text-muted-foreground">
                          Say "Hey Siri, Ask Wireline" to start a call hands-free — from your phone,
                          AirPods, or car.
                        </p>
                      </div>
                      <Link
                        to="/settings"
                        className="px-4 py-2 bg-[var(--wireline-color-surface-subtle)] hover:bg-[var(--wireline-color-surface-container)] text-[var(--wireline-color-action-primary-pressed)] rounded-lg text-xs font-semibold transition-colors shrink-0"
                      >
                        Set up
                      </Link>
                    </div>

                    {/* Notifications */}
                    <div className="flex items-start gap-4 p-4 rounded-xl border border-border hover:border-foreground/15 hover:bg-muted/40 transition-colors">
                      <div className="mt-1 w-8 h-8 rounded-full bg-[var(--wireline-color-surface-subtle)] flex items-center justify-center shrink-0">
                        <Globe className="w-4 h-4 text-primary" />
                      </div>
                      <div className="flex-1">
                        <h3 className="font-medium text-foreground mb-1">Get Updates by Text</h3>
                        <p className="text-xs text-muted-foreground">
                          Your assistant will text you the important details after every call. No
                          app needed.
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </section>
            </div>

            {/* Right Column */}
            <div className="space-y-6">
              {/* Phone Number Module */}
              <section className="bg-[var(--wireline-color-surface-default)] border border-[var(--wireline-color-border-default)] rounded-xl overflow-hidden shadow-sm">
                <div className="p-5 border-b border-border flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-[var(--wireline-color-surface-subtle)] text-[var(--wireline-color-action-primary-pressed)]">
                    <PhoneCall className="w-4 h-4" />
                  </div>
                  <h2 className="font-semibold">Call Routing</h2>
                </div>
                <div className="p-5 text-left">
                  <p className="text-xs text-muted-foreground leading-relaxed mb-4">
                    Forward missed calls to your assistant. They'll handle it and text you the
                    summary.
                  </p>
                  {boundPhoneNumber ? (
                    <div className="p-4 bg-[var(--wireline-color-surface-subtle)] rounded-xl border border-[var(--wireline-color-border-default)] text-center mb-5">
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
                        Your Assistant's Number
                      </p>
                      <p className="font-mono text-lg font-semibold text-foreground tracking-tight wl-numeric">
                        {boundPhoneNumber.phone_number}
                      </p>
                    </div>
                  ) : (
                    <div className="p-4 bg-[var(--wireline-color-canvas-default)] rounded-xl border border-dashed border-[var(--wireline-color-border-default)] text-center mb-5">
                      <p className="text-xs text-muted-foreground mb-2">No phone number claimed</p>
                      <Link
                        to="/settings"
                        className="inline-flex items-center justify-center w-full py-2 bg-[var(--wireline-color-action-primary-default)] text-[var(--wireline-color-text-onAction)] rounded-lg text-xs font-semibold hover:bg-[var(--wireline-color-action-primary-pressed)] transition-colors"
                      >
                        Claim a number
                      </Link>
                    </div>
                  )}
                  <Link
                    to="/settings"
                    className="block text-center w-full py-2.5 bg-[var(--wireline-color-surface-subtle)] hover:bg-[var(--wireline-color-surface-container)] text-[var(--wireline-color-action-primary-pressed)] rounded-xl text-xs font-semibold transition-colors"
                  >
                    Set Up Call Forwarding
                  </Link>
                </div>
              </section>

              {/* Quick Stats Module */}
              <section className="bg-[var(--wireline-color-surface-default)] border border-[var(--wireline-color-border-default)] rounded-xl overflow-hidden shadow-sm">
                <div className="p-5 border-b border-border flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-[var(--wireline-color-surface-subtle)] text-[var(--wireline-color-action-primary-pressed)]">
                    <Activity className="w-4 h-4" />
                  </div>
                  <h2 className="font-semibold">Recent Activity</h2>
                </div>
                <div className="p-5">
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">Calls Handled Today</span>
                      <span className="font-semibold text-foreground wl-numeric">0</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">Average Duration</span>
                      <span className="font-semibold text-foreground wl-numeric">—</span>
                    </div>
                    <Link
                      to="/inbox"
                      className="block text-center w-full py-2.5 mt-3 bg-[var(--wireline-color-surface-default)] text-[var(--wireline-color-action-primary-default)] border border-[var(--wireline-color-border-default)] hover:bg-[var(--wireline-color-surface-subtle)] rounded-xl text-xs font-semibold transition-colors"
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
