import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  Activity,
  ArrowRight,
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
    <WorkspaceShell contentClassName="pt-1 pb-10">
      <PageMeta title="Personal Agent - Wireline" />

      <WorkspacePageFrame>
        {loadingAgents || loadingPhone || (personalAgent && loadingDetail) ? (
          <p className="py-10 text-center text-sm text-muted-foreground">Loading…</p>
        ) : !personalAgent ? (
          <div className="studio-card flex flex-col items-center gap-4 border-dashed px-8 py-16 text-center">
            <User className="size-8 text-primary" />
            <h3 className="wl-card-title">No agent yet</h3>
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
                    <h2 className="wl-card-title">Identity</h2>
                  </div>
                  <Link
                    to={`/studio?agent=${encodeURIComponent(personalAgent.id)}`}
                    className="inline-flex items-center gap-1 text-sm font-semibold text-primary hover:underline"
                  >
                    Studio <ArrowRight className="h-4 w-4" />
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
                    <div className="border-l-[3px] border-primary/25 py-1 pl-4 text-sm italic text-muted-foreground">
                      &ldquo;{greeting}&rdquo;
                    </div>
                  </div>
                </div>
              </section>

              <section className="studio-card overflow-hidden">
                <div className="flex items-center justify-between border-b border-border p-6">
                  <div className="flex items-center gap-3">
                    <div className="rounded-lg bg-muted p-2 text-foreground">
                      <Smartphone className="h-5 w-5" />
                    </div>
                    <h2 className="wl-card-title">Mobile</h2>
                  </div>
                  <Link
                    to="/settings/apps"
                    className="text-sm font-semibold text-primary hover:underline"
                  >
                    Apps
                  </Link>
                </div>
                <div className="divide-y divide-border">
                  <div className="flex items-center justify-between gap-4 p-4">
                    <span className="text-sm font-medium text-foreground">Voice activation</span>
                    <Link
                      to="/settings/apps"
                      className="rounded-lg bg-muted px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-accent"
                    >
                      Set up
                    </Link>
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
                  <h2 className="wl-card-title">Line</h2>
                </div>
                <div className="p-5">
                  {boundPhoneNumber ? (
                    <div className="mb-4 rounded-[var(--radius-xl)] border border-border bg-muted p-4 text-center">
                      <p className="wl-overline mb-1.5">Number</p>
                      <p className="wl-numeric font-mono text-lg font-semibold tracking-tight text-foreground">
                        {boundPhoneNumber.phone_number}
                      </p>
                    </div>
                  ) : (
                    <div className="mb-4 rounded-[var(--radius-xl)] border border-dashed border-border bg-background p-4 text-center">
                      <Link
                        to="/settings/phone"
                        className="marketing-btn-primary inline-flex w-full items-center justify-center py-2 text-xs font-semibold"
                      >
                        Provision line
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
                  <h2 className="wl-card-title">Links</h2>
                </div>
                <div className="flex flex-col gap-2 text-sm">
                  <Link to="/knowledge" className="hover:text-primary">
                    Knowledge
                  </Link>
                  <Link to="/call-logs" className="hover:text-primary">
                    Call logs
                  </Link>
                  <Link to="/inbox" className="hover:text-primary">
                    Inbox
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
