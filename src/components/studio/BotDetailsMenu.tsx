import * as Popover from "@radix-ui/react-popover";
import { ChevronDown, Globe, Inbox, BookOpen, Phone, Settings2, Plus, List, Check } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router";

import BotMark from "../BotMark";
import type { WorkspaceAgentSummary } from "../../contexts/AgentsContext";

type BotDetailsMenuProps = {
  agent: WorkspaceAgentSummary;
  agents: WorkspaceAgentSummary[];
  onSelectAgent: (agentId: string) => void;
};

export default function BotDetailsMenu({
  agent,
  agents,
  onSelectAgent,
}: BotDetailsMenuProps) {
  const [open, setOpen] = useState(false);
  const scope = `agent=${encodeURIComponent(agent.id)}`;
  const work = `/studio?${scope}`;
  const links = [
    { label: "Computer", href: `${work}&panel=computer`, Icon: Globe },
    { label: "Calls and number", href: "/phone", Icon: Phone },
    { label: "Inbox", href: "/inbox", Icon: Inbox },
    { label: "Knowledge", href: `/knowledge?${scope}`, Icon: BookOpen },
    { label: "Set Up", href: `${work}&section=setup`, Icon: Settings2 },
  ];

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <button
          type="button"
          aria-label={agents.length > 1 ? "Switch Bot or open details" : "Open Bot details"}
          className="wl-focus-ring-halo inline-flex min-h-11 min-w-0 max-w-full items-center gap-2 rounded-lg px-2 py-1 text-left text-sm font-semibold text-foreground transition-colors hover:bg-muted"
        >
          <BotMark
            seed={agent.id}
            name={agent.name}
            markKey={agent.mark_key}
            size={28}
            decorative
          />
          <span className="wl-preserve-case max-w-[12rem] truncate sm:max-w-[18rem]">
            {agent.name}
          </span>
          <ChevronDown aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="start"
          sideOffset={7}
          collisionPadding={12}
          className="z-[100] max-h-[min(85dvh,36rem)] w-[min(21.5rem,calc(100vw-1.5rem))] overflow-y-auto rounded-xl border border-border bg-popover p-2 text-popover-foreground shadow-[var(--wireline-elevation-lg)] outline-none"
          aria-label="Bot details and tools"
        >
          <div className="px-2 pb-3 pt-2">
            <div className="flex items-center gap-3">
              <BotMark
                seed={agent.id}
                name={agent.name}
                markKey={agent.mark_key}
                size={40}
                decorative
              />
              <div className="min-w-0 flex-1">
                <p className="wl-preserve-case truncate text-base font-semibold">{agent.name}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {agent.role || "Your Bot"}
                </p>
              </div>
            </div>
            {agent.phone_number ? (
              <p className="mt-2 text-xs text-muted-foreground">
                Phone: {agent.phone_number}
              </p>
            ) : null}
          </div>

          {agents.length > 1 ? (
            <div className="border-t border-border py-2">
              <p className="px-2 pb-1 text-xs font-semibold text-muted-foreground">Switch Bot</p>
              {agents.map((other) => (
                <button
                  key={other.id}
                  type="button"
                  onClick={() => {
                    onSelectAgent(other.id);
                    setOpen(false);
                  }}
                  aria-current={other.id === agent.id ? "true" : undefined}
                  className="wl-focus-ring-halo flex min-h-11 w-full items-center gap-2 rounded-md px-2 text-left text-sm hover:bg-muted"
                >
                  <BotMark
                    seed={other.id}
                    name={other.name}
                    markKey={other.mark_key}
                    size={26}
                    decorative
                  />
                  <span className="min-w-0 flex-1 truncate">{other.name}</span>
                  {other.id === agent.id ? (
                    <Check aria-hidden="true" className="size-4 text-primary" />
                  ) : null}
                </button>
              ))}
            </div>
          ) : null}

          <nav aria-label="Bot resources" className="border-t border-border py-2">
            {links.map(({ label, href, Icon }) => (
              <Link
                key={label}
                to={href}
                onClick={() => setOpen(false)}
                className="wl-focus-ring-halo flex min-h-11 items-center gap-3 rounded-md px-2 text-sm font-medium hover:bg-muted"
              >
                <Icon aria-hidden="true" className="size-[17px] text-muted-foreground" />
                <span>{label}</span>
              </Link>
            ))}
          </nav>
          <div className="border-t border-border pt-2">
            <Link
              to="/studio?create=1"
              onClick={() => setOpen(false)}
              className="wl-focus-ring-halo flex min-h-11 items-center gap-3 rounded-md px-2 text-sm font-medium hover:bg-muted"
            >
              <Plus aria-hidden="true" className="size-[17px] text-muted-foreground" />
              Add another Bot
            </Link>
            {agents.length > 3 ? (
              <Link
                to="/bots"
                onClick={() => setOpen(false)}
                className="wl-focus-ring-halo flex min-h-11 items-center gap-3 rounded-md px-2 text-sm font-medium hover:bg-muted"
              >
                <List aria-hidden="true" className="size-[17px] text-muted-foreground" />
                All Bots
              </Link>
            ) : null}
          </div>
          <Popover.Arrow className="fill-popover" aria-hidden="true" />
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
