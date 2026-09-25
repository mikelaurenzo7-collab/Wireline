export const SHOWCASE_DOMAIN_REFRESH_VERSION = "botbound-app-2026-09-25";

const LEGACY_HANDOFF =
  "- If the caller asks for a human, a manager, or a callback: do not pretend one is coming. Warmly explain this is a live demo of BotBound, then offer a real next step: email them a signup link, or point them to botbound.me to create a Bot and add Runtime Balance when ready for live calls.";
const CURRENT_HANDOFF = LEGACY_HANDOFF.replace("botbound.me", "botbound.app");

/** Refresh only the exact managed handoff sentence; never reseed a saved prompt. */
export function planShowcaseDomainRefresh(row) {
  const variables = row.businessVariables;
  const slug = String(row.name || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  if (
    !variables ||
    variables.founder_showcase !== true ||
    row.id !== `founder-showcase:${row.userId}:${slug}`
  ) {
    return { status: "not-managed" };
  }
  const prompt = row.systemPromptOverride;
  if (typeof prompt !== "string") return { status: "manual-review" };
  if (!/botbound\.me/i.test(prompt)) return { status: "current" };
  if (
    variables.founder_showcase_kind !== "demo" ||
    variables.founder_showcase_runtime_version !== "openai-realtime-v1-2026-08-29" ||
    prompt.split(/\r?\n/).filter((line) => line === LEGACY_HANDOFF).length !== 1
  ) {
    return { status: "manual-review" };
  }
  const refreshed = prompt.replace(LEGACY_HANDOFF, CURRENT_HANDOFF);
  // A customized old-domain instruction elsewhere needs an explicit review.
  if (/botbound\.me/i.test(refreshed)) return { status: "manual-review" };
  return {
    status: "refresh",
    systemPromptOverride: refreshed,
    businessVariables: {
      ...variables,
      founder_showcase_domain_version: SHOWCASE_DOMAIN_REFRESH_VERSION,
    },
  };
}

/** The same cutover also refreshes exact legacy website defaults on founder Bots. */
export function planFounderDomainRefresh(row) {
  if (row.businessVariables?.founder_showcase === true) return planShowcaseDomainRefresh(row);
  if (row.businessVariables?.founder_fleet_seed !== true || !/^founder-[a-z0-9-]+$/.test(row.id))
    return { status: "not-managed" };
  const website = row.websiteUrl;
  if (typeof website !== "string" || !/botbound\.me/i.test(website)) return { status: "current" };
  if (!["https://botbound.me", "https://botbound.me/"].includes(website)) {
    return { status: "manual-review" };
  }
  return {
    status: "refresh",
    websiteUrl: website.replace("botbound.me", "botbound.app"),
    businessVariables: {
      ...row.businessVariables,
      founder_site_domain_version: SHOWCASE_DOMAIN_REFRESH_VERSION,
    },
  };
}
