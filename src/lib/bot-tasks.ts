import type { AgentToolName } from "./agent-capabilities";

/**
 * One Bot does the whole job. The owner turns on tasks, not roles: each task
 * is a named bundle of the Bot's existing actions, saved through the same
 * enabled-tools selection the Actions panel edits. A task never grants an
 * action the Actions panel could not.
 */
export type BotTask = {
  id: string;
  label: string;
  description: string;
  tools: readonly AgentToolName[];
  /**
   * What every Bot does, whatever is ticked (ALWAYS_ON_AGENT_TOOL_NAMES). It
   * is shown without a switch: these used to be checkboxes that changed
   * nothing, because the Bot is always allowed to do them.
   */
  alwaysOn?: boolean;
};

export const BOT_TASKS: readonly BotTask[] = [
  {
    id: "answer",
    label: "Answer questions",
    description: "Answer from what you taught it.",
    tools: ["search_knowledge_base"],
    alwaysOn: true,
  },
  {
    id: "messages",
    label: "Take messages",
    description: "Note who reached out and what they need, and leave you a follow-up.",
    tools: ["create_followup_task"],
    alwaysOn: true,
  },
  {
    id: "dnc",
    label: "Respect do-not-call requests",
    description: "Add anyone who asks not to be contacted again to your do-not-call list.",
    tools: ["add_to_dnc"],
    alwaysOn: true,
  },
  {
    id: "handoff",
    label: "Bring you in",
    description: "Alert you, or transfer the call, when a caller asks for a person.",
    tools: ["escalate_to_human"],
  },
  {
    id: "book",
    label: "Book appointments",
    description: "Check your calendar and book or request a time.",
    tools: ["check_calendar_availability", "book_appointment"],
  },
  {
    id: "text",
    label: "Text follow-ups",
    description: "Send texts people ask for. Their permission and carrier approval still apply.",
    tools: ["send_text_message", "lookup_phone_number"],
  },
  {
    id: "email",
    label: "Email follow-ups",
    description: "Send email people ask for after a call or chat.",
    tools: ["send_email"],
  },
  {
    id: "web",
    label: "Web work",
    description: "Do supervised tasks on websites with its own computer.",
    tools: [
      "start_computer_task",
      "check_computer_task",
      "reply_computer_task",
      "stop_computer_task",
    ],
  },
];

type ToolFilter = (tool: AgentToolName) => boolean;

/** The task's actions the owner can actually configure here. */
export function botTaskTools(task: BotTask, visible: ToolFilter): AgentToolName[] {
  return task.tools.filter(visible);
}

/** A task is on when every one of its configurable actions is on. */
export function isBotTaskEnabled(
  task: BotTask,
  enabled: ReadonlySet<AgentToolName>,
  visible: ToolFilter,
): boolean {
  if (task.alwaysOn) return true;
  const tools = botTaskTools(task, visible);
  return tools.length > 0 && tools.every((tool) => enabled.has(tool));
}

/**
 * Turn a task on or off. Turning one off keeps any action another enabled task
 * still needs, so switching off Take messages never disables Book appointments.
 */
export function setBotTaskEnabled(
  enabled: readonly AgentToolName[],
  task: BotTask,
  on: boolean,
  visible: ToolFilter,
  tasks: readonly BotTask[] = BOT_TASKS,
): AgentToolName[] {
  // Nothing to switch: the Bot does these whatever the list holds.
  if (task.alwaysOn) return [...enabled];
  const tools = botTaskTools(task, visible);
  if (on) return [...enabled, ...tools.filter((tool) => !enabled.includes(tool))];
  const current = new Set(enabled);
  const stillNeeded = new Set(
    tasks
      .filter(
        (other) =>
          other.id !== task.id && !other.alwaysOn && isBotTaskEnabled(other, current, visible),
      )
      .flatMap((other) => botTaskTools(other, visible)),
  );
  return enabled.filter((tool) => !tools.includes(tool) || stillNeeded.has(tool));
}
