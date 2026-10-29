import { useState } from "react";
import StudioMemoryEditor from "./StudioMemoryEditor";
import {
  BookOpen,
  Brain,
  CalendarClock,
  ChevronRight,
  Mail,
  Monitor,
  Phone,
  Settings2,
} from "lucide-react";
import { Link } from "react-router";

import BotMark from "../BotMark";
import { Button } from "../atoms";
import type { WorkspaceAgentSummary } from "../../contexts/AgentsContext";
import { agentLineStatus } from "../../lib/agent-readiness";
import { formatAgentRoleLabel } from "../../lib/product-copy";
import { formatPhone } from "../../lib/safe-number";

type Props = {
  agent: WorkspaceAgentSummary;
  phoneLookupDegraded: boolean;
  onEmail: () => void;
  onComputer: () => void;
  onSetup: () => void;
};

export default function StudioBotDetailsPanel({
  agent,
  phoneLookupDegraded,
  onEmail,
  onComputer,
  onSetup,
}: Props) {
  const [memoryOpen, setMemoryOpen] = useState(false);
  const lineStatus = agentLineStatus(agent, phoneLookupDegraded);
  const phoneDescription =
    lineStatus === "live"
      ? formatPhone(agent.phone_number)
      : lineStatus === "unavailable"
        ? "Phone status unavailable"
        : "Connect or manage a number";
  const phoneHref = `/phone?tab=lines&agent=${encodeURIComponent(agent.id)}`;
  const knowledgeHref = `/knowledge?agent=${encodeURIComponent(agent.id)}`;

  return (
    <div className="wl-bot-details" aria-label={`${agent.name} details`}>
      <div className="wl-bot-details-inner">
        <header className="wl-bot-details-heading">
          <BotMark seed={agent.id} name={agent.name} markKey={agent.mark_key} size={46} />
          <div className="min-w-0">
            <h2 className="wl-preserve-case truncate text-lg font-semibold text-foreground">
              {agent.name}
            </h2>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {formatAgentRoleLabel(agent.role)}
            </p>
          </div>
        </header>
        <p className="wl-bot-details-intro">
          Your Bot's identity, knowledge, and tools are all here.
        </p>

        <div className="wl-bot-details-list">
          <Link className="wl-bot-details-row wl-focus-ring-halo" to={phoneHref}>
            <Phone size={18} aria-hidden="true" />
            <span>
              <strong>Phone</strong>
              <small>{phoneDescription}</small>
            </span>
            <ChevronRight size={16} aria-hidden="true" />
          </Link>
          <button className="wl-bot-details-row wl-focus-ring-halo" type="button" onClick={onEmail}>
            <Mail size={18} aria-hidden="true" />
            <span>
              <strong>Email</strong>
              <small>Review address and setup</small>
            </span>
            <ChevronRight size={16} aria-hidden="true" />
          </button>
          <Link className="wl-bot-details-row wl-focus-ring-halo" to={knowledgeHref}>
            <BookOpen size={18} aria-hidden="true" />
            <span>
              <strong>Knowledge</strong>
              <small>Sources, facts, and answers</small>
            </span>
            <ChevronRight size={16} aria-hidden="true" />
          </Link>
          <details
            className="wl-bot-details-disclosure"
            onToggle={(event) => {
              if (event.currentTarget.open) setMemoryOpen(true);
            }}
          >
            <summary className="wl-bot-details-row wl-focus-ring-halo">
              <Brain size={18} aria-hidden="true" />
              <span>
                <strong>Memory</strong>
                <small>Preferences and saved context</small>
              </span>
              <ChevronRight size={16} aria-hidden="true" />
            </summary>
            {memoryOpen ? (
              <StudioMemoryEditor key={agent.id} agentId={agent.id} agentName={agent.name} />
            ) : null}
          </details>
          <button
            className="wl-bot-details-row wl-focus-ring-halo"
            type="button"
            onClick={onComputer}
          >
            <Monitor size={18} aria-hidden="true" />
            <span>
              <strong>Computer</strong>
              <small>Open the browser beside your work</small>
            </span>
            <ChevronRight size={16} aria-hidden="true" />
          </button>
          <details className="wl-bot-details-disclosure">
            <summary className="wl-bot-details-row wl-focus-ring-halo">
              <CalendarClock size={18} aria-hidden="true" />
              <span>
                <strong>Automations</strong>
                <small>Scheduled work</small>
              </span>
              <ChevronRight size={16} aria-hidden="true" />
            </summary>
            <div className="wl-bot-details-explanation">
              Daily or weekly reports and post-call outputs are managed for your whole account.
              <Button asChild size="sm" variant="secondary">
                <Link to="/phone?tab=settings">Manage scheduled reports</Link>
              </Button>
              <span>
                Recurring computer tasks are not available yet. Start a task from the conversation
                when you need it.
              </span>
            </div>
          </details>
          <button className="wl-bot-details-row wl-focus-ring-halo" type="button" onClick={onSetup}>
            <Settings2 size={18} aria-hidden="true" />
            <span>
              <strong>Setup</strong>
              <small>Voice, instructions, and behavior</small>
            </span>
            <ChevronRight size={16} aria-hidden="true" />
          </button>
        </div>
      </div>
    </div>
  );
}
