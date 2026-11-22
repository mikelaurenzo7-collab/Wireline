/**
 * One Bot and one line per business is the default. The Bot takes on more
 * work through tasks, not through more Bots. A second Bot stays possible as an
 * advanced choice, and workspaces that already run several keep their roster.
 */

/** The only link that opens Bot creation when a workspace already has one. */
export const ANOTHER_BOT_HREF = "/studio?create=1&another=1";

/** Offer "add a Bot" with no Bot yet, or to a workspace that already runs several. */
export function canOfferAnotherBot(botCount: number): boolean {
  return botCount === 0 || botCount >= 2;
}

/**
 * A create request opens the existing Bot instead, unless the owner chose
 * Advanced > Add another Bot or the workspace already runs several Bots.
 */
export function shouldOpenExistingBot(input: {
  createRequested: boolean;
  anotherRequested: boolean;
  botCount: number;
}): boolean {
  return input.createRequested && !input.anotherRequested && !canOfferAnotherBot(input.botCount);
}

/** One line per business: another line is for a workspace without one, or one running several Bots. */
export function canOfferAnotherLine(input: { lineCount: number; botCount: number }): boolean {
  return input.lineCount === 0 || input.botCount >= 2;
}
