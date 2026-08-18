import {
  BOT_CHANNELS,
  BOT_ROLE_TEMPLATES,
  type BotChannelKey,
  type BotDirection,
} from "./bot-product";

export const UNIFIED_WORKSPACE_KIND = "unified" as const;

export type BotChannelConfiguration = Record<
  BotChannelKey,
  {
    enabled: boolean;
    instructions: string;
  }
>;

export type BotConfigurationDraft = {
  workspaceKind: typeof UNIFIED_WORKSPACE_KIND;
  templateKey: (typeof BOT_ROLE_TEMPLATES)[number]["key"];
  name: string;
  role: string;
  objective: string;
  direction: BotDirection;
  channels: BotChannelConfiguration;
  knowledgeBrief: string;
  toolsBrief: string;
  approvalBrief: string;
  handoffBrief: string;
};

const DEFAULT_CHANNELS: BotChannelConfiguration = {
  voice: {
    enabled: true,
    instructions:
      "Answer naturally, identify the need, complete the next step, and recap the outcome.",
  },
  text: {
    enabled: true,
    instructions:
      "Continue approved conversations, confirm details, and honor opt-outs immediately.",
  },
  email: {
    enabled: true,
    instructions:
      "Reply clearly, preserve context, and keep commitments inside the approved policy.",
  },
};

function cloneDefaultChannels(): BotChannelConfiguration {
  return {
    voice: { ...DEFAULT_CHANNELS.voice },
    text: { ...DEFAULT_CHANNELS.text },
    email: { ...DEFAULT_CHANNELS.email },
  };
}

export function getBotTemplate(templateKey: string) {
  return (
    BOT_ROLE_TEMPLATES.find((template) => template.key === templateKey) ??
    BOT_ROLE_TEMPLATES.find((template) => template.key === "custom")!
  );
}

export function createBotConfiguration(
  templateKey: (typeof BOT_ROLE_TEMPLATES)[number]["key"] = "custom",
  overrides: Partial<BotConfigurationDraft> = {},
): BotConfigurationDraft {
  const template = getBotTemplate(templateKey);
  const role = template.key === "custom" ? "Custom Role" : template.name;

  return {
    workspaceKind: UNIFIED_WORKSPACE_KIND,
    templateKey: template.key,
    name: template.key === "custom" ? "My Bot" : `${template.name} Bot`,
    role,
    objective: template.summary,
    direction: template.direction,
    channels: cloneDefaultChannels(),
    knowledgeBrief: "Use only the knowledge and policies approved in this workspace.",
    toolsBrief: "Connect the tools this role needs to complete its job.",
    approvalBrief:
      "Ask for approval before sensitive, financial, legal, or irreversible actions.",
    handoffBrief:
      "Escalate with the conversation context, requested next step, and urgency intact.",
    ...overrides,
    channels: overrides.channels ?? cloneDefaultChannels(),
  };
}

export function enabledBotChannels(configuration: BotConfigurationDraft): BotChannelKey[] {
  return BOT_CHANNELS.filter(({ key }) => configuration.channels[key].enabled).map(
    ({ key }) => key,
  );
}

export function validateBotConfiguration(configuration: BotConfigurationDraft): string[] {
  const errors: string[] = [];

  if (!configuration.name.trim()) errors.push("Give the Bot a name.");
  if (!configuration.role.trim()) errors.push("Define the Bot's role.");
  if (!configuration.objective.trim()) errors.push("Define the Bot's objective.");
  if (enabledBotChannels(configuration).length === 0) {
    errors.push("Turn on at least one channel: voice, text, or email.");
  }
  if (!configuration.handoffBrief.trim()) {
    errors.push("Define when and how the Bot should hand work to a person.");
  }

  return errors;
}

export function botConfigurationSummary(configuration: BotConfigurationDraft): string {
  const channels = enabledBotChannels(configuration)
    .map((key) => BOT_CHANNELS.find((channel) => channel.key === key)?.label ?? key)
    .join(", ");

  return `${configuration.name}: ${configuration.role}. Channels: ${channels || "none"}.`;
}
