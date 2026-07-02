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
import { Button } from "../components/atoms";
import { PageMeta } from "../lib/page-meta";
import { WorkspacePageFrame } from "../components/layout/WorkspacePageFrame";
import WorkspaceShell from "../components/WorkspaceShell";
import { useAgents } from "../contexts/AgentsContext";
import { useAuth } from "../contexts/AuthContext";
import { authFetch } from "../lib/api";
import { resolveVoiceLabel } from "../lib/voice-catalog";

interface PhoneNumber {
  id: string;
  phone_number: string;
  agent_id: string | null;
}

type AgentDetail = {
  voiceId: string | null;
  firstMessage: string | null;
};

export default function PersonalDashboard() {
  const { user } = useAuth();
  const { agents, loading: loadingAgents } = useAgents();
  const [phoneNumbers, setPhoneNumbers] = useState<PhoneNumber[]>([]);
  const [agentDetail, setAgentDetail] = useState<AgentDetail | null>(null);
  const [loadingPhone, setLoadingPhone] = useState(true);
  const [loadingDetail, setLoadingDetail] = useState(false);

  const personalAgent = agents.find((agent) => !agent.is_business_agent) || agents[0];

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

  useEffect(() => {
    if (!personalAgent?.id) {
      setAgentDetail(null);
      return;
    }
    let cancelled = false;
    setLoadingDetail(true);
    Promise.all([
      authFetch(`/api/agent-config/${encodeURIComponent(personalAgent.id)}`).then((r) =>
        r.ok ? r.json() : null,
      ),
      authFetch("/api/agents").then((r) => (r.ok ? r.json() : null)),
    ])
      .then(([config, roster]) => {
        if (cancelled) return;
        const row = Array.isArray(roster?.agents)
          ? roster.agents.find((agent: { id?: string }) => agent?.id === personalAgent.id)
          : null;
        setAgentDetail({
          voiceId: config?.voice?.voiceId ?? row?.voiceId ?? null,
          firstMessage: row?.firstMessage ?? null,
        });
      })
      .catch(() => {
        if (!cancelled) setAgentDetail(null);
      })
      .finally(() => {
        if (!cancelled) setLoadingDetail(false);
      });
    return () => {
      cancelled = true;
    };
  }, [personalAgent?.id]);
  const boundPhoneNumber =
    phoneNumbers.find((n) => n.agent_id === personalAgent?.id) || phoneNumbers[0];

  const agentName = personalAgent?.name || "Your agent";
  const voiceLabel = resolveVoiceLabel(agentDetail?.voiceId);
  const greeting =
    agentDetail?.firstMessage || `Hi, you've reached ${agentName}. How can I help you today?`;

  return (
    <WorkspaceShell
      title="My Agent"
      eyebrow="Your day"
      description="Hand off calls. Get the recap."
      contentClassName="pt-1 pb-10"
    >
      <PageMeta title="Personal Agent - Wireline" />

      <WorkspacePageFrame>
        {loadingAgents || loadingPhone || (personalAgent && loadingDetail) ? (
          <p className="py-10 text-center text-sm text-muted-foreground">Loading agent status…</p>
        ) : !personalAgent ? (
          <div className="studio-card flex flex-col items-center gap-4 border-dashed px-8 py-16 text-center">
            <User className="size-8 text-primary" />
            <div>
              <h3 className="wl-card-title">Create your first agent.</h3>
              <p className="mt-2 text-sm text-muted-foreground">
                {user?.full_name?.split(/\s+/)[0] || "Your"} personal line starts in Studio.
              </p>
            </div>
            <Button asChild className="mt-2">
              <Link to="/studio?create=1&posture=personal">
                <Plus size={16} /> Create agent
              </Link>
            </Button>
          </div>
        ) : (
          <div className="grid gap-6 text-left lg:grid-cols-3">
            <div className="space-y-6 lg:col-span-2">
              <section className="studio-card overflow-hidden">
                <div className="flex items-center justify-between border-b border-border p-6">
                  <div className="flex items-center gap-3">
                    <div className="rounded-lg bg-muted p-2 text-foreground">
                      <Settings className="h-5 w-5" />
                    </div>
                    <h2 className="wl-card-title">Agent Identity</h2>
                  </div>
                  <Link
                    to={`/studio?agent=${encodeURIComponent(personalAgent.id)}`}
                    className="inline-flex items-center gap-1 text-sm font-semibold text-primary hover:underline"
                  >
                    Edit in Studio <ArrowRight className="h-4 w-4" />
                  </Link>
                </div>
                <div className="p-6">
                  <div className="grid gap-6 sm:grid-cols-2">
                    <div>
                      <p className="wl-overline mb-2">Name</p>
                      <p className="font-medium text-foreground">{agentName}</p>
                    </div>
                    <div>
                      <p className="wl-overline mb-2">Voice</p>
                      <div className="flex items-center gap-2">
                        <Mic className="h-4 w-4 text-muted-foreground" />
                        <span className="max-w-[180px] truncate font-medium text-foreground">
                          {voiceLabel}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="mt-6">
                    <p className="wl-overline mb-3">Greeting</p>
                    <div className="border-l-[3px] border-primary/25 py-1 pl-4 text-sm italic leading-relaxed text-muted-foreground">
                      &ldquo;{greeting}&rdquo;
                    </div>
                  </div>
                </div>
              </section>

              <section className="studio-card overflow-hidden">
                <div className="flex items-center gap-3 border-b border-border p-6">
                  <div className="rounded-lg bg-muted p-2 text-foreground">
                    <Smartphone className="h-5 w-5" />
                  </div>
                  <h2 className="wl-card-title">Mobile surfaces</h2>
                </div>
                <div className="p-6">
                  <p className="mb-6 text-center text-sm leading-relaxed text-muted-foreground sm:text-left">
                    Use your agent from your phone, your watch, or by saying &ldquo;Hey Siri, ask
                    Wireline.&rdquo;
                  </p>

                  <div className="space-y-4">
                    <div className="flex items-start gap-4 rounded-[var(--radius-xl)] border border-border p-4 transition-colors hover:border-primary/20 hover:bg-muted/40">
                      <div className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted">
                        <Mic className="h-4 w-4 text-primary" />
                      </div>
                      <div className="flex-1">
                        <h3 className="mb-1 font-medium text-foreground">Voice activation</h3>
                        <p className="text-xs text-muted-foreground">
                          Say &ldquo;Hey Siri, Ask Wireline&rdquo; to start a call hands-free from
                          your phone, AirPods, or car.
                        </p>
                      </div>
                      <Link
                        to="/settings/apps"
                        className="shrink-0 rounded-lg bg-muted px-4 py-2 text-xs font-semibold text-foreground transition-colors hover:bg-accent"
                      >
                        Set up
                      </Link>
                    </div>

                    <div className="flex items-start gap-4 rounded-[var(--radius-xl)] border border-border p-4 transition-colors hover:border-primary/20 hover:bg-muted/40">
                      <div className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted">
                        <Globe className="h-4 w-4 text-primary" />
                      </div>
                      <div className="flex-1">
                        <h3 className="mb-1 font-medium text-foreground">Get updates by text</h3>
                        <p className="text-xs text-muted-foreground">
                          Your agent can text you the important details after every call.
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </section>
            </div>

            <div className="space-y-6">
              <section className="studio-card overflow-hidden">
                <div className="flex items-center gap-3 border-b border-border p-5">
                  <div className="rounded-lg bg-muted p-2 text-foreground">
                    <PhoneCall className="h-4 w-4" />
                  </div>
                  <h2 className="wl-card-title">Call routing</h2>
                </div>
                <div className="p-5 text-left">
                  <p className="mb-4 text-xs leading-relaxed text-muted-foreground">
                    Forward missed calls to your agent. They&apos;ll handle it and text you the
                    summary.
                  </p>
                  {boundPhoneNumber ? (
                    <div className="mb-5 rounded-[var(--radius-xl)] border border-border bg-muted p-4 text-center">
                      <p className="wl-overline mb-1.5">Your Wireline number</p>
                      <p className="wl-numeric font-mono text-lg font-semibold tracking-tight text-foreground">
                        {boundPhoneNumber.phone_number}
                      </p>
                    </div>
                  ) : (
                    <div className="mb-5 rounded-[var(--radius-xl)] border border-dashed border-border bg-background p-4 text-center">
                      <p className="mb-2 text-xs text-muted-foreground">No phone number yet</p>
                      <Link
                        to="/settings/phone"
                        className="marketing-btn-primary inline-flex w-full items-center justify-center py-2 text-xs font-semibold"
                      >
                        Provision a line
                      </Link>
                    </div>
                  )}
                  <Link
                    to="/settings/phone"
                    className="block w-full rounded-[var(--radius-xl)] bg-muted py-2.5 text-center text-xs font-semibold text-foreground transition-colors hover:bg-accent"
                  >
                    Phone settings
                  </Link>
                </div>
              </section>

              <section className="studio-card p-5">
                <div className="mb-4 flex items-center gap-2">
                  <Activity className="h-4 w-4 text-primary" />
                  <h2 className="wl-card-title">Quick links</h2>
                </div>
                <div className="flex flex-col gap-2 text-sm">
                  <Link to="/training" className="hover:text-primary">
                    Train voice & knowledge
                  </Link>
                  <Link to="/call-logs" className="hover:text-primary">
                    Review recent calls
                  </Link>
                  <Link to="/inbox" className="hover:text-primary">
                    Open inbox
                  </Link>
                </div>
              </section>
            </div>
          </div>
        )}
      </WorkspacePageFrame>
    </WorkspaceShell>
  );
}
