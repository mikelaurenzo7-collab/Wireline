import { BOT_MARK_IDENTITY_CAPACITY } from "./bot-mark";

/** Maximum paid add-on quantity offered by the BotBound catalog. */
export const MAX_EXTRA_AGENT_ADDONS = 100;

function nonNegativeInteger(value: number | null | undefined): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return 0;
  return Math.max(0, Math.floor(value));
}

/** Keep every persisted or advertised Bot allowance inside the identity namespace. */
export function clampAgentCapacity(value: number | null | undefined): number {
  return Math.min(BOT_MARK_IDENTITY_CAPACITY, nonNegativeInteger(value));
}

/** Keep paid add-ons inside the published Stripe quantity boundary. */
export function clampExtraAgentAddons(value: number | null | undefined): number {
  return Math.min(MAX_EXTRA_AGENT_ADDONS, nonNegativeInteger(value));
}
