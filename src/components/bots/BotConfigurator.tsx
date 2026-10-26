import { BOT_CHANNELS, type BotChannelKey } from "../../lib/bot-product";
import { type BotConfigurationDraft } from "../../lib/bot-configuration";
import { Checkbox } from "../ui/shadcn/Checkbox";

export type BotConfiguratorProps = {
  value: BotConfigurationDraft;
  onChange: (next: BotConfigurationDraft) => void;
  disabled?: boolean;
};

const CONFIGURATION_TEXT_FIELDS = [
  {
    key: "knowledgeBrief" as const,
    label: "Knowledge",
    placeholder: "What approved information should the Bot use?",
  },
  {
    key: "toolsBrief" as const,
    label: "Tools and Actions",
    placeholder: "What systems can the Bot read or change?",
  },
  {
    key: "approvalBrief" as const,
    label: "Approvals",
    placeholder: "What must a person approve first?",
  },
  {
    key: "handoffBrief" as const,
    label: "Handoffs",
    placeholder: "When and how should the Bot escalate?",
  },
] as const;

function updateChannel(
  value: BotConfigurationDraft,
  channel: BotChannelKey,
  patch: Partial<BotConfigurationDraft["channels"][BotChannelKey]>,
): BotConfigurationDraft {
  return {
    ...value,
    channels: {
      ...value.channels,
      [channel]: {
        ...value.channels[channel],
        ...patch,
      },
    },
  };
}

export default function BotConfigurator({
  value,
  onChange,
  disabled = false,
}: BotConfiguratorProps) {
  const visibleChannels = BOT_CHANNELS.filter(
    (channel) => channel.key !== "text" || value.channels.text.enabled,
  );
  const setField = <Key extends keyof BotConfigurationDraft>(
    key: Key,
    next: BotConfigurationDraft[Key],
  ) => onChange({ ...value, [key]: next });

  return (
    <section
      className="space-y-6 rounded-[var(--radius-xl)] border border-border bg-card p-5 sm:p-6"
      aria-labelledby="bot-configurator-title"
      data-bot-configurator
    >
      <header className="max-w-2xl">
        <p className="wl-eyebrow text-primary">Bot Configuration</p>
        <h2 id="bot-configurator-title" className="mt-2 text-xl font-semibold text-foreground">
          Define the Job. Choose the Channels
        </h2>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          Choose the calls, email, knowledge, and tools your Bot needs.
        </p>
      </header>

      <div className="grid gap-4">
        <label className="space-y-2 text-sm font-medium text-foreground">
          Bot Name
          <input
            value={value.name}
            disabled={disabled}
            onChange={(event) => setField("name", event.target.value)}
            placeholder="e.g. Nora or Alex"
            className="min-h-11 w-full rounded-xl border border-border bg-background px-3 text-sm"
          />
        </label>

        <label className="space-y-2 text-sm font-medium text-foreground">
          Role
          <input
            value={value.role}
            disabled={disabled}
            onChange={(event) => setField("role", event.target.value)}
            placeholder="Front Desk"
            className="min-h-11 w-full rounded-xl border border-border bg-background px-3 text-sm"
          />
        </label>

        <label className="space-y-2 text-sm font-medium text-foreground">
          Conversation Direction
          <select
            value={value.direction}
            disabled={disabled}
            onChange={(event) =>
              setField("direction", event.target.value as BotConfigurationDraft["direction"])
            }
            className="min-h-11 w-full rounded-xl border border-border bg-background px-3 text-sm"
          >
            <option value="inbound">Incoming Calls</option>
            <option value="outbound">Reviewed Outgoing Calls</option>
            <option value="hybrid">Incoming and Reviewed Calls</option>
          </select>
        </label>
      </div>

      <label className="block space-y-2 text-sm font-medium text-foreground">
        Objective
        <textarea
          value={value.objective}
          disabled={disabled}
          onChange={(event) => setField("objective", event.target.value)}
          rows={3}
          placeholder="Describe what this Bot should accomplish and how success is measured."
          className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm leading-6"
        />
      </label>

      <fieldset className="space-y-3">
        <legend className="text-sm font-semibold text-foreground">Channels</legend>
        <p className="text-sm leading-6 text-muted-foreground">
          Each channel keeps its own instructions.
        </p>
        <div
          className={`grid gap-3 ${visibleChannels.length === 3 ? "lg:grid-cols-3" : "lg:grid-cols-2"}`}
        >
          {visibleChannels.map((channel) => {
            const channelValue = value.channels[channel.key];
            return (
              <article
                key={channel.key}
                className="rounded-xl border border-border bg-background p-4"
              >
                <label className="flex min-h-11 cursor-pointer items-center justify-between gap-3">
                  <span>
                    <strong className="block text-sm text-foreground">{channel.label}</strong>
                    <small className="mt-1 block leading-5 text-muted-foreground">
                      {channel.description}
                    </small>
                  </span>
                  <Checkbox
                    checked={channelValue.enabled}
                    disabled={disabled}
                    aria-label={`${channel.label} enabled`}
                    onChange={(event) =>
                      onChange(updateChannel(value, channel.key, { enabled: event.target.checked }))
                    }
                  />
                </label>
                <label className="mt-3 block space-y-2 text-xs font-semibold text-foreground">
                  {channel.label} Instructions
                  <textarea
                    value={channelValue.instructions}
                    disabled={disabled || !channelValue.enabled}
                    onChange={(event) =>
                      onChange(
                        updateChannel(value, channel.key, { instructions: event.target.value }),
                      )
                    }
                    rows={4}
                    className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm font-normal leading-5 disabled:opacity-50"
                  />
                </label>
              </article>
            );
          })}
        </div>
      </fieldset>

      <div className="grid gap-4 lg:grid-cols-2">
        {CONFIGURATION_TEXT_FIELDS.map((field) => (
          <label key={field.key} className="space-y-2 text-sm font-medium text-foreground">
            {field.label}
            <textarea
              value={value[field.key]}
              disabled={disabled}
              onChange={(event) => setField(field.key, event.target.value)}
              rows={3}
              placeholder={field.placeholder}
              className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm leading-6"
            />
          </label>
        ))}
      </div>
    </section>
  );
}
