/** Session key for non-fatal warnings after Fast Start agent creation. */
export const CREATE_WARNING_SESSION_KEY = "wireline:create-warning";

/** Post-create wizard payload — Train → Channels → Wire → Test after Fast Start. */
export const POST_CREATE_WIZARD_KEY = "wireline:post-create-wizard";
export const POST_CREATE_WIZARD_STEP_KEY = "wireline:post-create-wizard-step";

export type PostCreateWizardStep = "train" | "channels" | "wire" | "test";

export type PostCreateWizardPayload = {
  agentId: string;
  agentName: string;
  /** User checked "Provision number" during Fast Start. */
  phoneProvisionRequested: boolean;
  /** Provision succeeded during create (false when gated or skipped). */
  phoneProvisioned: boolean;
};

export function stashPostCreateWizard(payload: PostCreateWizardPayload): void {
  try {
    sessionStorage.setItem(POST_CREATE_WIZARD_KEY, JSON.stringify(payload));
    sessionStorage.setItem(POST_CREATE_WIZARD_STEP_KEY, "train");
  } catch {
    /* ignore quota / private mode */
  }
}

/** Read wizard payload without clearing — survives refresh and cross-route navigation. */
export function readPostCreateWizard(): PostCreateWizardPayload | null {
  try {
    const raw = sessionStorage.getItem(POST_CREATE_WIZARD_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PostCreateWizardPayload;
    if (!parsed?.agentId || !parsed?.agentName) return null;
    return parsed;
  } catch {
    return null;
  }
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
    if (step === "train" || step === "channels" || step === "wire" || step === "test") {
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
