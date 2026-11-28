/**
 * One Bot (Bo) and one line per business. Bo takes on more work through tasks,
 * not through more Bots, so the product offers no way to add another Bot.
 * Workspaces that already run several keep their roster.
 */

/** One line per business: another line is for a workspace without one, or one running several Bots. */
export function canOfferAnotherLine(input: { lineCount: number; botCount: number }): boolean {
  return input.lineCount === 0 || input.botCount >= 2;
}
