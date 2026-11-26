/**
 * The create flow wraps the owner's first brief in setup lines ("Starter:",
 * "Conversation direction:", "Configurable channels:"). They describe how the
 * Bot was created, not the business, and the training extractor used to save
 * them as Knowledge, where owners saw "Role starter: Front Desk." among their
 * facts and every prompt carried them.
 */
const CREATE_SCAFFOLD_LINE =
  /^\s*(role starter|starter|conversation direction|configurable channels)\s*:/i;

export function isCreateScaffoldLine(content: string): boolean {
  return CREATE_SCAFFOLD_LINE.test(content);
}
