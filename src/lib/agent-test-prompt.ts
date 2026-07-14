export const AGENT_TEST_MAX_SYSTEM_CHARS = 16_000;
export const AGENT_TEST_MAX_USER_CHARS = 8_000;
export const AGENT_TEST_MAX_PROMPT_CHARS = AGENT_TEST_MAX_SYSTEM_CHARS + AGENT_TEST_MAX_USER_CHARS;
export const AGENT_TEST_MAX_HISTORY_MESSAGE_CHARS = 1_600;

export type AgentTestHistoryMessage = {
  role: "customer" | "employee";
  content: string;
};

type AgentTestPromptInput = {
  systemSections: Array<string | null | undefined>;
  history: AgentTestHistoryMessage[];
  customerMessage: string;
  employeeName: string;
};

export type BoundedAgentTestPrompt = {
  system: string;
  user: string;
  totalChars: number;
  includedHistoryMessages: number;
};

function clean(value: string | null | undefined): string {
  return value?.trim() || "";
}

function clip(value: string, maxChars: number): string {
  if (value.length <= maxChars) return value;
  return value.slice(0, maxChars).trimEnd();
}

function joinWithinBudget(sections: Array<string | null | undefined>, maxChars: number): string {
  const included: string[] = [];
  let used = 0;

  for (const rawSection of sections) {
    const section = clean(rawSection);
    if (!section) continue;

    const separatorChars = included.length ? 2 : 0;
    const available = maxChars - used - separatorChars;
    if (available <= 0) break;

    const bounded = clip(section, available);
    if (!bounded) continue;
    included.push(bounded);
    used += separatorChars + bounded.length;
  }

  return included.join("\n\n");
}

function renderUserPrompt(historyLines: string[], customerLine: string): string {
  if (!historyLines.length) return customerLine;
  return `Conversation so far:\n${historyLines.join("\n")}\n\n${customerLine}`;
}

/**
 * Build the private browser-roleplay prompt inside a fixed character budget.
 * Current customer input is always preserved; newest history wins when older
 * context no longer fits. Character limits are deterministic across providers.
 */
export function buildBoundedAgentTestPrompt(input: AgentTestPromptInput): BoundedAgentTestPrompt {
  const system = joinWithinBudget(input.systemSections, AGENT_TEST_MAX_SYSTEM_CHARS);
  const customerLine = `Customer: ${clip(clean(input.customerMessage), AGENT_TEST_MAX_USER_CHARS - 10)}`;
  const employeeName = clean(input.employeeName) || "Employee";
  let selectedHistory: string[] = [];

  for (let index = input.history.length - 1; index >= 0; index -= 1) {
    const message = input.history[index];
    const content = clip(clean(message.content), AGENT_TEST_MAX_HISTORY_MESSAGE_CHARS);
    if (!content) continue;
    const speaker = message.role === "customer" ? "Customer" : employeeName;
    const candidate = [`${speaker}: ${content}`, ...selectedHistory];
    if (renderUserPrompt(candidate, customerLine).length > AGENT_TEST_MAX_USER_CHARS) break;
    selectedHistory = candidate;
  }

  const user = renderUserPrompt(selectedHistory, customerLine);
  return {
    system,
    user,
    totalChars: system.length + user.length,
    includedHistoryMessages: selectedHistory.length,
  };
}
