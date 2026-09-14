import { isBotMarkKey, type BotMarkKey } from "./bot-mark";

/** Session key for non-fatal warnings after Fast Start agent creation. */
export const CREATE_WARNING_SESSION_KEY = "wireline:create-warning";

/** Post-create wizard payload — Train → Test → Launch after create.
 *  Private rehearsal comes before paid number provisioning.
 *  "wire" and "channels" survive in the step type only as legacy stored
 *  values. The wizard coerces them on mount; no live path renders them. */
export const POST_CREATE_WIZARD_KEY = "wireline:post-create-wizard";
export const POST_CREATE_WIZARD_STEP_KEY = "wireline:post-create-wizard-step";

export type PostCreateWizardStep = "train" | "channels" | "wire" | "test" | "launch";

export type PostCreateWizardPayload = {
  agentId: string;
  agentName: string;
  /** New guides are bound to the signed-in account, including their recovery brief. */
  ownerId?: string;
  /** Keep an unapplied starting brief available for an explicit retry on this Bot. */
  pendingBrief?: string;
  /** Persisted Bot identity returned by the create boundary. Optional for legacy sessions. */
  markKey?: BotMarkKey | null;
  /** BotBound attempted the managed phone identity after the Bot record committed. */
  phoneProvisionRequested: boolean;
  /** A managed line is already assigned to this Bot. */
  phoneProvisioned: boolean;
  /** Paid activation is the only known blocker to automatic phone provisioning. */
  phoneActivationRequired?: boolean;
  /** Assigned line when the bootstrap response returned it. */
  phoneNumber?: string | null;
  /** BotBound attempted the managed mailbox after the Bot record committed. */
  emailProvisionRequested?: boolean;
  /** A managed mailbox is already bound to this Bot. */
  emailProvisioned?: boolean;
  /** Assigned managed mailbox address. */
  emailAddress?: string | null;
  /** True only when the provider confirmed the configured custom domain was used. */
  emailCustomDomain?: boolean;
  /** One responsive bootstrap attempt completed; durable paid repair owns retries. */
  identityBootstrapComplete?: boolean;
};

function persistPostCreateWizardPayload(payload: PostCreateWizardPayload): void {
  sessionStorage.setItem(POST_CREATE_WIZARD_KEY, JSON.stringify(payload));
}

/** Start a fresh post-create guide at Train. */
export function stashPostCreateWizard(payload: PostCreateWizardPayload & { ownerId: string }): void {
  try {
    persistPostCreateWizardPayload(payload);
    sessionStorage.setItem(POST_CREATE_WIZARD_STEP_KEY, "train");
  } catch {
    /* ignore quota / private mode */
  }
}

/** Update background provisioning state without moving the user's current step.
 * A finished request must never reopen a dismissed guide or replace another Bot. */
export function updatePostCreateWizard(payload: PostCreateWizardPayload): boolean {
  try {
    const current = readPostCreateWizard();
    if (current?.agentId !== payload.agentId) return false;
    // Identity setup can finish after a brief retry. Its older snapshot must
    // neither restore a saved brief nor replace the user's latest edits.
    persistPostCreateWizardPayload({ ...payload, pendingBrief: current.pendingBrief });
    return true;
  } catch {
    /* ignore quota / private mode */
    return false;
  }
}

/** Change only the current Bot's brief; never reopen a guide or reset its step. */
export function updatePostCreateBrief(agentId: string, pendingBrief: string | null): boolean {
  try {
    const current = readPostCreateWizard();
    if (current?.agentId !== agentId) return false;
    persistPostCreateWizardPayload({ ...current, pendingBrief: pendingBrief ?? undefined });
    return true;
  } catch {
    return false;
  }
}

/** Parse the session boundary and reject stale or forged identity keys. */
export function parsePostCreateWizardPayload(raw: string | null): PostCreateWizardPayload | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as PostCreateWizardPayload & { markKey?: unknown };
    if (!parsed?.agentId || !parsed?.agentName) return null;
    return {
      ...parsed,
      ownerId: typeof parsed.ownerId === "string" ? parsed.ownerId : undefined,
      pendingBrief: typeof parsed.pendingBrief === "string" ? parsed.pendingBrief : undefined,
      markKey: isBotMarkKey(parsed.markKey) ? parsed.markKey : null,
    };
  } catch {
    return null;
  }
}

/** Read wizard payload without clearing — survives refresh and cross-route navigation. */
export function readPostCreateWizard(): PostCreateWizardPayload | null {
  try {
    return parsePostCreateWizardPayload(sessionStorage.getItem(POST_CREATE_WIZARD_KEY));
  } catch {
    return null;
  }
}

/** A browser tab can outlive a login. Never display another account's brief. */
export function readPostCreateWizardForOwner(
  ownerId: string | null | undefined,
): PostCreateWizardPayload | null {
  if (!ownerId) return null;
  const payload = readPostCreateWizard();
  if (!payload) return null;
  if (payload.ownerId === ownerId) return payload;
  clearPostCreateWizard();
  return null;
}

export function stashPostCreateWizardStep(step: PostCreateWizardStep): void {
  try {
    sessionStorage.setItem(POST_CREATE_WIZARD_STEP_KEY, step);
  } catch {
    /* ignore */
  }
}

export function readPostCreateWizardStep(): PostCreateWizardStep | null {
  try {
    const step = sessionStorage.getItem(POST_CREATE_WIZARD_STEP_KEY);
    if (
      step === "train" ||
      step === "channels" ||
      step === "wire" ||
      step === "test" ||
      step === "launch"
    ) {
      return step;
    }
    return null;
  } catch {
    return null;
  }
}

export function clearPostCreateWizard(): void {
  try {
    sessionStorage.removeItem(POST_CREATE_WIZARD_KEY);
    sessionStorage.removeItem(POST_CREATE_WIZARD_STEP_KEY);
  } catch {
    /* ignore */
  }
}

/** @deprecated Use readPostCreateWizard + clearPostCreateWizard on dismiss. */
export function consumePostCreateWizard(): PostCreateWizardPayload | null {
  const payload = readPostCreateWizard();
  if (payload) clearPostCreateWizard();
  return payload;
}

export function stashCreateWarning(message: string): void {
  try {
    sessionStorage.setItem(CREATE_WARNING_SESSION_KEY, message);
  } catch {
    /* ignore quota / private mode */
  }
}

/** Read once and clear — used by Studio on landing after create redirect. */
export function consumeCreateWarning(): string | null {
  try {
    const message = sessionStorage.getItem(CREATE_WARNING_SESSION_KEY);
    if (message) sessionStorage.removeItem(CREATE_WARNING_SESSION_KEY);
    return message;
  } catch {
    return null;
  }
}
