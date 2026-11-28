/**
 * Bo's first conversation: state that survives a reload, and the small text
 * helpers its answers need. The component (BoOnboarding) owns the requests.
 *
 * Only the Bot id, the step, whether this conversation asks for the business
 * name, and the owner's one-line business description (which the web lookup
 * needs after a reload) are kept, in this tab's session storage under the
 * signed-in account. Finishing clears them.
 */
import { PLAYBOOK_LIMITS } from "./agent-playbook";

export const BO_ONBOARDING_STEPS = [
  "name",
  "about",
  "website",
  "questions",
  "checks",
  "done",
] as const;
export type BoOnboardingStep = (typeof BO_ONBOARDING_STEPS)[number];
export type BoOnboardingState = {
  agentId: string;
  step: BoOnboardingStep;
  business?: string;
  /** Set when the conversation opened by asking for the business name. */
  asksName?: boolean;
};

/**
 * The questions, in order; "done" is the hand-off. The business name comes
 * first when the workspace has none, because callers hear it in Bo's first
 * sentence; a personal assistant has no business to name.
 */
export function boQuestionSteps(asksName: boolean): readonly BoOnboardingStep[] {
  return asksName
    ? ["name", "about", "website", "questions", "checks"]
    : ["about", "website", "questions", "checks"];
}

/** The company profile holds a business name of at most this many characters. */
export const BO_BUSINESS_NAME_MAX_CHARS = 120;

/** A business name as the company profile stores it: one line, single spaces. */
export function cleanBusinessName(raw: string): string {
  return raw.replace(/\s+/g, " ").trim().slice(0, BO_BUSINESS_NAME_MAX_CHARS).trim();
}

const STATE_PREFIX = "wireline:bo-onboarding:v1:";
/** The web lookup's own limit on how the business is described. */
export const BO_BUSINESS_MAX_CHARS = 600;
/** POST /api/train/extract reads 12,000 characters, prefix included. */
export const BO_ANSWER_MAX_CHARS = 10_000;

/** Starter ids that set up a personal assistant rather than a business one. */
const PERSONAL_TEMPLATE_IDS = new Set(["personal-assistant", "family-concierge"]);

function key(userId: string) {
  return `${STATE_PREFIX}${encodeURIComponent(userId)}`;
}

export function readBoOnboarding(userId: string | null | undefined): BoOnboardingState | null {
  if (!userId) return null;
  try {
    const raw = sessionStorage.getItem(key(userId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<BoOnboardingState>;
    if (typeof parsed?.agentId !== "string" || !parsed.agentId) return null;
    if (!BO_ONBOARDING_STEPS.includes(parsed.step as BoOnboardingStep)) return null;
    return {
      agentId: parsed.agentId,
      step: parsed.step as BoOnboardingStep,
      ...(typeof parsed.business === "string"
        ? { business: parsed.business.slice(0, BO_BUSINESS_MAX_CHARS) }
        : {}),
      ...(typeof parsed.asksName === "boolean" ? { asksName: parsed.asksName } : {}),
    };
  } catch {
    return null;
  }
}

/** Clear every other account's conversation state (all of it when signed out). */
export function keepOnlyBoOnboardingOf(userId: string | null): void {
  const keep = userId ? key(userId) : null;
  try {
    for (let index = sessionStorage.length - 1; index >= 0; index -= 1) {
      const stored = sessionStorage.key(index);
      if (stored?.startsWith(STATE_PREFIX) && stored !== keep) sessionStorage.removeItem(stored);
    }
  } catch {
    // Browser storage can be denied; there is then nothing stored to clear.
  }
}

export function writeBoOnboarding(userId: string, state: BoOnboardingState): void {
  try {
    sessionStorage.setItem(key(userId), JSON.stringify(state));
  } catch {
    // Without storage the conversation still works; a reload starts at Workspace.
  }
}

export function clearBoOnboarding(userId: string | null | undefined): void {
  if (!userId) return;
  try {
    sessionStorage.removeItem(key(userId));
  } catch {
    // Nothing stored to clear.
  }
}

/** A personal assistant only when the visitor came from a personal starter link. */
export function isPersonalStarter(...templateIds: Array<string | null | undefined>): boolean {
  return templateIds.some((id) => Boolean(id && PERSONAL_TEMPLATE_IDS.has(id)));
}

/**
 * "riveraplumbing.com" and "https://riveraplumbing.com/about" both read as a
 * website; anything that is not a public HTTPS address does not.
 */
export function normalizeWebsiteUrl(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed || /\s/.test(trimmed)) return null;
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const url = new URL(withScheme);
    if (url.protocol === "http:") url.protocol = "https:";
    if (url.protocol !== "https:" || !url.hostname.includes(".") || url.username || url.password)
      return null;
    return url.toString();
  } catch {
    return null;
  }
}

/**
 * "Check with me first" items in the owner's words: one per line or per
 * semicolon, list markers removed, duplicates dropped, within Playbook limits.
 */
export function splitCheckFirst(text: string): string[] {
  const seen = new Set<string>();
  const items: string[] = [];
  for (const part of text.split(/[\n;]+/)) {
    const item = part
      .replace(/^\s*(?:[-*•]|\d+[.)])\s*/, "")
      .trim()
      .slice(0, PLAYBOOK_LIMITS.itemChars);
    const id = item.toLowerCase();
    if (!item || seen.has(id)) continue;
    seen.add(id);
    items.push(item);
  }
  return items.slice(0, PLAYBOOK_LIMITS.checkFirst);
}

/** Saved items first, new ones after, without repeats, within the Playbook limit. */
export function mergeCheckFirst(saved: readonly string[], added: readonly string[]): string[] {
  const seen = new Set(saved.map((item) => item.toLowerCase()));
  const merged = [...saved];
  for (const item of added) {
    if (seen.has(item.toLowerCase())) continue;
    seen.add(item.toLowerCase());
    merged.push(item);
  }
  return merged.slice(0, PLAYBOOK_LIMITS.checkFirst);
}
