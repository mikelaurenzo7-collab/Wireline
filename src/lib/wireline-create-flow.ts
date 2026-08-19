/** Session key for non-fatal warnings after Fast Start agent creation. */
export const CREATE_WARNING_SESSION_KEY = "wireline:create-warning";

/** Post-create wizard payload — Train → Wire → Test after Fast Start.
 *  ("channels" survives in the step type only as a legacy stored value that
 *  the wizard coerces to "wire" on mount; no live path renders it.) */
export const POST_CREATE_WIZARD_KEY = "wireline:post-create-wizard";
export const POST_CREATE_WIZARD_STEP_KEY = "wireline:post-create-wizard-step";

export type PostCreateWizardStep = "train" | "channels" | "wire" | "test";

export type PostCreateWizardPayload = {
  agentId: string;
  agentName: string;
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
  /** One full managed phone+mail bootstrap attempt completed for this Bot. */
  identityBootstrapComplete?: boolean;
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
