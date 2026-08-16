// ────────────────────────────────────────────────────────────────────────
//  Customer-intel block builder.
//
//  Used by both the inbound and outbound system-prompt builders to weave
//  a "what we already know about this caller" section into the agent's
//  context. A bug here means EVERY call (inbound + outbound) gets bad
//  context, so the helpers are extracted here for unit-test coverage.
//
//  Pure functions. No I/O.
// ────────────────────────────────────────────────────────────────────────

/**
 * Extract the intel payload from a `customer_profile_captured` task
 * description. The producer side stores them as
 *
 *   "[CUSTOMER PROFILE] <phone> — <intel>"
 *
 * Splitting on " — " (em-dash with spaces) is intentionally simple so
 * the helper stays resilient to phone-number format changes.
 *
 * Returns:
 *   - "" for null / undefined / empty / whitespace input
 *   - the trimmed text after the first " — " separator
 *   - the trimmed input itself if no separator is present (assume the
 *     caller already passed the intel portion only)
 */
export function extractCapturedProfileIntel(description: string | null | undefined): string {
  if (description == null) return "";
  if (typeof description !== "string") return "";
  const trimmed = description.trim();
  if (!trimmed) return "";
  const sep = " — ";
  const idx = trimmed.indexOf(sep);
  return idx >= 0 ? trimmed.slice(idx + sep.length).trim() : trimmed;
}

/**
 * Build a CUSTOMER INTEL block to inject into agent system prompts.
 * Returns an empty string when there's no intel — the system-prompt
 * template uses an empty fallback so we don't get a header with no body.
 *
 * `isOutbound` switches the closing call-to-action: outbound agents
 * should use the intel to demonstrate continuity from a prior call;
 * inbound agents should weave it in naturally as context.
 */
export function buildCustomerIntelBlock(
  rawDescription: string | null | undefined,
  isOutbound = false,
): string {
  const intel = extractCapturedProfileIntel(rawDescription);
  if (!intel) return "";
  return isOutbound
    ? `## ⚡ CUSTOMER INTEL, FROM PREVIOUS CALLS\n${intel}\nUSE THIS: This contact has shared this intel before. Reference it naturally to show continuity and build immediate trust.`
    : `## ⚡ CUSTOMER INTEL, FROM PREVIOUS CALLS\n${intel}\nUSE THIS: Weave this context in naturally. It tells you what this contact cares about and where they stand.`;
}
