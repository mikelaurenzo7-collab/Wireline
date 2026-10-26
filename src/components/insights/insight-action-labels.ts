const KNOWN_ACTION_LABELS = new Map([
  ["computer.browser", "Computer Browsing"],
  ["computer.browse", "Computer Browsing"],
  ["training.training", "Knowledge Training"],
  ["train-extract", "Knowledge Training"],
  ["training.asset_text", "Text Upload"],
  ["training.asset_image", "Image Upload"],
  ["training.asset_document", "Document Upload"],
  ["training.google_drive", "Google Drive Import"],
  ["website-knowledge.import", "Website Import"],
  ["jobs.post_call_enrichment", "Call Processing"],
  ["jobs.post_call_artifact", "Call Summary"],
  ["jobs.auto_qa_score", "Call Review"],
]);

/** Display only: retain the original action key and its measured rows. */
export function insightActionLabel(action: string): string {
  const known = KNOWN_ACTION_LABELS.get(action);
  if (known) return known;
  if (/^workspace\.api\.agents\.[^.]+\.workspace\.messages(?:\.stream)?$/.test(action))
    return "Bot Chat";
  if (/^workspace\.api\.agents\.[^.]+\.workspace\.files$/.test(action)) return "Knowledge Upload";
  if (/^agent-test\.api\.agents\.[^.]+\.test(?:\.stream)?$/.test(action)) return "Bot Rehearsal";

  // Unknown operations keep their meaningful path words; omit only routing
  // plumbing and UUIDs instead of collapsing everything to an action prefix.
  const words = action
    .replace(/(?:agent-)?[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, "")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .split(/[./_\s-]+/)
    .filter((word) => word && word.toLowerCase() !== "api")
    .filter(
      (word, index, parts) => index === 0 || word.toLowerCase() !== parts[index - 1].toLowerCase(),
    );
  return (
    words.map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(" ") || "Other Activity"
  );
}
