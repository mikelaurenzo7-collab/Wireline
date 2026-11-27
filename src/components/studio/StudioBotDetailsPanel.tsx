import { BookOpen, CalendarClock, ChevronRight, Mail, Phone } from "lucide-react";
import { Link } from "react-router";

import BotMark from "../BotMark";
import type { WorkspaceAgentSummary } from "../../contexts/AgentsContext";
import { agentLineStatus } from "../../lib/agent-readiness";
import { DEFAULT_BOT_ARCHETYPE } from "../../lib/agent-constants";
import { formatPhone } from "../../lib/safe-number";

type Props = {
  agent: WorkspaceAgentSummary;
  phoneLookupDegraded: boolean;
  onEmail: () => void;
};

export default function StudioBotDetailsPanel({ agent, phoneLookupDegraded, onEmail }: Props) {
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
            <p className="mt-0.5 text-sm text-muted-foreground">{DEFAULT_BOT_ARCHETYPE}</p>
          </div>
        </header>
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
              <small>What {agent.name} knows, and about you</small>
            </span>
            <ChevronRight size={16} aria-hidden="true" />
          </Link>
          {/* A row for what exists. It was an "Automations" disclosure whose
              only content was this link and a note that the feature it named
              was not available. */}
          <Link className="wl-bot-details-row wl-focus-ring-halo" to="/phone?tab=settings">
            <CalendarClock size={18} aria-hidden="true" />
            <span>
              <strong>Reports</strong>
              <small>Daily or weekly, for your whole account</small>
            </span>
            <ChevronRight size={16} aria-hidden="true" />
          </Link>
        </div>
      </div>
    </div>
  );
}
